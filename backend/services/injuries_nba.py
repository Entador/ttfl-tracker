"""
Official NBA injury report service.

Fetches the latest injury report PDF from official.nba.com and parses
player injury statuses from it.

PDF URL pattern:
  https://ak-static.cms.nba.com/referee/injury/Injury-Report_YYYY-MM-DD_HH_MMam.pdf
"""

import io
import re
import unicodedata
from datetime import datetime

import httpx
import pdfplumber
from sqlalchemy.orm import Session

from models import Player, Team
from utils import normalize_name


NBA_INJURY_PAGE_URL = "https://official.nba.com/nba-injury-report-2025-26-season/"
PDF_URL_PATTERN = re.compile(
    r"https://ak-static\.cms\.nba\.com/referee/injury/Injury-Report_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})(AM|PM)\.pdf",
    re.IGNORECASE,
)

# Column x-boundaries derived from PDF header positions:
#   GameDate ~23, GameTime ~120, Matchup ~200, Team ~264,
#   PlayerName ~425, CurrentStatus ~586, Reason ~666
COL_TEAM_X_MIN = 255
COL_TEAM_X_MAX = 415
COL_PLAYER_X_MIN = 415
COL_PLAYER_X_MAX = 580
COL_STATUS_X_MIN = 580
COL_STATUS_X_MAX = 660
COL_REASON_X_MIN = 660


def _parse_pdf_time(date_str: str, hour: str, minute: str, ampm: str) -> datetime:
    """Parse PDF filename timestamp into a comparable datetime."""
    time_str = f"{date_str} {hour}:{minute} {ampm.upper()}"
    return datetime.strptime(time_str, "%Y-%m-%d %I:%M %p")


def get_latest_report_url() -> str | None:
    """
    Fetch the NBA injury report page and return the URL of the most recent PDF.
    """
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        response = httpx.get(NBA_INJURY_PAGE_URL, headers=headers, timeout=30)
        response.raise_for_status()

        matches = PDF_URL_PATTERN.findall(response.text)
        if not matches:
            print("No injury report PDFs found on NBA page")
            return None

        # Each match: (date, hour, minute, ampm) - find the most recent
        def sort_key(m):
            return _parse_pdf_time(*m)

        latest = max(matches, key=sort_key)
        date, hour, minute, ampm = latest
        url = f"https://ak-static.cms.nba.com/referee/injury/Injury-Report_{date}_{hour}_{minute}{ampm}.pdf"
        print(f"Latest NBA injury report: {url}")
        return url

    except httpx.HTTPError as e:
        print(f"HTTP error fetching NBA injury page: {e}")
        return None
    except Exception as e:
        print(f"Error fetching NBA injury page: {e}")
        return None


def parse_injury_pdf(pdf_content: bytes) -> tuple[list[dict], set[str]]:
    """
    Parse NBA injury report PDF bytes.

    Returns:
        injuries: list of
            {
                'name': str,    # "Jarrett Allen" (First Last)
                'status': str,  # "Out", "Doubtful", "Questionable", "Probable"
                'reason': str,  # "Injury/Illness-RightKnee;InjuryManagement"
            }
        not_submitted_teams: set of normalized team name keys (no spaces, lowercase)
            for teams that have NOTYETSUBMITTED in the report — their players
            should not have their DB status overridden.
    """
    injuries: list[dict] = []
    not_submitted_teams: set[str] = set()

    with pdfplumber.open(io.BytesIO(pdf_content)) as pdf:
        for page in pdf.pages:
            words = page.extract_words()

            # Find the y-position of the table header row ("GameDate … Reason")
            # so we can ignore the page title above it ("Injury Report: …").
            # On continuation pages the column header isn't repeated, so fall
            # back to the bottom of the "Injury Report:" title line instead.
            header_top = next(
                (w["top"] for w in words if w["text"] == "PlayerName"),
                None,
            )
            if header_top is None:
                # Use the bottom of the page title as the cutoff
                title_words = [w for w in words if w["text"] in ("Injury", "Report:")]
                header_top = max((w["bottom"] for w in title_words), default=70)

            # Partition words into team, player, and status buckets using
            # default tolerance. Reason column uses x_tolerance=1 separately
            # so that visually-spaced words (e.g. "Low Back") are not merged.
            team_words: list[dict] = []
            player_words: list[dict] = []
            status_words: list[dict] = []

            for w in words:
                if w["top"] <= header_top:
                    continue
                x = w["x0"]
                if COL_TEAM_X_MIN <= x < COL_TEAM_X_MAX:
                    team_words.append(w)
                elif COL_PLAYER_X_MIN <= x < COL_PLAYER_X_MAX:
                    player_words.append(w)
                elif COL_STATUS_X_MIN <= x < COL_REASON_X_MIN:
                    status_words.append(w)

            # Extract reason column with tighter tolerance to preserve spaces.
            reason_words: list[dict] = [
                w for w in page.extract_words(x_tolerance=1)
                if w["top"] > header_top and w["x0"] >= COL_REASON_X_MIN
            ]

            # Detect NOTYETSUBMITTED rows: a reason-column word with that text
            # and no player name at the same vertical position.
            player_tops = {pw["top"] for pw in player_words}
            for rw in reason_words:
                if rw["text"] != "NOTYETSUBMITTED":
                    continue
                # No player on the same line → this is a team-level entry
                if not any(abs(rw["top"] - pt) < 12 for pt in player_tops):
                    # Find the team word closest to this row
                    closest_team = min(
                        (tw for tw in team_words),
                        key=lambda tw: abs(tw["top"] - rw["top"]),
                        default=None,
                    )
                    if closest_team:
                        not_submitted_teams.add(_normalize_team_key(closest_team["text"]))

            if not player_words:
                continue

            # Sort players by vertical position
            player_words.sort(key=lambda w: w["top"])

            # For each player, find their status and reason.
            for i, pw in enumerate(player_words):
                player_top = pw["top"]
                next_player_top = player_words[i + 1]["top"] if i + 1 < len(player_words) else float("inf")
                prev_player_top = player_words[i - 1]["top"] if i > 0 else float("-inf")

                # Status: word in status column within ~10pt of player row
                status = None
                for sw in status_words:
                    if abs(sw["top"] - player_top) < 12:
                        status = sw["text"]
                        break

                # Reason: gather all reason-column words that are closer to
                # this player than to any adjacent player.
                midpoint_above = (player_top + prev_player_top) / 2
                midpoint_below = (player_top + next_player_top) / 2

                reason_parts = [
                    rw for rw in reason_words
                    if midpoint_above < rw["top"] <= midpoint_below
                    and rw["text"] != "NOTYETSUBMITTED"
                ]
                reason_parts.sort(key=lambda w: w["top"])
                reason = " ".join(w["text"] for w in reason_parts)

                # Convert "LastName,FirstName" -> "FirstName LastName"
                name = _normalize_player_name(pw["text"])

                injuries.append({
                    "name": name,
                    "status": status,
                    "reason": reason,
                })

    return injuries, not_submitted_teams


def _normalize_team_key(pdf_team_name: str) -> str:
    """
    Normalize a PDF team name for comparison.
    "MiamiHeat" / "Miami Heat" / "miami heat" → "miamiheat"
    """
    return pdf_team_name.lower().replace(" ", "")


_SUFFIX_RE = re.compile(r"(Jr\.|Sr\.|II|III|IV|VI|VII|V)$")


def _normalize_player_name(pdf_name: str) -> str:
    """
    Convert PDF name format to display format.
    "Allen,Jarrett"   -> "Jarrett Allen"
    "MurphyIII,Trey"  -> "Trey Murphy III"
    "MooreJr.,Wendell"-> "Wendell Moore Jr."
    """
    if "," in pdf_name:
        last, first = pdf_name.split(",", 1)
        last = _insert_suffix_space(last)
        return f"{first} {last}".strip()
    return pdf_name.strip()


def _insert_suffix_space(last_name: str) -> str:
    """Insert a space before a name suffix that got concatenated with no space."""
    m = _SUFFIX_RE.search(last_name)
    if m and m.start() > 0 and last_name[m.start() - 1] != " ":
        return last_name[: m.start()] + " " + last_name[m.start() :]
    return last_name


def scrape_nba_injuries() -> tuple[list[dict], set[str]]:
    """
    Fetch the latest NBA official injury report and parse all player statuses.

    Returns:
        (injuries, not_submitted_teams) — see parse_injury_pdf for details.
    """
    url = get_latest_report_url()
    if not url:
        return [], set()

    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        response = httpx.get(url, headers=headers, timeout=30)
        response.raise_for_status()
        return parse_injury_pdf(response.content)

    except httpx.HTTPError as e:
        print(f"HTTP error downloading NBA injury PDF: {e}")
        return [], set()
    except Exception as e:
        print(f"Error parsing NBA injury PDF: {e}")
        return [], set()


def normalize_name(name: str) -> str:
    """Normalize player name for matching (lowercase, remove accents)."""
    normalized = unicodedata.normalize("NFKD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_name.lower().strip()


def update_player_injuries_nba(db: Session) -> dict:
    """
    Fetch NBA official injury report and update player records in the database.

    Players on teams that have NOTYETSUBMITTED in the report are skipped
    entirely — their current DB status is preserved.

    Returns:
        {
            'updated': int,
            'cleared': int,
            'skipped_teams': list,  # teams whose report was not yet submitted
            'not_found': list,
        }
    """
    injuries, not_submitted_teams = scrape_nba_injuries()

    if not injuries and not not_submitted_teams:
        return {"updated": 0, "cleared": 0, "skipped_teams": [], "not_found": [], "error": "No injury data fetched"}

    if not_submitted_teams:
        print(f"  Teams not yet submitted ({len(not_submitted_teams)}): {', '.join(sorted(not_submitted_teams))}")

    # Build name -> injury lookup
    injury_by_name: dict[str, dict] = {}
    for inj in injuries:
        key = normalize_name(inj["name"])
        injury_by_name[key] = inj

    # Build a set of player IDs whose team has not submitted yet.
    # PDF team names are like "MiamiHeat"; DB full_name is "Miami Heat".
    teams = db.query(Team).all()
    skipped_team_names: list[str] = []
    skipped_player_ids: set[int] = set()
    for team in teams:
        if _normalize_team_key(team.full_name) in not_submitted_teams:
            skipped_team_names.append(team.full_name)
            for player in db.query(Player).filter(Player.team_id == team.id).all():
                skipped_player_ids.add(player.id)

    players = db.query(Player).all()

    updated_count = 0
    cleared_count = 0
    matched_keys: set[str] = set()

    for player in players:
        # Skip players whose team hasn't submitted — preserve existing status
        if player.id in skipped_player_ids:
            continue

        key = normalize_name(player.name)
        injury = injury_by_name.get(key)

        if injury:
            matched_keys.add(key)
            new_reason = injury["reason"] if injury["reason"] else None

            if (player.injury_status != injury["status"] or
                    player.injury_details != new_reason):
                player.injury_status = injury["status"]
                player.injury_return_date = None  # NBA report has no return date
                player.injury_details = new_reason
                updated_count += 1
        else:
            # Player not in the report and their team did submit → clear status
            if player.injury_status is not None:
                player.injury_status = None
                player.injury_return_date = None
                player.injury_details = None
                cleared_count += 1

    not_found = [
        inj["name"]
        for inj in injuries
        if normalize_name(inj["name"]) not in matched_keys
    ]

    db.commit()

    return {
        "updated": updated_count,
        "cleared": cleared_count,
        "skipped_teams": skipped_team_names,
        "not_found": not_found,
    }

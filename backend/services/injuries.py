"""
ESPN injury data scraping service.

Fetches injury status from ESPN's NBA injuries page and matches
players to the database by name.
"""

import json
import unicodedata
import httpx
from sqlalchemy.orm import Session

from models import Player


ESPN_INJURIES_URL = "https://www.espn.com/nba/injuries"


def scrape_espn_injuries() -> list[dict]:
    """
    Scrape injury data from ESPN's NBA injuries page.

    Returns:
        List of injury records:
        [{
            'name': str,           # Player name (e.g., "Trae Young")
            'team': str,           # Team name (e.g., "Atlanta Hawks")
            'status': str,         # "Out" or "Day-To-Day"
            'return_date': str,    # "Jan 15", "Week-to-week", etc.
        }]
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        response = httpx.get(ESPN_INJURIES_URL, headers=headers, timeout=30)
        response.raise_for_status()
        html = response.text

        # ESPN embeds injury data as JSON in the page
        # Find "injuries":[ and extract the array with proper bracket matching
        start = html.find('"injuries":[')
        if start == -1:
            print("Could not find injuries data in ESPN page")
            return []

        start_bracket = start + len('"injuries":')
        bracket_count = 0
        end_pos = start_bracket

        for i, c in enumerate(html[start_bracket:]):
            if c == '[':
                bracket_count += 1
            elif c == ']':
                bracket_count -= 1
                if bracket_count == 0:
                    end_pos = start_bracket + i + 1
                    break

        teams_data = json.loads(html[start_bracket:end_pos])

        injuries = []
        for team in teams_data:
            team_name = team.get("displayName", "")

            for injury in team.get("items", []):
                athlete = injury.get("athlete", {})
                player_name = athlete.get("name", "")

                if not player_name:
                    continue

                # Status from statusDesc field (cleaner than type.description)
                status_desc = injury.get("statusDesc", "")

                # Normalize status
                if "out" in status_desc.lower():
                    status = "Out"
                elif "day" in status_desc.lower():
                    status = "Day-To-Day"
                else:
                    status = status_desc

                # Return date: "Jan 15", "Week-to-week", etc.
                return_date = injury.get("date", "")

                # Injury details from description field (ESPN's full injury report)
                # Don't store generic status as details to avoid duplication
                details = injury.get("description", "")
                if details.lower() in ["out", "day-to-day", status_desc.lower()]:
                    details = ""

                injuries.append({
                    "name": player_name,
                    "team": team_name,
                    "status": status,
                    "return_date": return_date,
                    "details": details,
                })

        return injuries

    except httpx.HTTPError as e:
        print(f"HTTP error fetching ESPN injuries: {e}")
        return []
    except json.JSONDecodeError as e:
        print(f"JSON parse error: {e}")
        return []
    except Exception as e:
        print(f"Error scraping ESPN injuries: {e}")
        return []


def normalize_name(name: str) -> str:
    """Normalize player name for matching (lowercase, remove accents)."""
    # Remove accents: é -> e, ć -> c, ū -> u, etc.
    normalized = unicodedata.normalize("NFKD", name)
    ascii_name = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_name.lower().strip()


def update_player_injuries(db: Session) -> dict:
    """
    Fetch ESPN injuries and update player records in the database.

    Uses (name + team) matching to handle homonyms correctly.

    Returns:
        {
            'updated': int,    # Number of players updated
            'cleared': int,    # Number of players cleared (no longer injured)
            'not_found': list, # Player names not matched in DB
        }
    """
    from models import Team

    injuries = scrape_espn_injuries()

    if not injuries:
        return {"updated": 0, "cleared": 0, "not_found": [], "error": "No injury data fetched"}

    # Build lookups:
    # 1. (name, team) -> injury (precise match for homonyms)
    # 2. name -> injury (fallback)
    injury_by_name_team = {}
    injury_by_name = {}
    for inj in injuries:
        name_key = normalize_name(inj["name"])
        team_key = normalize_name(inj["team"])
        injury_by_name_team[(name_key, team_key)] = inj
        injury_by_name[name_key] = inj

    # Get all players with their teams
    players = db.query(Player).all()
    teams = {t.id: t for t in db.query(Team).all()}

    updated_count = 0
    cleared_count = 0
    matched_injury_keys = set()

    for player in players:
        player_name_key = normalize_name(player.name)
        team = teams.get(player.team_id)
        team_key = normalize_name(team.full_name) if team else ""

        # Try precise match (name + team) first, then fallback to name-only
        injury = injury_by_name_team.get((player_name_key, team_key))
        if injury:
            matched_injury_keys.add((player_name_key, team_key))
        else:
            injury = injury_by_name.get(player_name_key)
            if injury:
                matched_injury_keys.add((normalize_name(injury["name"]), normalize_name(injury["team"])))

        if injury:
            # Store empty string as None for consistency
            new_details = injury["details"] if injury["details"] else None

            if (player.injury_status != injury["status"] or
                player.injury_return_date != injury["return_date"] or
                player.injury_details != new_details):
                player.injury_status = injury["status"]
                player.injury_return_date = injury["return_date"]
                player.injury_details = new_details
                updated_count += 1
        else:
            # Player not injured - clear status if they had one
            if player.injury_status is not None:
                player.injury_status = None
                player.injury_return_date = None
                player.injury_details = None
                cleared_count += 1

    # Find injuries that didn't match any player in DB
    not_found = []
    for inj in injuries:
        key = (normalize_name(inj["name"]), normalize_name(inj["team"]))
        if key not in matched_injury_keys:
            not_found.append(inj["name"])

    db.commit()

    return {
        "updated": updated_count,
        "cleared": cleared_count,
        "not_found": not_found,
    }

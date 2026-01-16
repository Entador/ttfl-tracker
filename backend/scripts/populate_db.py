"""
Database population script for TTFL Tracker.

Fetches NBA data and populates the database with:
- All 30 NBA teams
- Player rosters for each team
- Games for the current season
- TTFL scores for each player/game

Usage:
    poetry run python scripts/populate_db.py

Options:
    --teams-only     Only populate teams
    --rosters-only   Only populate player rosters
    --games-only     Only populate games (no stats)
    --stats-only     Only populate TTFL scores for existing games
    --from-date      Start date for games (YYYY-MM-DD)
    --to-date        End date for games (YYYY-MM-DD)
"""

import sys
import time
import argparse
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, str(__file__).rsplit("/", 2)[0])

from sqlalchemy.orm import Session
from nba_api.stats.static import teams as nba_teams
from nba_api.stats.endpoints import commonteamroster, scheduleleaguev2

from models.database import SessionLocal, engine, Base
from models import Team, Player, Game
from services.nba_api import get_current_season


def parse_utc_datetime(dt_string: str) -> datetime | None:
    """Parse NBA API UTC datetime string to timezone-aware datetime."""
    if not dt_string:
        return None
    try:
        # Format: "2025-01-15T00:30:00Z" or "2025-01-15T00:30:00"
        dt_string = dt_string.replace("Z", "+00:00")
        return datetime.fromisoformat(dt_string)
    except (ValueError, TypeError):
        return None


def get_db() -> Session:
    """Get database session."""
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL not set")
    return SessionLocal()


def populate_teams(db: Session) -> dict[int, int]:
    """
    Populate all 30 NBA teams.

    Returns:
        Mapping of nba_team_id -> db team id
    """
    print("\n=== Populating Teams ===")
    all_teams = nba_teams.get_teams()
    team_map = {}

    for t in all_teams:
        existing = db.query(Team).filter(Team.nba_team_id == t["id"]).first()

        if existing:
            team_map[t["id"]] = existing.id
            print(f"  [skip] {t['abbreviation']} - {t['full_name']}")
        else:
            team = Team(
                nba_team_id=t["id"],
                abbreviation=t["abbreviation"],
                full_name=t["full_name"],
            )
            db.add(team)
            db.flush()
            team_map[t["id"]] = team.id
            print(f"  [new]  {t['abbreviation']} - {t['full_name']}")

    db.commit()
    print(f"Teams: {len(team_map)} total")
    return team_map


def populate_rosters(db: Session, team_map: dict[int, int]) -> dict[int, int]:
    """
    Populate player rosters for all teams.

    Returns:
        Mapping of nba_player_id -> db player id
    """
    print("\n=== Populating Rosters ===")
    season = get_current_season()
    player_map = {}
    new_count = 0
    updated_count = 0

    for nba_team_id, db_team_id in team_map.items():
        team = db.query(Team).filter(Team.id == db_team_id).first()
        print(f"\n  {team.abbreviation}:", end=" ")

        time.sleep(0.6)  # Rate limiting

        try:
            roster = commonteamroster.CommonTeamRoster(
                team_id=nba_team_id,
                season=season
            )
            roster_df = roster.common_team_roster.get_data_frame()
        except Exception as e:
            print(f"ERROR - {e}")
            continue

        for _, row in roster_df.iterrows():
            nba_player_id = int(row["PLAYER_ID"])
            player_name = row["PLAYER"]

            existing = db.query(Player).filter(
                Player.nba_player_id == nba_player_id
            ).first()

            if existing:
                # Update team if player was traded
                if existing.team_id != db_team_id:
                    existing.team_id = db_team_id
                    updated_count += 1
                    print("u", end="")
                else:
                    print(".", end="")
                player_map[nba_player_id] = existing.id
            else:
                player = Player(
                    nba_player_id=nba_player_id,
                    name=player_name,
                    team_id=db_team_id,
                    is_active=True,
                )
                db.add(player)
                db.flush()
                player_map[nba_player_id] = player.id
                new_count += 1
                print("+", end="")

        db.commit()

    print(f"\n\nPlayers: {len(player_map)} total, {new_count} new, {updated_count} updated")
    return player_map


def populate_games(
    db: Session,
    team_map: dict[int, int],
    from_date: datetime | None = None,
    to_date: datetime | None = None,
):
    """
    Populate full season schedule with game scores for finished games.
    """
    print("\n=== Populating Games (Full Schedule) ===")
    season = get_current_season()

    print(f"  Season: {season}")

    time.sleep(0.6)

    # Fetch full season schedule
    try:
        schedule = scheduleleaguev2.ScheduleLeagueV2(
            season=season,
            league_id="00",  # NBA
        )
        games_df = schedule.season_games.get_data_frame()
    except Exception as e:
        print(f"ERROR fetching schedule: {e}")
        return

    if games_df.empty:
        print("  No games found")
        return

    print(f"  Total games in schedule: {len(games_df)}")

    # Filter by date range if provided
    if from_date or to_date:
        games_df["game_date_parsed"] = games_df["gameDate"].apply(
            lambda x: datetime.strptime(x[:10], "%Y-%m-%d").date() if x else None
        )
        if from_date:
            games_df = games_df[games_df["game_date_parsed"] >= from_date.date()]
        if to_date:
            games_df = games_df[games_df["game_date_parsed"] <= to_date.date()]
        print(f"  After date filter: {len(games_df)}")

    new_count = 0
    updated_count = 0
    skipped_count = 0

    for _, row in games_df.iterrows():
        game_id = row["gameId"]

        # Parse game date
        game_date_str = row.get("gameDate", "")
        if not game_date_str:
            continue
        game_date = datetime.strptime(game_date_str[:10], "%Y-%m-%d").date()

        # Determine game status (1=scheduled, 2=live, 3=final)
        game_status = row.get("gameStatus", 1)
        if game_status == 3:
            status = "final"
        elif game_status == 2:
            status = "live"
        else:
            status = "scheduled"

        # Get team IDs and scores
        home_team_nba_id = row.get("homeTeam_teamId")
        away_team_nba_id = row.get("awayTeam_teamId")
        home_score = row.get("homeTeam_score") if status == "final" else None
        away_score = row.get("awayTeam_score") if status == "final" else None

        # Convert scores to int (they might be float or NaN)
        if home_score is not None:
            try:
                home_score = int(home_score) if home_score == home_score else None  # NaN check
            except (ValueError, TypeError):
                home_score = None
        if away_score is not None:
            try:
                away_score = int(away_score) if away_score == away_score else None
            except (ValueError, TypeError):
                away_score = None

        existing = db.query(Game).filter(Game.nba_game_id == game_id).first()

        if existing:
            # Update if status or scores changed
            needs_update = False
            if existing.status != status:
                existing.status = status
                needs_update = True
            if status == "final" and (existing.home_score != home_score or existing.away_score != away_score):
                existing.home_score = home_score
                existing.away_score = away_score
                needs_update = True

            if needs_update:
                updated_count += 1
            else:
                skipped_count += 1
            continue

        # Parse start time
        start_time_utc = parse_utc_datetime(row.get("gameDateTimeUTC"))

        # Create new game record
        game = Game(
            nba_game_id=game_id,
            game_date=game_date,
            home_team_id=team_map.get(home_team_nba_id),
            away_team_id=team_map.get(away_team_nba_id),
            status=status,
            home_score=home_score,
            away_score=away_score,
            start_time_utc=start_time_utc,
        )
        db.add(game)
        new_count += 1

    db.commit()

    # Count by status
    final_in_db = db.query(Game).filter(Game.status == "final").count()
    scheduled_in_db = db.query(Game).filter(Game.status == "scheduled").count()

    print(f"  New: {new_count}, Updated: {updated_count}, Skipped: {skipped_count}")
    print(f"  Total in DB: {final_in_db} final, {scheduled_in_db} scheduled")


def main():
    parser = argparse.ArgumentParser(description="Populate TTFL database")
    parser.add_argument("--teams-only", action="store_true", help="Only populate teams")
    parser.add_argument("--rosters-only", action="store_true", help="Only populate rosters")
    parser.add_argument("--games-only", action="store_true", help="Only populate games (schedule + scores)")
    parser.add_argument("--from-date", type=str, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--to-date", type=str, help="End date (YYYY-MM-DD)")
    args = parser.parse_args()

    # Parse dates
    from_date = datetime.strptime(args.from_date, "%Y-%m-%d") if args.from_date else None
    to_date = datetime.strptime(args.to_date, "%Y-%m-%d") if args.to_date else None

    # Determine what to run
    run_all = not any([args.teams_only, args.rosters_only, args.games_only])

    print("=" * 50)
    print("TTFL Database Population Script")
    print("=" * 50)

    # Ensure tables exist
    if engine:
        Base.metadata.create_all(bind=engine)

    db = get_db()

    try:
        # Always need team mapping
        team_map = populate_teams(db) if (run_all or args.teams_only or args.rosters_only or args.games_only) else {}

        if not team_map:
            # Load existing teams
            teams = db.query(Team).all()
            team_map = {t.nba_team_id: t.id for t in teams}

        # Populate rosters
        if run_all or args.rosters_only:
            populate_rosters(db, team_map)

        # Populate games (schedule + scores for finished games)
        if run_all or args.games_only:
            populate_games(db, team_map, from_date, to_date)

        print("\n" + "=" * 50)
        print("Done!")
        print("=" * 50)

    finally:
        db.close()


if __name__ == "__main__":
    main()

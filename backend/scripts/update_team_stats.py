"""
Update team season stats for all 30 NBA teams.

Fetches current season stats from NBA API and updates the teams table.
Designed to run daily (e.g., via cron) or on-demand.

Usage:
    poetry run python scripts/update_team_stats.py
"""

import sys
from datetime import datetime, timezone

sys.path.insert(0, str(__file__).rsplit("/", 2)[0])

from models.database import SessionLocal
from models import Team
from services.nba_api import get_all_team_stats, get_current_season


def main():
    print("=" * 50)
    print("Team Stats Update Script")
    print("=" * 50)

    db = SessionLocal()
    if db is None:
        print("ERROR: Could not create database session")
        return

    try:
        season = get_current_season()
        print(f"Season: {season}")
        print("\nFetching team stats from NBA API...")

        team_stats = get_all_team_stats(season)

        if not team_stats:
            print("ERROR: No team stats returned from API")
            return

        print(f"Received stats for {len(team_stats)} teams\n")

        updated_count = 0
        not_found_count = 0

        for stats in team_stats:
            nba_team_id = stats['nba_team_id']

            # Find team in database
            team = db.query(Team).filter(Team.nba_team_id == nba_team_id).first()

            if not team:
                print(f"  [skip] Team ID {nba_team_id} ({stats['team_name']}) not in database")
                not_found_count += 1
                continue

            # Update stats (overwrite)
            team.wins = stats['wins']
            team.losses = stats['losses']
            team.pace = stats['pace']
            team.def_rating = stats['def_rating']
            team.opp_ppg = stats['opp_ppg']
            team.opp_rpg = stats['opp_rpg']
            team.opp_apg = stats['opp_apg']
            team.opp_efg_pct = stats['opp_efg_pct']
            team.opp_tov = stats['opp_tov']
            team.opp_stl = stats['opp_stl']
            team.opp_blk = stats['opp_blk']
            team.stats_updated_at = datetime.now(timezone.utc)

            updated_count += 1
            print(f"  [updated] {team.abbreviation}: {team.wins}W-{team.losses}L, "
                  f"DEF:{team.def_rating:.1f}, PACE:{team.pace:.1f}")

        db.commit()

        print(f"\n{'=' * 50}")
        print(f"Updated: {updated_count}, Not found: {not_found_count}")
        print(f"Timestamp: {datetime.now(timezone.utc).isoformat()}")
        print("Done!")

    except Exception as e:
        import traceback
        print(f"ERROR: {e}")
        print(traceback.format_exc())
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    main()

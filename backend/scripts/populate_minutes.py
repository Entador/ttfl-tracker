"""
Populate the 'minutes' column for existing TTFLScore records.

Fetches minutes played from NBA API for each player's games.

Usage:
    poetry run python scripts/populate_minutes.py
    poetry run python scripts/populate_minutes.py --limit 100  # Process 100 players
"""

import sys
import time
import argparse

sys.path.insert(0, str(__file__).rsplit("/", 2)[0])

from sqlalchemy.orm import Session
from sqlalchemy import func
from nba_api.stats.endpoints import playergamelog

from models.database import SessionLocal
from models import Player, Game, TTFLScore
from services.nba_api import get_current_season


def parse_minutes(min_str: str) -> int:
    """
    Parse minutes string from NBA API (e.g., '32:45' or '32') to integer.
    Returns 0 if parsing fails or player didn't play.
    """
    if not min_str or min_str == "" or min_str == "0" or min_str is None:
        return 0

    try:
        # Handle 'MM:SS' format
        if ":" in str(min_str):
            parts = str(min_str).split(":")
            return int(parts[0])
        # Handle integer/float format
        return int(float(min_str))
    except (ValueError, TypeError):
        return 0


def fetch_player_minutes(nba_player_id: int, season: str) -> dict[str, int]:
    """
    Fetch minutes played for each game from NBA API.

    Returns: {game_date_str: minutes_played}
    """
    try:
        time.sleep(0.6)  # Rate limiting

        gamelog = playergamelog.PlayerGameLog(
            player_id=nba_player_id,
            season=season,
            timeout=60
        )
        df = gamelog.get_data_frames()[0]

        if df.empty:
            return {}

        result = {}
        for _, row in df.iterrows():
            game_date = row.get("GAME_DATE", "")
            minutes = parse_minutes(row.get("MIN", 0))
            if game_date:
                # Normalize date format (NBA API returns 'MMM DD, YYYY')
                from datetime import datetime
                try:
                    parsed = datetime.strptime(game_date, "%b %d, %Y")
                    date_str = parsed.strftime("%Y-%m-%d")
                    result[date_str] = minutes
                except ValueError:
                    result[game_date] = minutes

        return result

    except Exception as e:
        print(f"  Error fetching game log: {e}")
        return {}


def main():
    parser = argparse.ArgumentParser(description="Populate minutes column")
    parser.add_argument("--limit", type=int, help="Limit number of players to process")
    args = parser.parse_args()

    db = SessionLocal()
    if db is None:
        print("ERROR: DATABASE_URL not set")
        return

    try:
        season = get_current_season()
        print(f"Season: {season}")

        # Find players with TTFLScore records missing minutes
        players_query = (
            db.query(Player.id, Player.nba_player_id, Player.name)
            .join(TTFLScore, TTFLScore.player_id == Player.id)
            .filter(TTFLScore.minutes.is_(None))
            .group_by(Player.id)
            .order_by(func.count(TTFLScore.id).desc())  # Process players with most records first
        )

        if args.limit:
            players_query = players_query.limit(args.limit)

        players = players_query.all()
        print(f"Players to process: {len(players)}")

        total_updated = 0

        for i, (player_id, nba_player_id, name) in enumerate(players, 1):
            print(f"\n[{i}/{len(players)}] {name} (NBA ID: {nba_player_id})")

            # Fetch minutes from NBA API
            minutes_map = fetch_player_minutes(nba_player_id, season)

            if not minutes_map:
                print("  No game data found")
                continue

            # Get player's TTFLScore records with their game dates
            scores = (
                db.query(TTFLScore, Game.game_date)
                .join(Game)
                .filter(
                    TTFLScore.player_id == player_id,
                    TTFLScore.minutes.is_(None)
                )
                .all()
            )

            updated = 0
            for ttfl_score, game_date in scores:
                date_str = game_date.strftime("%Y-%m-%d")
                if date_str in minutes_map:
                    ttfl_score.minutes = minutes_map[date_str]
                    updated += 1

            if updated > 0:
                db.commit()
                total_updated += updated
                print(f"  Updated {updated} records")
            else:
                print("  No matching dates found")

        print(f"\n{'='*50}")
        print(f"Total records updated: {total_updated}")

    finally:
        db.close()


if __name__ == "__main__":
    main()

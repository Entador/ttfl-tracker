"""
Daily database update script for TTFL Tracker.

Maintains the database by:
1. Updating game statuses (scheduled -> final)
2. Populating TTFL scores for completed games
3. Updating team defensive stats
4. Updating player injury statuses from ESPN

Designed to run daily via GitHub Actions cron job.

Usage:
    poetry run python scripts/daily_update.py

Options:
    --games-only      Only update game statuses
    --scores-only     Only populate TTFL scores
    --stats-only      Only update team stats
    --injuries-only   Only update injury statuses
    --dry-run         Show what would be done without making changes
"""

import sys
import argparse
import traceback
import time
from datetime import datetime, timezone
from pathlib import Path
from functools import wraps

import pandas as pd


def retry_on_timeout(max_retries: int = 3, base_delay: float = 5.0):
    """Decorator to retry NBA API calls on timeout with exponential backoff."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    error_str = str(e).lower()
                    if "timeout" in error_str or "timed out" in error_str:
                        last_exception = e
                        delay = base_delay * (2 ** attempt)
                        print(f"  Timeout (attempt {attempt + 1}/{max_retries}), retrying in {delay}s...")
                        time.sleep(delay)
                    else:
                        raise
            raise last_exception
        return wrapper
    return decorator

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import Session
from sqlalchemy import and_
from nba_api.stats.endpoints import scheduleleaguev2

from models.database import SessionLocal
from models import Team, Player, Game, TTFLScore
from services.nba_api import get_current_season, get_all_team_stats, get_game_box_scores, get_player_stats, get_proxy_url
from services.ttfl import calculate_ttfl_score
from services.injuries import update_player_injuries


def get_db() -> Session:
    """Get database session."""
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL not set")
    return SessionLocal()


def update_game_statuses(db: Session, dry_run: bool = False) -> int:
    """
    Update game statuses and scores for existing games in the database.

    Only updates games that are already in the DB - does not add new games.

    Returns:
        Number of games updated
    """
    print("\n" + "=" * 50)
    print("Phase 1: Update Game Statuses")
    print("=" * 50)

    season = get_current_season()
    print(f"Season: {season}")

    @retry_on_timeout(max_retries=3, base_delay=10.0)
    def fetch_schedule():
        schedule = scheduleleaguev2.ScheduleLeagueV2(
            season=season,
            league_id="00",
            proxy=get_proxy_url(),
            timeout=60
        )
        return schedule.season_games.get_data_frame()

    try:
        games_df = fetch_schedule()
    except Exception as e:
        print(f"ERROR fetching schedule: {e}")
        return 0

    if games_df.empty:
        print("No games found in schedule")
        return 0

    # Build lookup from NBA schedule
    schedule_data = {}
    for _, row in games_df.iterrows():
        game_id = row["gameId"]
        game_status = row.get("gameStatus", 1)

        if game_status == 3:
            status = "final"
        elif game_status == 2:
            status = "live"
        else:
            status = "scheduled"

        home_score = None
        away_score = None
        if status == "final":
            try:
                home_score_raw = row.get("homeTeam_score")
                away_score_raw = row.get("awayTeam_score")
                home_score = int(home_score_raw) if pd.notna(home_score_raw) else None
                away_score = int(away_score_raw) if pd.notna(away_score_raw) else None
            except (ValueError, TypeError):
                pass

        schedule_data[game_id] = {
            "status": status,
            "home_score": home_score,
            "away_score": away_score,
        }

    print(f"Loaded {len(schedule_data)} games from NBA schedule")

    # Update only existing games in database
    games_to_update = db.query(Game).filter(Game.status != "final").all()
    print(f"Found {len(games_to_update)} non-final games in database")

    updated_count = 0

    for game in games_to_update:
        schedule_info = schedule_data.get(game.nba_game_id)
        if not schedule_info:
            continue

        needs_update = False
        new_status = schedule_info["status"]
        new_home_score = schedule_info["home_score"]
        new_away_score = schedule_info["away_score"]

        if game.status != new_status:
            if not dry_run:
                game.status = new_status
            needs_update = True

        if new_status == "final" and (game.home_score != new_home_score or game.away_score != new_away_score):
            if not dry_run:
                game.home_score = new_home_score
                game.away_score = new_away_score
            needs_update = True

        if needs_update:
            updated_count += 1
            print(f"  [updated] {game.nba_game_id} -> {new_status}", end="")
            if new_status == "final":
                print(f" ({new_home_score}-{new_away_score})", end="")
            print()

    if not dry_run:
        db.commit()

    # Summary
    final_count = db.query(Game).filter(Game.status == "final").count()
    scheduled_count = db.query(Game).filter(Game.status == "scheduled").count()

    print(f"\nUpdated: {updated_count}")
    print(f"Total in DB: {final_count} final, {scheduled_count} scheduled")

    return updated_count


def populate_ttfl_scores(db: Session, dry_run: bool = False) -> tuple[int, int, int]:
    """
    Populate TTFL scores for final games missing scores.

    Strategy:
    1. Try box scores first (faster - one API call per game)
    2. Fall back to player logs for games where box scores fail

    Returns:
        Tuple of (games_processed, scores_added, errors)
    """
    print("\n" + "=" * 50)
    print("Phase 2: Populate TTFL Scores")
    print("=" * 50)

    from datetime import date
    regular_season_start = date(2025, 10, 22)

    # Pre-load all players for efficient lookup
    players = db.query(Player).all()
    player_map = {p.nba_player_id: p.id for p in players}
    player_by_id = {p.id: p for p in players}

    # Find final regular season games without any TTFL scores
    games_with_scores = db.query(TTFLScore.game_id).distinct()
    games_needing_scores = (
        db.query(Game)
        .filter(
            and_(
                Game.status == "final",
                Game.game_date >= regular_season_start,
                ~Game.id.in_(games_with_scores)
            )
        )
        .order_by(Game.game_date)
        .all()
    )

    if not games_needing_scores:
        print("No games needing TTFL scores")
        return 0, 0, 0

    print(f"Found {len(games_needing_scores)} games needing scores")

    games_processed = 0
    scores_added = 0
    games_failed = []

    # Phase 2a: Try box scores first
    print("\n--- Trying Box Scores ---")
    for game in games_needing_scores:
        print(f"  {game.nba_game_id} ({game.game_date})", end=" ")

        try:
            box_scores = get_game_box_scores(game.nba_game_id)
        except Exception as e:
            print(f"- error: {e}")
            games_failed.append(game)
            continue

        if not box_scores:
            print("- no data, will try player logs")
            games_failed.append(game)
            continue

        game_scores = 0
        for box_score in box_scores:
            nba_player_id = box_score['nba_player_id']
            player_id = player_map.get(nba_player_id)
            if not player_id:
                continue

            ttfl_score = calculate_ttfl_score(box_score)
            minutes = box_score.get('minutes', 0)

            if not dry_run:
                existing = db.query(TTFLScore).filter(
                    TTFLScore.player_id == player_id,
                    TTFLScore.game_id == game.id
                ).first()
                if existing:
                    continue

                db.add(TTFLScore(
                    player_id=player_id,
                    game_id=game.id,
                    ttfl_score=ttfl_score,
                    minutes=minutes,
                ))
                game_scores += 1

        if not dry_run and game_scores > 0:
            db.commit()

        print(f"- {game_scores} scores")
        games_processed += 1
        scores_added += game_scores

    # Phase 2b: Fall back to player logs for failed games
    if games_failed:
        print(f"\n--- Falling back to Player Logs ({len(games_failed)} games) ---")

        # Build lookup for failed games by date and team
        game_lookup = {}
        for game in games_failed:
            game_lookup[(game.game_date, game.home_team_id)] = game
            game_lookup[(game.game_date, game.away_team_id)] = game

        # Get players from teams that played in failed games
        team_ids = set()
        for game in games_failed:
            team_ids.add(game.home_team_id)
            team_ids.add(game.away_team_id)

        relevant_players = db.query(Player).filter(
            Player.team_id.in_(team_ids),
            Player.is_active == True
        ).all()

        print(f"  Checking {len(relevant_players)} players from relevant teams")

        fallback_scores = 0
        for i, player in enumerate(relevant_players):
            if (i + 1) % 25 == 0:
                print(f"    Progress: {i + 1}/{len(relevant_players)}")

            try:
                game_logs = get_player_stats(player.nba_player_id, num_recent_games=15)
            except Exception:
                continue

            if not game_logs:
                continue

            for game_log in game_logs:
                game_date_str = game_log.get('game_date', '')
                if not game_date_str:
                    continue

                try:
                    game_date = datetime.strptime(game_date_str, "%b %d, %Y").date()
                except ValueError:
                    continue

                if game_date < regular_season_start:
                    continue

                game = game_lookup.get((game_date, player.team_id))
                if not game:
                    continue

                if not dry_run:
                    existing = db.query(TTFLScore).filter(
                        TTFLScore.player_id == player.id,
                        TTFLScore.game_id == game.id
                    ).first()
                    if existing:
                        continue

                    ttfl_score = calculate_ttfl_score(game_log)
                    db.add(TTFLScore(
                        player_id=player.id,
                        game_id=game.id,
                        ttfl_score=ttfl_score,
                        minutes=0,  # Not available in game log format
                    ))
                    fallback_scores += 1

            if not dry_run and fallback_scores > 0:
                db.commit()

        scores_added += fallback_scores
        print(f"  Added {fallback_scores} scores via player logs")

    # Summary
    print(f"\n{'=' * 50}")
    print(f"Phase 2 Results:")
    print(f"  Games processed via box scores: {games_processed}")
    print(f"  Games requiring fallback: {len(games_failed)}")
    print(f"  Total scores added: {scores_added}")

    return games_processed, scores_added, len(games_failed)


def update_team_stats(db: Session, dry_run: bool = False) -> int:
    """
    Update team defensive stats from NBA API.

    Returns:
        Number of teams updated
    """
    print("\n" + "=" * 50)
    print("Phase 3: Update Team Stats")
    print("=" * 50)

    season = get_current_season()
    print(f"Season: {season}")
    print("Fetching team stats from NBA API...")

    @retry_on_timeout(max_retries=3, base_delay=10.0)
    def fetch_team_stats():
        return get_all_team_stats(season)

    try:
        team_stats = fetch_team_stats()
    except Exception as e:
        print(f"ERROR fetching team stats: {e}")
        return 0

    if not team_stats:
        print("ERROR: No team stats returned from API")
        return 0

    print(f"Received stats for {len(team_stats)} teams\n")

    updated_count = 0
    not_found_count = 0

    for stats in team_stats:
        nba_team_id = stats['nba_team_id']

        team = db.query(Team).filter(Team.nba_team_id == nba_team_id).first()

        if not team:
            print(f"  [skip] Team ID {nba_team_id} ({stats['team_name']}) not in database")
            not_found_count += 1
            continue

        if not dry_run:
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
        print(f"  [updated] {team.abbreviation}: {stats['wins']}W-{stats['losses']}L, "
              f"DEF:{stats['def_rating']:.1f}, PACE:{stats['pace']:.1f}")

    if not dry_run:
        db.commit()

    print(f"\nUpdated: {updated_count}, Not found: {not_found_count}")

    return updated_count


def update_injuries(db: Session, dry_run: bool = False) -> dict:
    """
    Update player injury status from ESPN.

    Returns:
        Dict with update stats
    """
    print("\n" + "=" * 50)
    print("Phase 4: Update Player Injuries")
    print("=" * 50)

    print("Fetching injury data from ESPN...")

    if dry_run:
        print("*** DRY RUN - Would update injuries from ESPN ***")
        return {"updated": 0, "cleared": 0, "not_found": []}

    try:
        result = update_player_injuries(db)

        print(f"\nResults:")
        print(f"  Updated: {result['updated']}")
        print(f"  Cleared: {result['cleared']}")
        if result['not_found']:
            print(f"  Not matched: {len(result['not_found'])} players")
            for name in result['not_found'][:5]:  # Show first 5
                print(f"    - {name}")
            if len(result['not_found']) > 5:
                print(f"    ... and {len(result['not_found']) - 5} more")

        return result

    except Exception as e:
        print(f"ERROR updating injuries: {e}")
        traceback.print_exc()
        return {"updated": 0, "cleared": 0, "not_found": [], "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Daily TTFL database update")
    parser.add_argument("--games-only", action="store_true", help="Only update game statuses")
    parser.add_argument("--scores-only", action="store_true", help="Only populate TTFL scores")
    parser.add_argument("--stats-only", action="store_true", help="Only update team stats")
    parser.add_argument("--injuries-only", action="store_true", help="Only update injury statuses")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be done without making changes")
    args = parser.parse_args()

    run_all = not any([args.games_only, args.scores_only, args.stats_only, args.injuries_only])

    print("=" * 50)
    print("TTFL Daily Update Script")
    print(f"Started: {datetime.now(timezone.utc).isoformat()}")
    if args.dry_run:
        print("*** DRY RUN MODE - No changes will be made ***")
    print("=" * 50)

    db = get_db()

    try:
        # Phase 1: Update game statuses
        if run_all or args.games_only:
            update_game_statuses(db, dry_run=args.dry_run)

        # Phase 2: Populate TTFL scores
        if run_all or args.scores_only:
            populate_ttfl_scores(db, dry_run=args.dry_run)

        # Phase 3: Update team stats
        if run_all or args.stats_only:
            update_team_stats(db, dry_run=args.dry_run)

        # Phase 4: Update injuries
        if run_all or args.injuries_only:
            update_injuries(db, dry_run=args.dry_run)

        print("\n" + "=" * 50)
        print(f"Completed: {datetime.now(timezone.utc).isoformat()}")
        print("Done!")
        print("=" * 50)

    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        print(traceback.format_exc())
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()

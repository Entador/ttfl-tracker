"""Snapshot endpoint: returns all season data in one response."""
from datetime import datetime, date, timezone
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from models.database import get_db
from models import AppMetadata
from services.cache import app_cache
from services.player_stats import batch_calculate_averages, get_playoff_round

import traceback

router = APIRouter()


@router.get("/snapshot")
def get_snapshot(db: Session = Depends(get_db)):
    """
    Get complete snapshot of all players, games, and teams for the entire season.

    Returns all data at once for client-side filtering. Uses in-memory cache for
    games/teams/players, only queries DB for TTFL score calculations.

    Returns:
        {
            "metadata": {
                "generated_at": ISO timestamp,
                "total_players": int,
                "total_games": int,
                "total_teams": int,
                "injury_updated_at": ISO timestamp or null
            },
            "players": [player objects with TTFL stats],
            "games": [all games for the season],
            "teams": [all team data]
        }
    """
    try:
        # Get all games from cache (entire season)
        all_games = []
        for games_list in app_cache.games_by_date.values():
            all_games.extend(games_list)

        # Refresh injury data from DB if stale (TTL: 1 hour)
        app_cache.refresh_injuries_if_stale(db)

        # Get all active players from cache
        all_players = [p for p in app_cache.players_by_id.values() if p.is_active]

        # Detect current and previous playoff round (needed for per-round stat calculation)
        _playoff_rounds = {get_playoff_round(g.nba_game_id) for g in all_games if g.nba_game_id.startswith('004')} - {None}
        current_playoff_round = max(_playoff_rounds) if _playoff_rounds else None
        last_playoff_round = (current_playoff_round - 1) if current_playoff_round and current_playoff_round > 1 else None

        # Batch calculate TTFL averages for all players (single DB query)
        player_ids = [p.id for p in all_players]
        averages = batch_calculate_averages(db, player_ids, current_playoff_round, last_playoff_round)

        # Get all teams from cache
        all_teams = list(app_cache.teams_by_id.values())

        # Get injury update timestamp
        injury_metadata = db.query(AppMetadata).filter(AppMetadata.key == "injury_updated_at").first()
        injury_updated_at = injury_metadata.value if injury_metadata else None

        # Compute rank delta: rank by season avg now vs. a week ago
        # Both windows use the same pool (players with data in BOTH) so ranks are comparable
        shared_pool = [
            p for p in all_players
            if averages.get(p.id, {}).get('avg_ttfl', 0) > 0
            and averages.get(p.id, {}).get('avg_ttfl_week_ago', 0) > 0
        ]
        rank_now = {
            p.id: i + 1
            for i, p in enumerate(sorted(shared_pool, key=lambda p: averages[p.id]['avg_ttfl'], reverse=True))
        }
        rank_week_ago = {
            p.id: i + 1
            for i, p in enumerate(sorted(shared_pool, key=lambda p: averages[p.id]['avg_ttfl_week_ago'], reverse=True))
        }

        # Build players response
        players_data = []
        for player in all_players:
            avgs = averages.get(player.id, {
                'avg_ttfl': 0.0,
                'avg_ttfl_l10': 0.0,
                'avg_ttfl_l30d': 0.0,
                'avg_ttfl_week_ago': 0.0,
                'avg_ttfl_playoffs': None,
                'avg_ttfl_current_round': None,
                'avg_ttfl_last_round': None,
            })

            # rank_delta > 0 means rising, < 0 means falling, None means not enough data
            r_now = rank_now.get(player.id)
            r_ago = rank_week_ago.get(player.id)
            rank_delta = (r_ago - r_now) if (r_now is not None and r_ago is not None) else None

            players_data.append({
                'player_id': player.nba_player_id,
                'name': player.name,
                'team': player.team.abbreviation if player.team else 'UNK',
                'team_id': player.team_id,
                'avg_ttfl': round(avgs['avg_ttfl'], 1),
                'avg_ttfl_week_ago': round(avgs['avg_ttfl_week_ago'], 1),
                'avg_ttfl_l10': round(avgs['avg_ttfl_l10'], 1),
                'avg_ttfl_l30d': round(avgs['avg_ttfl_l30d'], 1),
                'avg_ttfl_playoffs': round(avgs['avg_ttfl_playoffs'], 1) if avgs['avg_ttfl_playoffs'] is not None else None,
                'avg_ttfl_current_round': round(avgs['avg_ttfl_current_round'], 1) if avgs['avg_ttfl_current_round'] is not None else None,
                'avg_ttfl_last_round': round(avgs['avg_ttfl_last_round'], 1) if avgs['avg_ttfl_last_round'] is not None else None,
                'rank_delta': rank_delta,
                'injury_status': player.injury_status,
                'injury_return_date': player.injury_return_date,
                'injury_details': player.injury_details,
            })

        # Build games response
        games_data = []
        for game in all_games:
            games_data.append({
                'game_date': game.game_date.isoformat(),
                'home_team': game.home_team.abbreviation if game.home_team else 'UNK',
                'away_team': game.away_team.abbreviation if game.away_team else 'UNK',
                'home_team_id': game.home_team_id,
                'away_team_id': game.away_team_id,
            })

        # Build teams response
        teams_data = []
        for team in all_teams:
            teams_data.append({
                'team_id': team.id,
                'abbreviation': team.abbreviation,
                'full_name': team.full_name,
                'pace': team.pace or 0.0,
                'def_rating': team.def_rating or 0.0,
            })

        # Compute earliest game time per date
        earliest_game_times = {}
        for game in all_games:
            if game.start_time_utc:
                date_str = game.game_date.isoformat()
                time_iso = game.start_time_utc.isoformat()
                if date_str not in earliest_game_times or time_iso < earliest_game_times[date_str]:
                    earliest_game_times[date_str] = time_iso

        # Playoff period: all regular season games are done, or next scheduled games are playoffs
        today = date.today()
        regular_season_games = [g for g in all_games if g.nba_game_id.startswith('002')]
        upcoming_games = [g for g in all_games if g.game_date >= today]
        is_playoff_period = (
            (bool(regular_season_games) and all(g.game_date < today for g in regular_season_games))
            or any(g.nba_game_id.startswith('004') for g in upcoming_games)
        )

        playoff_games = [g for g in all_games if g.nba_game_id.startswith('004')]
        playoff_start_date = (
            min(g.game_date for g in playoff_games).isoformat() if playoff_games else None
        )

        return {
            'metadata': {
                'generated_at': datetime.now(timezone.utc).isoformat(),
                'total_players': len(players_data),
                'total_games': len(games_data),
                'total_teams': len(teams_data),
                'injury_updated_at': injury_updated_at,
                'earliest_game_times': earliest_game_times,
                'is_playoff_period': is_playoff_period,
                'playoff_start_date': playoff_start_date,
                'current_playoff_round': current_playoff_round,
                'last_playoff_round': last_playoff_round,
            },
            'players': players_data,
            'games': games_data,
            'teams': teams_data,
        }

    except Exception as e:
        print(f"Error in get_snapshot: {e}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error generating snapshot: {str(e)}"
        )

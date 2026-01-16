"""Snapshot endpoint: returns all season data in one response."""
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from models.database import get_db
from models import AppMetadata
from services.cache import app_cache
from services.player_stats import batch_calculate_averages

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

        # Get all active players from cache
        all_players = [p for p in app_cache.players_by_id.values() if p.is_active]

        # Batch calculate TTFL averages for all players (single DB query)
        player_ids = [p.id for p in all_players]
        averages = batch_calculate_averages(db, player_ids)

        # Get all teams from cache
        all_teams = list(app_cache.teams_by_id.values())

        # Get injury update timestamp
        injury_metadata = db.query(AppMetadata).filter(AppMetadata.key == "injury_updated_at").first()
        injury_updated_at = injury_metadata.value if injury_metadata else None

        # Build players response
        players_data = []
        for player in all_players:
            avgs = averages.get(player.id, {
                'avg_ttfl': 0.0,
                'avg_ttfl_l10': 0.0,
                'avg_ttfl_l30d': 0.0
            })

            players_data.append({
                'player_id': player.nba_player_id,
                'name': player.name,
                'team': player.team.abbreviation if player.team else 'UNK',
                'team_id': player.team_id,
                'avg_ttfl': avgs['avg_ttfl'],
                'avg_ttfl_l10': avgs['avg_ttfl_l10'],
                'avg_ttfl_l30d': avgs['avg_ttfl_l30d'],
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

        return {
            'metadata': {
                'generated_at': datetime.utcnow().isoformat() + 'Z',
                'total_players': len(players_data),
                'total_games': len(games_data),
                'total_teams': len(teams_data),
                'injury_updated_at': injury_updated_at,
                'earliest_game_times': earliest_game_times,
            },
            'players': players_data,
            'games': games_data,
            'teams': teams_data,
        }

    except Exception as e:
        import traceback
        print(f"Error in get_snapshot: {e}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error generating snapshot: {str(e)}"
        )

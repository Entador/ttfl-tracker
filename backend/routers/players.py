from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from models.database import get_db
from models import Player, Game, Team, TTFLScore
from services.cache import app_cache
from services.player_stats import batch_calculate_averages as _batch_calculate_averages

router = APIRouter()


def _calculate_player_avg_ttfl(db: Session, player_id: int, limit: int = 15) -> float:
    """Calculate average TTFL score from recent games where player actually played."""
    scores = (
        db.query(TTFLScore.ttfl_score)
        .join(Game)
        .filter(
            TTFLScore.player_id == player_id,
            TTFLScore.ttfl_score.isnot(None),
            TTFLScore.minutes > 0
        )
        .order_by(Game.game_date.desc())
        .limit(limit)
        .all()
    )
    if not scores:
        return 0.0
    return round(sum(s.ttfl_score for s in scores) / len(scores), 1)


def _calculate_player_avg_ttfl_last_days(db: Session, player_id: int, days: int) -> float:
    """Calculate average TTFL score from games in the last N days where player played."""
    cutoff_date = date.today() - timedelta(days=days)
    scores = (
        db.query(TTFLScore.ttfl_score)
        .join(Game)
        .filter(
            TTFLScore.player_id == player_id,
            TTFLScore.ttfl_score.isnot(None),
            TTFLScore.minutes > 0,
            Game.game_date >= cutoff_date
        )
        .all()
    )
    if not scores:
        return 0.0
    return round(sum(s.ttfl_score for s in scores) / len(scores), 1)


# Moved to services/player_stats.py for reuse across endpoints


@router.get("/players/tonight")
def get_tonights_players(game_date: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Get players for a specific date with TTFL stats.

    Uses pre-loaded cache for games, teams, and players to minimize database queries.
    Only queries database for TTFL score calculations (dynamic data).
    """
    try:
        # Parse date or default to today
        if game_date:
            target_date = datetime.strptime(game_date, "%Y-%m-%d").date()
        else:
            target_date = date.today()

        # Get games from memory cache
        games = app_cache.get_games_for_date(target_date)

        if not games:
            return []

        # Collect team IDs playing tonight
        team_ids = set()
        for game in games:
            team_ids.add(game.home_team_id)
            team_ids.add(game.away_team_id)

        # Get active players from memory cache (no DB query!)
        players = app_cache.get_active_players_for_teams(team_ids)

        # Build player lookup by team_id
        players_by_team = {}
        for player in players:
            if player.team_id not in players_by_team:
                players_by_team[player.team_id] = []
            players_by_team[player.team_id].append(player)

        # Only DB query: Batch calculate all TTFL averages (dynamic data)
        player_ids = [p.id for p in players]
        averages = _batch_calculate_averages(db, player_ids)

        # Build response (no more queries needed)
        players_tonight = []
        games_list = []

        for game in games:
            home_team = game.home_team
            away_team = game.away_team

            if not home_team or not away_team:
                continue

            # Add game to games list
            games_list.append({
                'away_team': away_team.abbreviation,
                'home_team': home_team.abbreviation,
            })

            # Home team players (opponent is away_team)
            for player in players_by_team.get(game.home_team_id, []):
                avgs = averages.get(player.id, {'avg_ttfl': 0.0, 'avg_ttfl_l10': 0.0, 'avg_ttfl_l30d': 0.0})
                players_tonight.append({
                    'player_id': player.nba_player_id,
                    'name': player.name,
                    'team': home_team.abbreviation,
                    'opponent': away_team.abbreviation,
                    'is_home': True,
                    'avg_ttfl': avgs['avg_ttfl'],
                    'avg_ttfl_l10': avgs['avg_ttfl_l10'],
                    'avg_ttfl_l30d': avgs['avg_ttfl_l30d'],
                    'opp_pace': away_team.pace,
                    'opp_def_rating': away_team.def_rating,
                    'injury_status': player.injury_status,
                    'injury_return_date': player.injury_return_date,
                    'injury_details': player.injury_details,
                })

            # Away team players (opponent is home_team)
            for player in players_by_team.get(game.away_team_id, []):
                avgs = averages.get(player.id, {'avg_ttfl': 0.0, 'avg_ttfl_l10': 0.0, 'avg_ttfl_l30d': 0.0})
                players_tonight.append({
                    'player_id': player.nba_player_id,
                    'name': player.name,
                    'team': away_team.abbreviation,
                    'opponent': home_team.abbreviation,
                    'is_home': False,
                    'avg_ttfl': avgs['avg_ttfl'],
                    'avg_ttfl_l10': avgs['avg_ttfl_l10'],
                    'avg_ttfl_l30d': avgs['avg_ttfl_l30d'],
                    'opp_pace': home_team.pace,
                    'opp_def_rating': home_team.def_rating,
                    'injury_status': player.injury_status,
                    'injury_return_date': player.injury_return_date,
                    'injury_details': player.injury_details,
                })

        return {
            'players': players_tonight,
            'games': games_list
        }

    except Exception as e:
        import traceback
        print(f"Error in get_tonights_players: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error fetching tonight's players: {str(e)}")


@router.get("/players/{player_id}/stats")
def get_player_stats(player_id: int, db: Session = Depends(get_db)):
    """
    Get recent game history for a player.

    Uses cached player and team data, only queries DB for TTFL scores.

    Args:
        player_id: NBA player ID

    Returns:
        {
            'player': {id, name, team},
            'recent_games': [{game_date, opponent, ttfl_score, picked}],
            'avg_ttfl': average TTFL score
        }
    """
    try:
        # Find player in cache (no DB query!)
        player = app_cache.get_player_by_nba_id(player_id)

        if not player:
            raise HTTPException(status_code=404, detail="Player not found")

        # Get player's team from cache (no DB query!)
        team = app_cache.get_team(player.team_id)
        team_abbrev = team.abbreviation if team else ""

        # Get all season games with TTFL scores
        recent_scores = (
            db.query(TTFLScore, Game)
            .join(Game, TTFLScore.game_id == Game.id)
            .filter(TTFLScore.player_id == player.id)
            .order_by(Game.game_date.desc())
            .all()
        )

        games = []
        for ttfl_record, game in recent_scores:
            # Determine opponent based on player's team (use cache, no DB query!)
            if player.team_id == game.home_team_id:
                opponent_team = app_cache.get_team(game.away_team_id)
                is_home = True
            else:
                opponent_team = app_cache.get_team(game.home_team_id)
                is_home = False

            games.append({
                'game_date': game.game_date.isoformat(),
                'opponent': opponent_team.abbreviation if opponent_team else "UNK",
                'is_home': is_home,
                'ttfl_score': ttfl_record.ttfl_score or 0,
                'minutes': ttfl_record.minutes or 0,
                'picked': False  # Frontend handles pick tracking
            })

        # Calculate average from games where player actually played
        avg_ttfl = _calculate_player_avg_ttfl(db, player.id)

        return {
            'player': {
                'id': player_id,
                'name': player.name,
                'team': team_abbrev
            },
            'recent_games': games,
            'avg_ttfl': avg_ttfl
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        print(f"Error in get_player_stats: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error fetching player stats: {str(e)}")

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

import traceback

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

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

@router.get("/players/all")
def get_all_players(db: Session = Depends(get_db)):
    """
    Get all players (id, name, and team) for player lookup.
    Useful for import functionality and search.
    """
    try:
        # Get all active players from cache
        players = app_cache.get_all_players()

        result = []
        for player in players:
            team_abbr = ''
            if player.team:
                team_abbr = str(player.team.abbreviation)

            result.append({
                'player_id': player.nba_player_id,
                'name': player.name,
                'team': team_abbr,
            })

        return result
    except Exception as e:
        print(f"Error in get_all_players: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error fetching all players: {str(e)}")


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

        # Get all completed games for the player's team, left-joining TTFLScore
        # so DNP games (no record or minutes=0) are also included
        recent_scores = (
            db.query(Game, TTFLScore)
            .outerjoin(
                TTFLScore,
                (TTFLScore.game_id == Game.id) & (TTFLScore.player_id == player.id)
            )
            .filter(
                or_(Game.home_team_id == player.team_id, Game.away_team_id == player.team_id),
                Game.status == 'final'
            )
            .order_by(Game.game_date.desc())
            .all()
        )

        games = []
        for game, ttfl_record in recent_scores:
            # Determine opponent based on player's team (use cache, no DB query!)
            if player.team_id == game.home_team_id:
                opponent_team = app_cache.get_team(game.away_team_id)
                is_home = True
            else:
                opponent_team = app_cache.get_team(game.home_team_id)
                is_home = False

            dnp = ttfl_record is None or not ttfl_record.minutes
            games.append({
                'game_date': game.game_date.isoformat(),
                'opponent': opponent_team.abbreviation if opponent_team else "UNK",
                'is_home': is_home,
                'ttfl_score': ttfl_record.ttfl_score if ttfl_record and not dnp else 0,
                'minutes': ttfl_record.minutes if ttfl_record else 0,
                'dnp': dnp,
                'picked': False  # Frontend handles pick tracking
            })

        # Calculate average from games where player actually played
        avg_ttfl = _calculate_player_avg_ttfl(db, player.id)

        # Aggregate stats from played games (exclude DNPs)
        played_scores = [g['ttfl_score'] for g in games if not g['dnp']]
        best_score = max(played_scores) if played_scores else 0
        worst_score = min(played_scores) if played_scores else 0
        if len(played_scores) > 1:
            mean = sum(played_scores) / len(played_scores)
            variance = sum((s - mean) ** 2 for s in played_scores) / len(played_scores)
            std_dev = round(variance ** 0.5, 1)
        else:
            std_dev = 0.0
        consistency = "High" if std_dev < 10 else "Medium" if std_dev < 15 else "Low"

        return {
            'player': {
                'id': player_id,
                'name': player.name,
                'team': team_abbrev
            },
            'recent_games': games,
            'avg_ttfl': avg_ttfl,
            'best_score': best_score,
            'worst_score': worst_score,
            'std_dev': std_dev,
            'consistency': consistency,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in get_player_stats: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error fetching player stats: {str(e)}")

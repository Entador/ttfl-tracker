import traceback

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_

from models.database import get_db
from models import Game, TTFLScore
from services.cache import app_cache

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

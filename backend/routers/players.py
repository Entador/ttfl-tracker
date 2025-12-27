from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from models.database import get_db
from models import Player, Game, Team, TTFLScore

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


@router.get("/players/tonight")
def get_tonights_players(game_date: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Get players for a specific date with TTFL stats.

    Args:
        game_date: Game date in YYYY-MM-DD format (optional, defaults to today)

    Returns:
        List of players playing on the specified date with:
        - player_id, name, team, opponent
        - avg_ttfl: Average TTFL score from recent games
        - is_eligible: Always True (frontend handles pick tracking)
    """
    try:
        # Parse date or default to today
        if game_date:
            target_date = datetime.strptime(game_date, "%Y-%m-%d").date()
        else:
            target_date = date.today()

        # Get games for the target date
        games = db.query(Game).filter(Game.game_date == target_date).all()

        if not games:
            return []

        players_tonight = []

        for game in games:
            # Get home team players
            home_team = db.query(Team).filter(Team.id == game.home_team_id).first()
            away_team = db.query(Team).filter(Team.id == game.away_team_id).first()

            if not home_team or not away_team:
                continue

            # Get active players from home team
            home_players = (
                db.query(Player)
                .filter(Player.team_id == game.home_team_id, Player.is_active == True)
                .all()
            )
            for player in home_players:
                avg_ttfl = _calculate_player_avg_ttfl(db, player.id)
                avg_ttfl_l10 = _calculate_player_avg_ttfl(db, player.id, limit=10)
                avg_ttfl_l30d = _calculate_player_avg_ttfl_last_days(db, player.id, days=30)
                players_tonight.append({
                    'player_id': player.nba_player_id,
                    'name': player.name,
                    'team': home_team.abbreviation,
                    'opponent': away_team.abbreviation,
                    'is_home': True,
                    'avg_ttfl': avg_ttfl,
                    'avg_ttfl_l10': avg_ttfl_l10,
                    'avg_ttfl_l30d': avg_ttfl_l30d,
                    'is_eligible': True,  # Frontend handles pick tracking
                    'last_picked_date': None
                })

            # Get active players from away team
            away_players = (
                db.query(Player)
                .filter(Player.team_id == game.away_team_id, Player.is_active == True)
                .all()
            )
            for player in away_players:
                avg_ttfl = _calculate_player_avg_ttfl(db, player.id)
                avg_ttfl_l10 = _calculate_player_avg_ttfl(db, player.id, limit=10)
                avg_ttfl_l30d = _calculate_player_avg_ttfl_last_days(db, player.id, days=30)
                players_tonight.append({
                    'player_id': player.nba_player_id,
                    'name': player.name,
                    'team': away_team.abbreviation,
                    'opponent': home_team.abbreviation,
                    'is_home': False,
                    'avg_ttfl': avg_ttfl,
                    'avg_ttfl_l10': avg_ttfl_l10,
                    'avg_ttfl_l30d': avg_ttfl_l30d,
                    'is_eligible': True,  # Frontend handles pick tracking
                    'last_picked_date': None
                })

        return players_tonight

    except Exception as e:
        import traceback
        print(f"Error in get_tonights_players: {e}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error fetching tonight's players: {str(e)}")


@router.get("/players/{player_id}/stats")
def get_player_stats(player_id: int, db: Session = Depends(get_db)):
    """
    Get recent game history for a player.

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
        # Find player by NBA player ID
        player = db.query(Player).filter(Player.nba_player_id == player_id).first()

        if not player:
            raise HTTPException(status_code=404, detail="Player not found")

        # Get player's team
        team = db.query(Team).filter(Team.id == player.team_id).first()
        team_abbrev = team.abbreviation if team else ""

        # Get recent games with TTFL scores
        recent_scores = (
            db.query(TTFLScore, Game)
            .join(Game, TTFLScore.game_id == Game.id)
            .filter(TTFLScore.player_id == player.id)
            .order_by(Game.game_date.desc())
            .limit(15)
            .all()
        )

        games = []
        for ttfl_record, game in recent_scores:
            # Determine opponent based on player's team
            if player.team_id == game.home_team_id:
                opponent_team = db.query(Team).filter(Team.id == game.away_team_id).first()
                is_home = True
            else:
                opponent_team = db.query(Team).filter(Team.id == game.home_team_id).first()
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

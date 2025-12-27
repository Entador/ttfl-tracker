from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import date, datetime
from sqlalchemy.orm import Session

from models.database import get_db
from models import Game, Team

router = APIRouter()


@router.get("/games")
def get_games(
    game_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get games for a specific date.

    Args:
        game_date: Game date in YYYY-MM-DD format (optional, defaults to today)

    Returns:
        List of games with home/away teams and status
    """
    try:
        if game_date:
            target_date = datetime.strptime(game_date, "%Y-%m-%d").date()
        else:
            target_date = date.today()

        games = db.query(Game).filter(Game.game_date == target_date).all()

        result = []
        for game in games:
            home_team = db.query(Team).filter(Team.id == game.home_team_id).first()
            away_team = db.query(Team).filter(Team.id == game.away_team_id).first()

            result.append({
                'game_id': game.nba_game_id,
                'home_team': home_team.abbreviation if home_team else "UNK",
                'away_team': away_team.abbreviation if away_team else "UNK",
                'game_date': game.game_date.isoformat(),
                'status': game.status,
                'home_score': game.home_score,
                'away_score': game.away_score
            })

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching games: {str(e)}")

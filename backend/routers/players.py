from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

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


def _batch_calculate_averages(
    db: Session, player_ids: list[int]
) -> dict[int, dict[str, float]]:
    """
    Calculate avg_ttfl, avg_ttfl_l10, avg_ttfl_l30d for multiple players in one query.

    Returns dict: {player_id: {'avg_ttfl': x, 'avg_ttfl_l10': y, 'avg_ttfl_l30d': z}}
    """
    if not player_ids:
        return {}

    cutoff_30d = date.today() - timedelta(days=30)

    # Single query: get all scores for all players, with game dates
    scores_data = (
        db.query(
            TTFLScore.player_id,
            TTFLScore.ttfl_score,
            Game.game_date
        )
        .join(Game, TTFLScore.game_id == Game.id)
        .filter(
            TTFLScore.player_id.in_(player_ids),
            TTFLScore.ttfl_score.isnot(None),
            TTFLScore.minutes > 0
        )
        .order_by(TTFLScore.player_id, Game.game_date.desc())
        .all()
    )

    # Group scores by player
    player_scores = defaultdict(list)
    for player_id, ttfl_score, game_date in scores_data:
        player_scores[player_id].append((ttfl_score, game_date))

    # Calculate averages for each player
    result = {}
    for player_id in player_ids:
        scores = player_scores.get(player_id, [])

        # avg_ttfl: last 15 games (already sorted by date desc)
        last_15 = [s[0] for s in scores[:15]]
        avg_ttfl = round(sum(last_15) / len(last_15), 1) if last_15 else 0.0

        # avg_ttfl_l10: last 10 games
        last_10 = [s[0] for s in scores[:10]]
        avg_ttfl_l10 = round(sum(last_10) / len(last_10), 1) if last_10 else 0.0

        # avg_ttfl_l30d: games in last 30 days
        last_30d = [ttfl for ttfl, gd in scores if gd >= cutoff_30d]
        avg_ttfl_l30d = round(sum(last_30d) / len(last_30d), 1) if last_30d else 0.0

        result[player_id] = {
            'avg_ttfl': avg_ttfl,
            'avg_ttfl_l10': avg_ttfl_l10,
            'avg_ttfl_l30d': avg_ttfl_l30d
        }

    return result


@router.get("/players/tonight")
def get_tonights_players(game_date: Optional[str] = None, db: Session = Depends(get_db)):
    """
    Get players for a specific date with TTFL stats.

    Optimized to use batch queries instead of N+1 pattern.
    ~3 queries total instead of 900+ queries.
    """
    try:
        # Parse date or default to today
        if game_date:
            target_date = datetime.strptime(game_date, "%Y-%m-%d").date()
        else:
            target_date = date.today()

        # Query 1: Get games with teams eager-loaded
        games = (
            db.query(Game)
            .options(joinedload(Game.home_team), joinedload(Game.away_team))
            .filter(Game.game_date == target_date)
            .all()
        )

        if not games:
            return []

        # Collect team IDs playing tonight
        team_ids = set()
        for game in games:
            team_ids.add(game.home_team_id)
            team_ids.add(game.away_team_id)

        # Query 2: Get all active players for tonight's teams
        players = (
            db.query(Player)
            .options(joinedload(Player.team))
            .filter(Player.team_id.in_(team_ids), Player.is_active == True)
            .all()
        )

        # Build player lookup by team_id
        players_by_team = {}
        for player in players:
            if player.team_id not in players_by_team:
                players_by_team[player.team_id] = []
            players_by_team[player.team_id].append(player)

        # Query 3: Batch calculate all TTFL averages
        player_ids = [p.id for p in players]
        averages = _batch_calculate_averages(db, player_ids)

        # Build response (no more queries needed)
        players_tonight = []

        for game in games:
            home_team = game.home_team
            away_team = game.away_team

            if not home_team or not away_team:
                continue

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

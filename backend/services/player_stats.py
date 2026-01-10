"""Player statistics calculation services."""
from collections import defaultdict
from datetime import date, timedelta
from sqlalchemy.orm import Session

from models import Game, TTFLScore


def batch_calculate_averages(
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

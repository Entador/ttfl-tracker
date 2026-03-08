"""
Feature engineering for TTFL score prediction.

Pulls historical data from the database and builds a feature matrix
where each row represents one player-game instance.
"""

import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import case

from models import Player, Game, TTFLScore, Team


def build_feature_matrix(db: Session) -> pd.DataFrame:
    """
    Query all completed games and build features for each player-game row.

    Returns a DataFrame with one row per (player, game) with:
    - Features known before tipoff (rolling averages, opponent stats, context)
    - Target: ttfl_score
    """
    from sqlalchemy.orm import aliased
    OppTeam = aliased(Team)

    rows = (
        db.query(
            TTFLScore.player_id,
            TTFLScore.game_id,
            TTFLScore.ttfl_score,
            Game.game_date,
            Game.home_team_id,
            Game.away_team_id,
            Player.team_id.label("player_team_id"),
            OppTeam.def_rating.label("opp_def_rating"),
            OppTeam.opp_ppg,
            OppTeam.opp_rpg,
            OppTeam.opp_apg,
        )
        .join(Game, TTFLScore.game_id == Game.id)
        .join(Player, TTFLScore.player_id == Player.id)
        .join(
            OppTeam,
            OppTeam.id == case(
                (Game.home_team_id == Player.team_id, Game.away_team_id),
                else_=Game.home_team_id,
            ),
        )
        .filter(
            TTFLScore.ttfl_score.isnot(None),
            TTFLScore.minutes.isnot(None),
            TTFLScore.minutes > 0,
        )
        .order_by(Player.id, Game.game_date)
        .all()
    )

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows, columns=[
        "player_id", "game_id", "ttfl_score", "game_date",
        "home_team_id", "away_team_id", "player_team_id",
        "opp_def_rating", "opp_ppg", "opp_rpg", "opp_apg",
    ])

    df["is_home"] = (df["home_team_id"] == df["player_team_id"]).astype(int)
    df = df.drop(columns=["home_team_id", "away_team_id", "player_team_id"])

    # Rolling averages per player — shift(1) avoids data leakage
    df["avg_ttfl_last_5"] = (
        df.groupby("player_id")["ttfl_score"]
        .transform(lambda s: s.shift(1).rolling(5, min_periods=1).mean())
    )
    df["avg_ttfl_last_10"] = (
        df.groupby("player_id")["ttfl_score"]
        .transform(lambda s: s.shift(1).rolling(10, min_periods=1).mean())
    )

    df = df.dropna(subset=["avg_ttfl_last_5", "avg_ttfl_last_10"])

    return df


FEATURE_COLS = [
    "avg_ttfl_last_5",
    "avg_ttfl_last_10",
    "is_home",
    "opp_def_rating",
    "opp_ppg",
    "opp_rpg",
    "opp_apg",
]

TARGET_COL = "ttfl_score"

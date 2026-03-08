"""
Feature engineering for TTFL score prediction.

Pulls historical data from the database and builds a feature matrix
where each row represents one player-game instance.
"""

import datetime
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import case, and_

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
            TTFLScore.minutes,
            Game.game_date,
            Game.home_team_id,
            Game.away_team_id,
            Player.team_id.label("player_team_id"),
            OppTeam.def_rating.label("opp_def_rating"),
            OppTeam.pace.label("opp_pace"),
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
        "player_id", "game_id", "ttfl_score", "minutes", "game_date",
        "home_team_id", "away_team_id", "player_team_id",
        "opp_def_rating", "opp_pace", "opp_ppg", "opp_rpg", "opp_apg",
    ])

    df["is_home"] = (df["home_team_id"] == df["player_team_id"]).astype(int)

    # Build lookup set of (team_id, date) for all games to detect back-to-backs
    all_games = db.query(Game.home_team_id, Game.away_team_id, Game.game_date).all()
    team_game_days: set[tuple] = set()
    for home_id, away_id, gdate in all_games:
        team_game_days.add((home_id, gdate))
        team_game_days.add((away_id, gdate))

    df["is_back_to_back"] = [
        int((team_id, gdate - datetime.timedelta(days=1)) in team_game_days)
        for team_id, gdate in zip(df["player_team_id"], df["game_date"])
    ]

    df = df.drop(columns=["home_team_id", "away_team_id", "player_team_id"])

    # Intermediate averages (used for trend/delta computation, not kept as features)
    avg_last_5 = (
        df.groupby("player_id")["ttfl_score"]
        .transform(lambda s: s.shift(1).rolling(5, min_periods=1).mean())
    )
    avg_last_10 = (
        df.groupby("player_id")["ttfl_score"]
        .transform(lambda s: s.shift(1).rolling(10, min_periods=1).mean())
    )
    avg_season = (
        df.groupby("player_id")["ttfl_score"]
        .transform(lambda s: s.shift(1).expanding(min_periods=1).mean())
    )

    # Trend: how much is recent form deviating from season baseline
    df["ttfl_trend_5"] = avg_last_5 - avg_season
    df["ttfl_trend_10"] = avg_last_10 - avg_season

    # Std: player volatility over last 5 and 10 games
    df["std_ttfl_last_5"] = (
        df.groupby("player_id")["ttfl_score"]
        .transform(lambda s: s.shift(1).rolling(5, min_periods=2).std())
    )
    df["std_ttfl_last_10"] = (
        df.groupby("player_id")["ttfl_score"]
        .transform(lambda s: s.shift(1).rolling(10, min_periods=2).std())
    )

    # Average minutes in last 5 games — captures role and injury return ramp-up
    df["avg_minutes_last_5"] = (
        df.groupby("player_id")["minutes"]
        .transform(lambda s: s.shift(1).rolling(5, min_periods=1).mean())
    )

    # Keep avg_season only for computing the target
    df["avg_ttfl_season"] = avg_season

    # Games played in the last 10 days (schedule density / fatigue indicator)
    # closed="left" gives window [t-10D, t): excludes current game, no leakage
    df["game_date"] = pd.to_datetime(df["game_date"])

    def _count_games_last_10d(group):
        g = group.set_index("game_date").sort_index()
        counts = pd.Series(1, index=g.index).rolling("10D", closed="left").sum().fillna(0).astype(int)
        return pd.Series(counts.values, index=group.index)

    df["games_last_10d"] = df.groupby("player_id", group_keys=False).apply(_count_games_last_10d)

    df = df.dropna(subset=["ttfl_trend_5", "ttfl_trend_10", "std_ttfl_last_5", "std_ttfl_last_10"])

    # Drop first 10 games per player — rolling features are unreliable on small samples
    df["game_number"] = df.groupby("player_id").cumcount() + 1
    df = df[df["game_number"] > 10].drop(columns=["game_number"])

    # Target: deviation from the player's season average
    df["ttfl_delta"] = df["ttfl_score"] - df["avg_ttfl_season"]

    return df


def build_today_features(db: Session, date: datetime.date) -> pd.DataFrame:
    """
    Build a prediction-ready feature DataFrame for all players scheduled on `date`.

    Returns a DataFrame with FEATURE_COLS plus identity columns:
    - player_id, name, team, opponent, is_home

    Players with no scoring history are excluded.
    """
    # --- Games scheduled on this date ---
    games = db.query(Game).filter(Game.game_date == date).all()
    if not games:
        return pd.DataFrame()

    team_ids = {g.home_team_id for g in games} | {g.away_team_id for g in games}

    # Teams that played yesterday (back-to-back detection)
    yesterday = date - datetime.timedelta(days=1)
    yesterday_games = db.query(Game).filter(Game.game_date == yesterday).all()
    b2b_team_ids = {g.home_team_id for g in yesterday_games} | {g.away_team_id for g in yesterday_games}
    game_by_team = {}
    for g in games:
        game_by_team[g.home_team_id] = g
        game_by_team[g.away_team_id] = g

    teams_by_id = {t.id: t for t in db.query(Team).filter(Team.id.in_(team_ids)).all()}

    players = (
        db.query(Player)
        .filter(Player.team_id.in_(team_ids), Player.is_active == True)
        .all()
    )

    # --- Historical scores per player (all games strictly before date) ---
    history_rows = (
        db.query(
            TTFLScore.player_id,
            TTFLScore.ttfl_score,
            TTFLScore.minutes,
            Game.game_date,
        )
        .join(Game, TTFLScore.game_id == Game.id)
        .filter(
            TTFLScore.player_id.in_([p.id for p in players]),
            TTFLScore.ttfl_score.isnot(None),
            TTFLScore.minutes > 0,
            Game.game_date < date,
        )
        .order_by(TTFLScore.player_id, Game.game_date)
        .all()
    )

    # Group scores and minutes by player
    from collections import defaultdict
    history: dict[int, list[tuple]] = defaultdict(list)  # player_id -> [(date, score, minutes)]
    for row in history_rows:
        history[row.player_id].append((row.game_date, row.ttfl_score, row.minutes))

    # --- Assemble feature rows ---
    rows = []
    for player in players:
        past = history[player.id]  # [(date, score)] sorted chronologically
        if not past:
            continue

        dates = [d for d, _, _ in past]
        scores = [s for _, s, _ in past]
        minutes = [m for _, _, m in past]

        avg_last_5 = sum(scores[-5:]) / len(scores[-5:])
        avg_last_10 = sum(scores[-10:]) / len(scores[-10:])
        avg_season = sum(scores) / len(scores)

        ttfl_trend_5 = avg_last_5 - avg_season
        ttfl_trend_10 = avg_last_10 - avg_season
        avg_minutes_last_5 = sum(minutes[-5:]) / len(minutes[-5:])

        def _std(vals):
            n = len(vals)
            if n < 2:
                return 0.0
            m = sum(vals) / n
            return (sum((x - m) ** 2 for x in vals) / (n - 1)) ** 0.5

        std_last_5 = _std(scores[-5:])
        std_last_10 = _std(scores[-10:])

        cutoff = date - datetime.timedelta(days=10)
        games_last_10d = sum(1 for d in dates if d > cutoff)

        game = game_by_team[player.team_id]
        is_home = int(player.team_id == game.home_team_id)
        opp_id = game.away_team_id if is_home else game.home_team_id
        opp = teams_by_id.get(opp_id)

        if opp is None or opp.def_rating is None or opp.pace is None:
            continue

        rows.append({
            "player_id": player.id,
            "name": player.name,
            "team": player.team.abbreviation if player.team else "",
            "opponent": opp.abbreviation,
            "is_home": is_home,
            "is_back_to_back": int(player.team_id in b2b_team_ids),
            "avg_ttfl_season": avg_season,
            "ttfl_trend_5": ttfl_trend_5,
            "ttfl_trend_10": ttfl_trend_10,
            "std_ttfl_last_5": std_last_5,
            "std_ttfl_last_10": std_last_10,
            "avg_minutes_last_5": avg_minutes_last_5,
            "games_last_10d": games_last_10d,
            "opp_def_rating": opp.def_rating,
            "opp_pace": opp.pace,
            "opp_ppg": opp.opp_ppg,
            "opp_rpg": opp.opp_rpg,
            "opp_apg": opp.opp_apg,
        })

    return pd.DataFrame(rows)



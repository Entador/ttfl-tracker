def calculate_ttfl_score(box_score: dict) -> int:
    """
    Calculate TTFL score from NBA box score statistics.

    Formula:
    POSITIVE: PTS + REB + AST + STL + BLK + FGM + 3PM + FTM
    NEGATIVE: TOV + FG_missed + 3P_missed + FT_missed
    TTFL_SCORE = POSITIVE - NEGATIVE

    Args:
        box_score: Dictionary containing player stats

    Returns:
        Calculated TTFL score as integer
    """
    # Positive contributions
    pts = box_score.get('PTS', 0) or 0
    reb = box_score.get('REB', 0) or 0
    ast = box_score.get('AST', 0) or 0
    stl = box_score.get('STL', 0) or 0
    blk = box_score.get('BLK', 0) or 0
    fgm = box_score.get('FGM', 0) or 0
    fg3m = box_score.get('FG3M', 0) or 0
    ftm = box_score.get('FTM', 0) or 0

    positive = pts + reb + ast + stl + blk + fgm + fg3m + ftm

    # Negative contributions (missed shots)
    tov = box_score.get('TOV', 0) or 0

    # Calculate misses from attempts and makes
    fga = box_score.get('FGA', 0) or 0
    fg_missed = fga - fgm

    fg3a = box_score.get('FG3A', 0) or 0
    fg3_missed = fg3a - fg3m

    fta = box_score.get('FTA', 0) or 0
    ft_missed = fta - ftm

    negative = tov + fg_missed + fg3_missed + ft_missed

    return int(positive - negative)
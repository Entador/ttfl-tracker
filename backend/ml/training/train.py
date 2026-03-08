"""
Training script for the TTFL linear regression model.

Usage:
    poetry run python -m ml.training.train              # build from DB, train
    poetry run python -m ml.training.train --export     # build from DB, save CSV, train
    poetry run python -m ml.training.train --from-csv   # load from CSV, train (fast)
"""

import sys
import argparse
import pandas as pd
from pathlib import Path

# Allow running from the backend/ directory
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from ml.models.predictor import TTFLPredictor

DATA_PATH = Path(__file__).parent.parent / "artifacts" / "dataset.csv"

# --- Experiment config ---
# Edit freely: add/remove features without touching predictor.py or baselines
FEATURE_COLS = [
    "ttfl_trend_5",
    "ttfl_trend_10",
    "std_ttfl_last_5",
    "std_ttfl_last_10",
    "avg_minutes_last_5",
    "games_last_10d",
    "is_home",
    "is_back_to_back",
    "opp_def_rating",
    "opp_pace",
    "opp_ppg",
    "opp_rpg",
    "opp_apg",
]
TARGET_COL = "ttfl_delta"
# -------------------------


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--export", action="store_true", help="Build from DB and save dataset to CSV")
    parser.add_argument("--from-csv", action="store_true", help="Load dataset from CSV instead of DB")
    args = parser.parse_args()

    if args.from_csv:
        if not DATA_PATH.exists():
            print(f"No CSV found at {DATA_PATH}. Run with --export first.")
            return
        print(f"Loading dataset from {DATA_PATH}...")
        df = pd.read_csv(DATA_PATH, parse_dates=["game_date"])
    else:
        from models.database import SessionLocal
        from ml.data.features import build_feature_matrix
        print("Connecting to database...")
        db = SessionLocal()
        try:
            print("Building feature matrix...")
            df = build_feature_matrix(db)
        finally:
            db.close()

        if args.export:
            DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
            df.to_csv(DATA_PATH, index=False)
            print(f"Dataset saved to {DATA_PATH}")

    if df.empty:
        print("No data found.")
        return

    print(f"Dataset: {len(df)} player-game rows, {df['player_id'].nunique()} players")
    print(f"Features: {FEATURE_COLS}")
    print(f"Target  : {TARGET_COL}")

    predictor = TTFLPredictor()
    metrics = predictor.train(df, FEATURE_COLS, TARGET_COL)

    print("\n--- Results ---")
    print(f"  Cutoff date      : {metrics['cutoff_date']}")
    print(f"  Train samples    : {metrics['n_train']}")
    print(f"  Test samples     : {metrics['n_test']}")
    print(f"  Train MAE        : {metrics['train_mae']} pts")
    print(f"  Test MAE (model) : {metrics['mae']} pts")
    print(f"  R²               : {metrics['r2']}")
    gap = metrics['mae'] - metrics['train_mae']
    print(f"  MAE gap          : {gap:+.2f} pts  {'⚠ possible overfit' if gap > 3 else '✓ ok'}")

    best_baseline = min(metrics['baseline_zero_mae'], metrics['baseline_last5_mae'], metrics['baseline_last10_mae'])
    improvement = best_baseline - metrics['mae']
    print(f"\n--- Baseline Comparison (test set, delta target) ---")
    print(f"  predict 0 (season avg)   : {metrics['baseline_zero_mae']} pts")
    print(f"  last_5 - season_avg      : {metrics['baseline_last5_mae']} pts")
    print(f"  last_10 - season_avg     : {metrics['baseline_last10_mae']} pts")
    print(f"  Model vs best            : {improvement:+.2f} pts  {'✓ model wins' if improvement > 0 else '✗ baseline wins'}")

    print("\n--- Feature Importances ---")
    for feat, score in predictor.feature_importance().items():
        print(f"  {feat:<25} {score}")

    predictor.save()
    print("\nModel saved to ml/artifacts/lgbm.joblib")


if __name__ == "__main__":
    main()

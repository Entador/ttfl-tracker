"""
Training script for the TTFL linear regression model.

Usage:
    poetry run python -m ml.training.train
"""

import sys
from pathlib import Path

# Allow running from the backend/ directory
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from models.database import SessionLocal
from ml.data.features import build_feature_matrix
from ml.models.predictor import TTFLPredictor


def main():
    print("Connecting to database...")
    db = SessionLocal()

    try:
        print("Building feature matrix...")
        df = build_feature_matrix(db)

        if df.empty:
            print("No data found. Make sure the database has completed games.")
            return

        print(f"Dataset: {len(df)} player-game rows, {df['player_id'].nunique()} players")

        print("Training linear regression model...")
        predictor = TTFLPredictor()
        metrics = predictor.train(df)

        print("\n--- Results ---")
        print(f"  Train samples : {metrics['n_train']}")
        print(f"  Test samples  : {metrics['n_test']}")
        print(f"  MAE           : {metrics['mae']} pts")
        print(f"  R²            : {metrics['r2']}")

        print("\n--- Feature Importances ---")
        for feat, score in predictor.feature_importance().items():
            print(f"  {feat:<25} {score}")

        predictor.save()
        print("\nModel saved to ml/artifacts/lgbm.joblib")

    finally:
        db.close()


if __name__ == "__main__":
    main()

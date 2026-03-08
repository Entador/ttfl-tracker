"""
LightGBM regressor for TTFL score prediction.

Wraps LGBMRegressor with train/predict/save/load helpers.
"""

import joblib
import pandas as pd
from pathlib import Path
from lightgbm import LGBMRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

from ml.data.features import FEATURE_COLS, TARGET_COL

ARTIFACTS_DIR = Path(__file__).parent.parent / "artifacts"
MODEL_PATH = ARTIFACTS_DIR / "lgbm.joblib"


class TTFLPredictor:
    def __init__(self):
        self.model = LGBMRegressor(
            n_estimators=500,
            learning_rate=0.05,
            num_leaves=31,
            random_state=42,
        )

    def train(self, df: pd.DataFrame) -> dict:
        """
        Train on a feature matrix produced by build_feature_matrix().

        Returns evaluation metrics on the held-out test set.
        """
        df = df.dropna(subset=FEATURE_COLS + [TARGET_COL])

        X = df[FEATURE_COLS]
        y = df[TARGET_COL]

        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        self.model.fit(
            X_train,
            y_train,
            eval_set=[(X_test, y_test)],
            callbacks=[],
        )

        y_pred = self.model.predict(X_test)
        metrics = {
            "mae": round(mean_absolute_error(y_test, y_pred), 2),
            "r2": round(r2_score(y_test, y_pred), 4),
            "n_train": len(X_train),
            "n_test": len(X_test),
        }

        return metrics

    def predict(self, features: pd.DataFrame) -> list[float]:
        """
        Predict TTFL scores for one or more players.

        Args:
            features: DataFrame with columns matching FEATURE_COLS

        Returns:
            List of predicted TTFL scores.
        """
        return self.model.predict(features[FEATURE_COLS]).tolist()

    def feature_importance(self) -> dict:
        """Returns feature importances ranked by gain."""
        return dict(
            sorted(
                zip(FEATURE_COLS, self.model.feature_importances_),
                key=lambda x: x[1],
                reverse=True,
            )
        )

    def save(self, path: Path = MODEL_PATH) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self.model, path)

    def load(self, path: Path = MODEL_PATH) -> None:
        self.model = joblib.load(path)

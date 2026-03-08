"""
LightGBM regressor for TTFL score prediction.

Wraps LGBMRegressor with train/predict/save/load helpers.
"""

import joblib
import pandas as pd
from pathlib import Path
from lightgbm import LGBMRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split, cross_val_score

ARTIFACTS_DIR = Path(__file__).parent.parent / "artifacts"
MODEL_PATH = ARTIFACTS_DIR / "lgbm.joblib"


class TTFLPredictor:
    def __init__(self):
        self.model = LGBMRegressor(
            n_estimators=200,
            learning_rate=0.02,
            num_leaves=8,       # shallow trees — less overfitting
            min_child_samples=100,  # require at least 100 samples per leaf
            reg_lambda=5.0,     # L2 regularization
            random_state=42,
        )
        self.feature_cols: list[str] = []
        self.target_col: str = ""

    def train(self, df: pd.DataFrame, feature_cols: list[str], target_col: str) -> dict:
        """
        Train on a feature matrix produced by build_feature_matrix().

        Uses a time-based split (last 20% of dates as test set) to avoid
        temporal leakage from rolling-average features.

        `df` should contain all computed columns (the full feature matrix).
        Only FEATURE_COLS are used for training — baselines are computed from
        fixed columns that are always present, independent of FEATURE_COLS.

        Returns evaluation metrics on the held-out test set.
        """
        self.feature_cols = feature_cols
        self.target_col = target_col

        df = df.dropna(subset=feature_cols + [target_col])
        df = df.sort_values("game_date").reset_index(drop=True)

        # Temporal split: keep all columns so baselines can read any column
        cutoff = df["game_date"].quantile(0.8)
        df_train = df[df["game_date"] <= cutoff]
        df_test = df[df["game_date"] > cutoff]

        # Model only sees feature_cols — baselines use the full df_test
        X_train = df_train[feature_cols]
        y_train = df_train[target_col]
        X_test = df_test[feature_cols]
        y_test = df_test[target_col]

        self.model.fit(
            X_train,
            y_train,
            eval_set=[(X_test, y_test)],
            callbacks=[],
        )

        y_pred_test = self.model.predict(X_test)
        y_pred_train = self.model.predict(X_train)

        # Baselines read from df_test (all columns always available)
        # These never change regardless of feature_cols
        zeros = pd.Series(0, index=df_test.index)
        baseline_zero_mae = round(mean_absolute_error(y_test, zeros), 2)
        baseline_last5_mae = round(mean_absolute_error(y_test, df_test["ttfl_trend_5"]), 2)
        baseline_last10_mae = round(mean_absolute_error(y_test, df_test["ttfl_trend_10"]), 2)

        metrics = {
            "train_mae": round(mean_absolute_error(y_train, y_pred_train), 2),
            "mae": round(mean_absolute_error(y_test, y_pred_test), 2),
            "r2": round(r2_score(y_test, y_pred_test), 4),
            "n_train": len(X_train),
            "n_test": len(X_test),
            "cutoff_date": str(cutoff),
            "baseline_zero_mae": baseline_zero_mae,
            "baseline_last5_mae": baseline_last5_mae,
            "baseline_last10_mae": baseline_last10_mae,
        }

        return metrics

    def predict(self, features: pd.DataFrame) -> list[float]:
        """
        Predict for one or more players.

        Args:
            features: DataFrame containing self.feature_cols

        Returns:
            List of predicted values.
        """
        return self.model.predict(features[self.feature_cols]).tolist()

    def feature_importance(self) -> dict:
        """Returns feature importances ranked by gain."""
        return dict(
            sorted(
                zip(self.feature_cols, self.model.feature_importances_),
                key=lambda x: x[1],
                reverse=True,
            )
        )

    def save(self, path: Path = MODEL_PATH) -> None:
        """Save the full predictor (model + feature_cols + target_col)."""
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path)

    @classmethod
    def load(cls, path: Path = MODEL_PATH) -> "TTFLPredictor":
        """Load a saved predictor."""
        return joblib.load(path)

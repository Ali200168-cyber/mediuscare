from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, IsolationForest
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, mean_absolute_error
from sklearn.model_selection import train_test_split

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "training_data.csv"
MODEL_DIR = BASE_DIR / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

LAG_COUNT = 6


def _coalesce_glucose(row: pd.Series) -> float:
    for col in ["glucose", "postMealGlucose", "randomGlucose", "fastingGlucose"]:
        if col in row and pd.notna(row[col]):
            return float(row[col])
    return np.nan


def _build_glucose_training(df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
    rows_x: List[List[float]] = []
    rows_y: List[float] = []
    grouped = df.sort_values("timestamp").groupby("patientId")
    for _, group in grouped:
        g = group.copy()
        g["glucose_value"] = g.apply(_coalesce_glucose, axis=1)
        g = g.dropna(subset=["glucose_value"])
        values = g["glucose_value"].to_list()
        if len(values) <= LAG_COUNT:
            continue
        age_vals = g["age"].fillna(g["age"].median()).to_list() if "age" in g.columns else [0] * len(values)
        weight_vals = g["weight"].fillna(g["weight"].median()).to_list() if "weight" in g.columns else [0] * len(values)
        meal_hours_vals = (
            g["mealHoursAgo"].fillna(g["mealHoursAgo"].median()).to_list() if "mealHoursAgo" in g.columns else [0] * len(values)
        )
        for idx in range(LAG_COUNT, len(values)):
            lag_slice = values[idx - LAG_COUNT : idx]
            rows_x.append([*lag_slice, age_vals[idx], weight_vals[idx], meal_hours_vals[idx]])
            rows_y.append(values[idx])
    return np.array(rows_x, dtype=float), np.array(rows_y, dtype=float)


def _bp_category(systolic: float, diastolic: float) -> int:
    if systolic >= 140 or diastolic >= 90:
        return 3  # Stage 2
    if systolic >= 130 or diastolic >= 80:
        return 2  # Stage 1
    if systolic >= 120 and diastolic < 80:
        return 1  # Pre-Hypertension
    return 0  # Normal


def main() -> None:
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Training data not found: {DATA_PATH}")

    df = pd.read_csv(DATA_PATH)
    required = {"patientId", "timestamp", "systolic", "diastolic"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}")

    xg, yg = _build_glucose_training(df)
    if len(xg) < 30:
        raise ValueError("Not enough glucose sequence data. Need at least 30 sequence rows.")

    xg_train, xg_test, yg_train, yg_test = train_test_split(xg, yg, test_size=0.2, random_state=42)
    glucose_model = HistGradientBoostingRegressor(max_depth=6, learning_rate=0.05, max_iter=300, random_state=42)
    glucose_model.fit(xg_train, yg_train)
    glucose_pred = glucose_model.predict(xg_test)
    glucose_mae = float(mean_absolute_error(yg_test, glucose_pred))

    xh = df[["systolic", "diastolic"]].fillna(0).copy()
    xh["age"] = df["age"].fillna(df["age"].median()) if "age" in df.columns else 0
    xh["weight"] = df["weight"].fillna(df["weight"].median()) if "weight" in df.columns else 0
    yh = np.array([_bp_category(float(s), float(d)) for s, d in zip(df["systolic"], df["diastolic"])], dtype=int)

    xh_train, xh_test, yh_train, yh_test = train_test_split(xh.values, yh, test_size=0.2, random_state=42)
    htn_model = LogisticRegression(max_iter=1200, multi_class="multinomial")
    htn_model.fit(xh_train, yh_train)
    htn_acc = float(accuracy_score(yh_test, htn_model.predict(xh_test)))

    xa = df[["systolic", "diastolic"]].fillna(0).copy()
    xa["glucose"] = df.apply(_coalesce_glucose, axis=1).fillna(0)
    anomaly_model = IsolationForest(n_estimators=250, contamination=0.08, random_state=42)
    anomaly_model.fit(xa.values)

    joblib.dump(glucose_model, MODEL_DIR / "glucose_model.joblib")
    joblib.dump(htn_model, MODEL_DIR / "hypertension_model.joblib")
    joblib.dump(anomaly_model, MODEL_DIR / "anomaly_model.joblib")
    joblib.dump({"lag_count": LAG_COUNT}, MODEL_DIR / "meta.joblib")

    print("Training complete")
    print(f"- glucose MAE: {glucose_mae:.3f}")
    print(f"- hypertension accuracy: {htn_acc:.3f}")
    print(f"- models saved in: {MODEL_DIR}")


if __name__ == "__main__":
    main()

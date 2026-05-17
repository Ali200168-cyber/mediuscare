from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="MediusCare AI Service", version="2.0.0")

MODEL_DIR = Path(__file__).resolve().parent / "models"

_glucose_model = None
_htn_model = None
_anomaly_model = None
_meta = {"lag_count": 6}


class PredictRequest(BaseModel):
    patientId: str
    records: List[Dict[str, Any]]


def _load_models() -> None:
    global _glucose_model, _htn_model, _anomaly_model, _meta
    glucose_path = MODEL_DIR / "glucose_model.joblib"
    htn_path = MODEL_DIR / "hypertension_model.joblib"
    anomaly_path = MODEL_DIR / "anomaly_model.joblib"
    meta_path = MODEL_DIR / "meta.joblib"
    if not (glucose_path.exists() and htn_path.exists() and anomaly_path.exists()):
        raise RuntimeError("Models are not trained. Run train.py first.")
    _glucose_model = joblib.load(glucose_path)
    _htn_model = joblib.load(htn_path)
    _anomaly_model = joblib.load(anomaly_path)
    if meta_path.exists():
        _meta = joblib.load(meta_path)


def _coalesce_glucose(record: Dict[str, Any]) -> Optional[float]:
    for key in ["glucose", "postMealGlucose", "randomGlucose", "fastingGlucose"]:
        val = record.get(key)
        if val is not None:
            return float(val)
    return None


def _bp_category_label(code: int) -> str:
    return {0: "Normal", 1: "Pre-Hypertension", 2: "Stage 1", 3: "Stage 2"}.get(code, "Unknown")


def _trend(values: List[float]) -> str:
    if len(values) < 2:
        return "Stable"
    delta = values[-1] - values[0]
    if delta > 8:
        return "Increasing"
    if delta < -8:
        return "Decreasing"
    return "Stable"


def _predict_glucose(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    lag_count = int(_meta.get("lag_count", 6))
    glucose_series = [g for g in [_coalesce_glucose(r) for r in records] if g is not None]
    if len(glucose_series) < lag_count:
        raise HTTPException(status_code=422, detail=f"Need at least {lag_count} glucose points for prediction")

    latest = records[-1]
    age = float(latest.get("age", 0) or 0)
    weight = float(latest.get("weight", 0) or 0)
    meal_hours = float(latest.get("mealHoursAgo", 0) or 0)

    window = glucose_series[-lag_count:]
    preds = []
    # Recursive next 6 steps => 24h if each step ~4h.
    for step in range(6):
        features = np.array([[*window, age, weight, meal_hours + step * 4]])
        next_val = float(_glucose_model.predict(features)[0])
        next_val = max(45.0, min(380.0, next_val))
        preds.append(round(next_val, 2))
        window = [*window[1:], next_val]

    return {
        "current": round(glucose_series[-1], 2),
        "next_6_to_24h": preds,
        "trend": _trend(preds),
        "confidence": round(max(0.45, min(0.95, 0.9 - (np.std(window) / 180))), 2),
    }


def _predict_hypertension(record: Dict[str, Any]) -> Dict[str, Any]:
    systolic = float(record.get("systolic", 0) or 0)
    diastolic = float(record.get("diastolic", 0) or 0)
    age = float(record.get("age", 0) or 0)
    weight = float(record.get("weight", 0) or 0)
    x = np.array([[systolic, diastolic, age, weight]])
    proba = _htn_model.predict_proba(x)[0]
    code = int(np.argmax(proba))
    return {
        "category": _bp_category_label(code),
        "probability_score": round(float(np.max(proba)), 3),
    }


def _detect_anomaly(record: Dict[str, Any], glucose_info: Dict[str, Any]) -> Dict[str, Any]:
    glucose = float(_coalesce_glucose(record) or 0)
    systolic = float(record.get("systolic", 0) or 0)
    diastolic = float(record.get("diastolic", 0) or 0)
    score = int(_anomaly_model.predict(np.array([[systolic, diastolic, glucose]]))[0])
    # -1 => anomaly from model
    level = "Low"
    if glucose >= 300 or glucose <= 60 or systolic >= 180 or diastolic >= 120:
        level = "Critical"
    elif score == -1 or glucose >= 240 or systolic >= 160:
        level = "High"
    elif glucose_info["trend"] == "Increasing" or systolic >= 140 or diastolic >= 90:
        level = "Medium"
    return {"alert_level": level, "model_anomaly": score == -1}


def _recommendations(glucose_info: Dict[str, Any], htn_info: Dict[str, Any], anomaly: Dict[str, Any]) -> Dict[str, Any]:
    lifestyle = []
    if glucose_info["trend"] == "Increasing":
        lifestyle.append("Reduce high-sugar intake and favor high-fiber meals for upcoming hours.")
    if htn_info["category"] in {"Stage 1", "Stage 2"}:
        lifestyle.append("Limit sodium today and include light movement as tolerated.")
    if not lifestyle:
        lifestyle.append("Continue current healthy routine and hydration.")

    preventive = []
    if glucose_info["trend"] == "Increasing":
        preventive.append("Your glucose may rise in the next 3 hours; take precautions before meal.")
    if anomaly["alert_level"] in {"High", "Critical"}:
        preventive.append("Monitor BP closely today and repeat vitals soon.")
    if not preventive:
        preventive.append("No immediate danger trend detected; continue regular monitoring.")

    return {
        "lifestyle_suggestions": lifestyle,
        "medication_awareness": "Consult your doctor for dosage adjustment; medication may need review.",
        "preventive_actions": preventive,
    }


@app.on_event("startup")
def on_startup() -> None:
    _load_models()


@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "models_loaded": _glucose_model is not None}


@app.post("/predict")
def predict(payload: PredictRequest) -> Dict[str, Any]:
    if len(payload.records) < 6:
        raise HTTPException(status_code=400, detail="Need at least 6 records for robust prediction")

    latest = payload.records[-1]
    glucose_info = _predict_glucose(payload.records)
    htn_info = _predict_hypertension(latest)
    anomaly = _detect_anomaly(latest, glucose_info)
    recs = _recommendations(glucose_info, htn_info, anomaly)

    return {
        "prediction": {
            "glucose_forecast": glucose_info["next_6_to_24h"],
            "glucose_trend": glucose_info["trend"],
            "hypertension_category": htn_info["category"],
            "hypertension_probability": htn_info["probability_score"],
            "anomaly_alert_level": anomaly["alert_level"],
        },
        "confidence": glucose_info["confidence"],
        "risk_level": anomaly["alert_level"],
        "explanation": {
            "summary": "Three models ran on your vitals: glucose forecast (lagged gradient boosting), BP classifier (logistic regression), anomaly guard (isolation forest).",
            "models": [
                {"name": "glucose_forecast", "type": "HistGradientBoostingRegressor", "inputs": "6+ glucose readings + meal/weight context"},
                {"name": "hypertension_classifier", "type": "Multinomial LogisticRegression", "inputs": "systolic, diastolic, age, weight"},
                {"name": "anomaly_detection", "type": "IsolationForest", "inputs": "glucose + BP pattern"},
            ],
            "disclaimer": "Decision support only — not a diagnosis. Dosage requires doctor approval.",
        },
        "recommendation": recs,
        "requires_doctor_approval": True,
        "alerts": [
            {
                "type": "anomaly_detection",
                "severity": anomaly["alert_level"],
                "recommended_action": "AI assists doctors and does not replace clinical judgment.",
            }
        ],
    }

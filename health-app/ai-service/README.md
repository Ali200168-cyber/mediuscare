# MediusCare AI Model Training

This service now uses trained ML models (not static rules only).

## 1) Prepare training data

Create `ai-service/data/training_data.csv` with columns:

- `patientId`
- `timestamp` (ISO date/time)
- `glucose` (or `fastingGlucose` / `randomGlucose` / `postMealGlucose`)
- `systolic`
- `diastolic`
- optional: `age`, `weight`, `mealHoursAgo`

### Fast way from your real DB (+ large augmentation)

From `health-app/backend` run:

```bash
npm run export-ai-data
```

This exports real `HealthEntry` data into `ai-service/data/training_data.csv` and augments with synthetic variants.

You can control volume:

```bash
node scripts/exportTrainingData.js --augment=12 --minRows=50000
```

- `augment`: synthetic rows per real row
- `minRows`: keep generating until this total row count

## 2) Install dependencies

```bash
pip install -r requirements.txt
```

## One-command full pipeline (recommended)

From `health-app` root:

```bash
npm run ai:pipeline
```

This will:
1) Export real + augmented data from MongoDB  
2) Install Python requirements  
3) Train models  
4) Start AI service on `:8000`

Custom size:

```bash
npm run ai:pipeline -- --augment=20 --minRows=200000
```

## 3) Train models

```bash
python train.py
```

This creates:

- `models/glucose_model.joblib`
- `models/hypertension_model.joblib`
- `models/anomaly_model.joblib`
- `models/meta.joblib`

## 4) Run AI service

```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

## Notes

- Glucose forecasting is a sequence model built from lagged time-series features.
- Hypertension risk uses trained multinomial logistic classification.
- Anomaly detection uses trained isolation forest + safety thresholds.
- Output is clinical decision support only and must be doctor-reviewed.
# MediusCare AI Service (Starter)

## Run locally

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Set backend env:

- `AI_SERVICE_URL=http://localhost:8000`

This starter service provides `/predict` and `/health` endpoints and follows the MediusCare AI output contract.

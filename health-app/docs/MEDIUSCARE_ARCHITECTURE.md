# MediusCare System Architecture

## 1) High-Level Architecture

MediusCare is designed as a modular, healthcare-safe platform:

- `frontend` (React + Context/Redux): role-based UI for patient, doctor, caregiver, admin
- `backend` (Node.js + Express): REST APIs, auth, RBAC, scheduling, alerts, reporting
- `database` (MongoDB): user, vitals, AI predictions, alerts, consultations, audit logs
- `ai-service` (Python/FastAPI): LSTM glucose forecasting, BP risk classifier, anomaly engine
- `integration-layer`: Zoom, Twilio/Firebase, SMTP email
- `security-layer`: JWT auth, rate limits, encryption, audit trails, session controls

Recommended deployment:

- Frontend on Vercel
- Backend on Render/AWS ECS
- AI service on Render/AWS EC2 or container runtime
- MongoDB Atlas
- Redis for queues/caching (optional but recommended)

---

## 2) Role-Based Access (RBAC)

Roles:

- `patient`: create and view own health data, dashboards, alerts, appointments
- `doctor`: monitor assigned patients, review AI outputs, approve recommendations
- `caregiver`: view linked patient summaries and critical alerts
- `admin`: manage users, permissions, AI logs, and system health

Authorization pattern:

1. Verify JWT
2. Attach user to request context
3. Enforce route-level role checks
4. Enforce resource-level ownership/assignment checks

---

## 3) MongoDB Schema Design

## `users`
- `_id`, `name`, `email`, `phone`, `cnic`, `passwordHash`, `role`, `isActive`
- `assignedDoctorId`, `linkedCaregiverIds[]`
- `createdAt`, `updatedAt`, `lastLoginAt`

## `health_records`
- `_id`, `patientId`, `recordedAt`
- `glucose`, `systolicBP`, `diastolicBP`, `heartRate`, `weight`
- `meals[]`, `symptoms[]`, `medications[]`
- `attachments[]` (URL, mimeType, uploadedBy)

## `ai_predictions`
- `_id`, `patientId`, `sourceRecordIds[]`, `module`
- `prediction`, `confidence`, `riskLevel`, `explanation`, `recommendation`
- `requiresDoctorApproval`, `approvalStatus`, `approvedBy`, `approvedAt`
- `alerts[]`, `createdAt`

## `alerts`
- `_id`, `patientId`, `type`, `severity`, `message`, `channel[]`
- `status`, `acknowledgedBy`, `acknowledgedAt`, `createdAt`

## `consultations`
- `_id`, `patientId`, `doctorId`, `scheduledAt`, `meetingProvider`, `meetingLink`
- `status`, `summary`, `notes`, `createdAt`

## `audit_logs`
- `_id`, `actorId`, `action`, `resourceType`, `resourceId`
- `metadata`, `ip`, `userAgent`, `createdAt`

---

## 4) API Design (REST)

Auth:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

Health:

- `POST /api/health` (patient create health record)
- `GET /api/health/me` (patient own records)
- `GET /api/health/:patientId` (doctor/caregiver/admin)

AI:

- `POST /api/ai/predict/:patientId`
- `GET /api/ai/history/:patientId`
- `POST /api/ai/review/:predictionId` (doctor approval/rejection)

Alerts:

- `GET /api/alerts/me`
- `PATCH /api/alerts/:alertId/ack`

Consultations:

- `POST /api/consultations/schedule`
- `GET /api/consultations/me`

Reports:

- `GET /api/reports/:patientId?range=weekly|monthly&format=pdf|csv`

Admin:

- `GET /api/admin/users`
- `PATCH /api/admin/users/:id/status`
- `GET /api/admin/system-logs`
- `GET /api/admin/ai-performance`

---

## 5) Standard AI Output Contract

Every AI module response must follow:

```json
{
  "prediction": {},
  "confidence": 0.0,
  "risk_level": "",
  "explanation": "",
  "recommendation": "",
  "requires_doctor_approval": true,
  "alerts": []
}
```

If required input data is missing:

- return HTTP `400`
- include actionable validation details
- never generate treatment recommendation without required safety context

---

## 6) AI Module Design

## A) Glucose Prediction (LSTM)

- Input: recent glucose timeline + contextual features (meal, medication, activity)
- Output: next 6-24 hour glucose curve + confidence + trend explanation
- Runtime target: 2-8 seconds

## B) BP Risk Classification (SVM / Logistic Regression)

- Input: BP history + risk factors
- Output: `Normal | Pre-HTN | Stage 1 | Stage 2`

## C) Insulin Recommendation (Rule + model)

- Always sets `requires_doctor_approval = true`
- Never auto-applies dosage

## D) Anomaly Detection

- Detect dangerous vitals/outliers and trigger real-time alerts

## E) Explainability

- Human-readable rationale for clinician and patient views
- Include top contributing features

---

## 7) Sample Backend Code (Express)

```js
router.post("/ai/predict/:patientId", verifyToken, allowRoles("doctor", "patient"), async (req, res) => {
  const { patientId } = req.params;
  const records = await HealthRecord.find({ patientId }).sort({ recordedAt: -1 }).limit(100);
  if (!records.length) {
    return res.status(400).json({ success: false, message: "Missing health data for prediction." });
  }

  const aiResp = await axios.post(`${process.env.AI_SERVICE_URL}/predict`, { patientId, records });
  const saved = await AIPrediction.create({ patientId, ...aiResp.data });
  return res.json({ success: true, predictionId: saved._id, result: aiResp.data });
});
```

---

## 8) Sample AI Service Code (FastAPI)

```python
@app.post("/predict")
def predict(payload: PredictRequest):
    if len(payload.records) < 8:
        raise HTTPException(status_code=400, detail="Not enough records for safe prediction")

    glucose_result = run_lstm(payload.records)
    bp_result = run_bp_classifier(payload.records)

    return {
        "prediction": {
            "glucose_forecast": glucose_result["series"],
            "bp_classification": bp_result["class"]
        },
        "confidence": min(glucose_result["confidence"], bp_result["confidence"]),
        "risk_level": bp_result["risk_level"],
        "explanation": "Trend indicates elevated evening glucose and moderate BP variability.",
        "recommendation": "Follow care plan and consult assigned doctor before medication changes.",
        "requires_doctor_approval": True,
        "alerts": glucose_result.get("alerts", [])
    }
```

---

## 9) Frontend UX Requirements (Implemented Auth + Next Steps)

Implemented auth experience:

- Full landing + authentication split-screen
- Navbar and branded hero area
- Login + Sign Up toggle with smooth visual transitions
- Real-time validation and password strength indicator
- Loading spinner, success/error feedback, masked password toggle
- Role selection on sign-up and JWT storage on login

Recommended next UI steps:

- Add shared design system tokens (`colors`, `spacing`, `radius`, `shadow`)
- Build role-specific dashboards from reusable chart cards and status widgets
- Add accessibility pass (focus state, color contrast, keyboard nav, aria labels)

---

## 10) Security Controls

- HTTPS/TLS end-to-end
- JWT access token + refresh strategy
- Password hashing with bcrypt
- API rate limiting and lockout for brute-force protection
- Field-level validation and sanitization
- Session timeout and forced logout on suspicious behavior
- Encrypted backups and audit logging for sensitive actions

---

## 11) Performance Targets

- API median under 500 ms (excluding long AI calls)
- AI prediction 2-8 seconds
- Dashboard first meaningful paint under 3 seconds
- 50-100 concurrent users with horizontal backend scaling

---

## 12) Deployment Steps

1. Set environment variables for frontend/backend/ai services
2. Deploy MongoDB Atlas and create indexes
3. Deploy backend and AI service as separate containers
4. Configure frontend API base URLs
5. Configure Zoom/Twilio/SMTP secrets
6. Enable HTTPS, CORS allow-list, and rate limits
7. Add monitoring (logs, uptime, latency, alerting)
8. Run smoke tests for each role before production


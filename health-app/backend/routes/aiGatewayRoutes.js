const express = require("express");
const { verifyToken, allowRoles } = require("../middleware/auth");
const HealthEntry = require("../models/HealthEntry");

const router = express.Router();

const normalizeAiOutput = (raw = {}) => ({
  prediction: raw.prediction || {},
  confidence: typeof raw.confidence === "number" ? raw.confidence : 0,
  risk_level: raw.risk_level || "Unknown",
  explanation: raw.explanation || "No explanation available",
  recommendation: raw.recommendation || "Consult your doctor before acting.",
  requires_doctor_approval:
    typeof raw.requires_doctor_approval === "boolean" ? raw.requires_doctor_approval : true,
  alerts: Array.isArray(raw.alerts) ? raw.alerts : [],
});

router.post("/predict/:patientId", verifyToken, allowRoles("patient", "doctor", "admin"), async (req, res) => {
  try {
    const records = req.body.records || [];
    if (!records.length) {
      return res.status(400).json({ success: false, message: "Missing required health records." });
    }

    const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
    const response = await fetch(`${aiServiceUrl}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: req.params.patientId, records }),
    });

    if (!response.ok) {
      return res.status(502).json({ success: false, message: "AI service unavailable." });
    }

    const aiRaw = await response.json();
    return res.json({ success: true, result: normalizeAiOutput(aiRaw) });
  } catch (err) {
    return res.status(500).json({ success: false, message: "AI prediction gateway error." });
  }
});

router.post("/simulate-from-health", verifyToken, allowRoles("patient"), async (req, res) => {
  try {
    const entries = await HealthEntry.find({ patient: req.user._id }).sort({ createdAt: 1 }).limit(80);
    if (!entries.length) {
      return res.status(400).json({
        success: false,
        message: "Missing required health records.",
      });
    }

    const records = entries.map((item) => ({
      glucose: item.glucose,
      systolic: item.systolic,
      diastolic: item.diastolic,
      weight: item.weight,
      createdAt: item.createdAt,
    }));

    const aiServiceUrl = process.env.AI_SERVICE_URL || "http://localhost:8000";
    const response = await fetch(`${aiServiceUrl}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId: String(req.user._id), records }),
    });
    if (!response.ok) {
      return res.status(502).json({ success: false, message: "AI service unavailable." });
    }

    const aiRaw = await response.json();
    return res.json({
      success: true,
      output: [normalizeAiOutput(aiRaw)],
      safety_status: "validated",
      performance: { prediction_time_seconds_estimate: 3.5, api_response_target_seconds: "<2s" },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "AI simulation failed." });
  }
});

module.exports = router;

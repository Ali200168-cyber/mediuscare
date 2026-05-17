const express = require("express");
const HealthEntry = require("../models/HealthEntry");
const User = require("../models/User");
const { verifyToken, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.post("/", verifyToken, allowRoles("patient"), async (req, res) => {
  try {
    const payload = {
      patient: req.user._id,
      height: req.body.height,
      weight: req.body.weight,
      gender: req.body.gender,
      glucose: req.body.glucose,
      fastingGlucose: req.body.fastingGlucose,
      randomGlucose: req.body.randomGlucose,
      postMealGlucose: req.body.postMealGlucose,
      systolic: req.body.systolic,
      diastolic: req.body.diastolic,
      symptoms: req.body.symptoms || [],
      mealRecords: req.body.mealRecords || [],
      medicationHistory: req.body.medicationHistory || [],
      mealHoursAgo: req.body.mealHoursAgo,
      age: req.body.age,
      notes: req.body.notes || "",
    };

    if (payload.glucose == null && (payload.systolic == null || payload.diastolic == null)) {
      return res.status(400).json({
        success: false,
        message: "Missing required vitals. Provide glucose or blood pressure values.",
      });
    }

    const created = await HealthEntry.create(payload);
    return res.status(201).json({ success: true, item: created });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to save health data." });
  }
});

router.get("/me", verifyToken, allowRoles("patient"), async (req, res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 30));
  const items = await HealthEntry.find({ patient: req.user._id }).sort({ createdAt: -1 }).limit(limit);
  return res.json({ success: true, items });
});

router.get("/:patientId", verifyToken, allowRoles("doctor", "caregiver", "admin"), async (req, res) => {
  if (req.user.role === "doctor") {
    const allowed = await User.exists({
      _id: req.params.patientId,
      role: "patient",
      assignedDoctor: req.user._id,
    });
    if (!allowed) return res.status(403).json({ success: false, message: "Access denied." });
  }
  if (req.user.role === "caregiver") {
    const allowed = await User.exists({
      _id: req.params.patientId,
      role: "patient",
      linkedCaregiverIds: req.user._id,
    });
    if (!allowed) return res.status(403).json({ success: false, message: "Access denied." });
  }
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 30));
  const items = await HealthEntry.find({ patient: req.params.patientId }).sort({ createdAt: -1 }).limit(limit);
  return res.json({ success: true, items });
});

module.exports = router;

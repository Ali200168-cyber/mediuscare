const express = require("express");
const router = express.Router();
const auth = require("../middleware/roleAuth");
const User = require("../models/User");
const HealthEntry = require("../models/HealthEntry");
const Appointment = require("../models/Appointment");
const Alert = require("../models/Alert");
const DoctorNote = require("../models/DoctorNote");

const deriveStatus = ({ glucose, systolic, diastolic } = {}) => {
  const g = Number(glucose);
  const s = Number(systolic);
  const d = Number(diastolic);

  const glucoseCritical = Number.isFinite(g) && (g >= 250 || g <= 55);
  const glucoseWarn = Number.isFinite(g) && (g >= 180 || g <= 70);

  const bpCritical = Number.isFinite(s) && Number.isFinite(d) && (s >= 180 || d >= 120);
  const bpWarn = Number.isFinite(s) && Number.isFinite(d) && (s >= 140 || d >= 90);

  if (glucoseCritical || bpCritical) return "Critical";
  if (glucoseWarn || bpWarn) return "Warning";
  return "Normal";
};

// Get all patients assigned to the doctor
router.get("/patients", auth(["doctor"]), async (req, res) => {
  try {
    const doctorId = req.user._id;

    // STRICT: show only patients assigned via admin mapping
    const patients = await User.find({ role: "patient", assignedDoctor: doctorId }).select("name email");

    res.json({ success: true, patients });
  } catch (err) {
    console.error("Error fetching assigned patients:", err);
    res.status(500).json({ success: false, message: "Failed to fetch patients" });
  }
});

// Get health entries for a patient (doctor)
router.get("/patient/:patientId/entries", auth(["doctor"]), async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { patientId } = req.params;
    const { startDate, endDate } = req.query;

    // STRICT: doctor can access only assigned patients
    const assigned = await User.exists({ _id: patientId, role: "patient", assignedDoctor: doctorId });
    if (!assigned) return res.status(403).json({ success: false, message: "Access denied" });

    let query = { patient: patientId };
    if (startDate || endDate) query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);

    const entries = await HealthEntry.find(query).sort({ createdAt: -1 });

    res.json({ success: true, entries });
  } catch (err) {
    console.error("Error fetching health entries:", err);
    res.status(500).json({ success: false, message: "Failed to fetch health entries" });
  }
});

// Dashboard overview: assigned patients + latest vitals + active alerts summary
router.get("/overview", auth(["doctor"]), async (req, res) => {
  try {
    const doctorId = req.user._id;
    const patients = await User.find({ role: "patient", assignedDoctor: doctorId }).select("name email");
    const patientIds = patients.map((p) => p._id);

    const latestEntries = await HealthEntry.aggregate([
      { $match: { patient: { $in: patientIds } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$patient",
          entry: { $first: "$$ROOT" },
        },
      },
    ]);
    const latestByPatient = new Map(latestEntries.map((x) => [String(x._id), x.entry]));

    const alerts = await Alert.aggregate([
      { $match: { patientId: { $in: patientIds }, status: { $in: ["open", "active"] } } },
      {
        $group: {
          _id: "$patientId",
          activeCount: { $sum: 1 },
          criticalCount: {
            $sum: {
              $cond: [{ $in: ["$severity", ["High"]] }, 1, 0],
            },
          },
          latestAt: { $max: "$createdAt" },
        },
      },
    ]);
    const alertsByPatient = new Map(alerts.map((a) => [String(a._id), a]));

    const items = patients.map((p) => {
      const entry = latestByPatient.get(String(p._id)) || null;
      const a = alertsByPatient.get(String(p._id)) || { activeCount: 0, criticalCount: 0, latestAt: null };
      const status = deriveStatus({
        glucose: entry?.glucose,
        systolic: entry?.systolic,
        diastolic: entry?.diastolic,
      });
      const lastUpdated = entry?.createdAt || a.latestAt || null;
      const statusWithAlerts = a.criticalCount > 0 ? "Critical" : status;
      return {
        patient: { _id: p._id, name: p.name, email: p.email },
        latestVitals: entry
          ? {
              glucose: entry.glucose ?? null,
              systolic: entry.systolic ?? null,
              diastolic: entry.diastolic ?? null,
              weight: entry.weight ?? null,
              createdAt: entry.createdAt,
            }
          : null,
        alerts: {
          activeCount: a.activeCount || 0,
          criticalCount: a.criticalCount || 0,
          latestAt: a.latestAt || null,
        },
        status: statusWithAlerts,
        lastUpdated,
      };
    });

    return res.json({ success: true, items });
  } catch (err) {
    console.error("Error building doctor monitoring overview:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch monitoring overview" });
  }
});

// Active alerts for a specific assigned patient
router.get("/patient/:patientId/alerts", auth(["doctor"]), async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { patientId } = req.params;
    const assigned = await User.exists({ _id: patientId, role: "patient", assignedDoctor: doctorId });
    if (!assigned) return res.status(403).json({ success: false, message: "Access denied" });
    const items = await Alert.find({ patientId, status: { $in: ["open", "active"] } }).sort({ createdAt: -1 }).limit(200);
    return res.json({ success: true, items });
  } catch (err) {
    console.error("Error fetching patient alerts:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch alerts" });
  }
});

// Doctor notes for assigned patient
router.get("/patient/:patientId/notes", auth(["doctor"]), async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { patientId } = req.params;
    const assigned = await User.exists({ _id: patientId, role: "patient", assignedDoctor: doctorId });
    if (!assigned) return res.status(403).json({ success: false, message: "Access denied" });
    const items = await DoctorNote.find({ doctorId, patientId }).sort({ createdAt: -1 }).limit(50);
    return res.json({ success: true, items });
  } catch (err) {
    console.error("Error fetching doctor notes:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch notes" });
  }
});

router.post("/patient/:patientId/notes", auth(["doctor"]), async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { patientId } = req.params;
    const assigned = await User.exists({ _id: patientId, role: "patient", assignedDoctor: doctorId });
    if (!assigned) return res.status(403).json({ success: false, message: "Access denied" });
    const content = String(req.body?.content || "").trim();
    if (!content) return res.status(400).json({ success: false, message: "Note content is required" });
    const created = await DoctorNote.create({ doctorId, patientId, content });
    return res.status(201).json({ success: true, item: created });
  } catch (err) {
    console.error("Error creating doctor note:", err);
    return res.status(500).json({ success: false, message: "Failed to create note" });
  }
});

// Suggest consultation (creates an in-app alert for the patient)
router.post("/patient/:patientId/suggest-consultation", auth(["doctor"]), async (req, res) => {
  try {
    const doctorId = req.user._id;
    const { patientId } = req.params;
    const assigned = await User.exists({ _id: patientId, role: "patient", assignedDoctor: doctorId });
    if (!assigned) return res.status(403).json({ success: false, message: "Access denied" });
    const doctorName = req.user.name || req.user.email || "Your doctor";
    const created = await Alert.create({
      patientId,
      type: "consultation_suggested",
      severity: "Medium",
      message: `${doctorName} suggested scheduling a consultation based on your latest monitoring readings.`,
      channel: ["in_app"],
      status: "open",
      metadata: { doctorId: String(doctorId) },
    });
    return res.status(201).json({ success: true, item: created });
  } catch (err) {
    console.error("Error suggesting consultation:", err);
    return res.status(500).json({ success: false, message: "Failed to suggest consultation" });
  }
});

module.exports = router;

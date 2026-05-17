const express = require("express");
const Alert = require("../models/Alert");
const { verifyToken, allowRoles } = require("../middleware/auth");
const User = require("../models/User");

const router = express.Router();

router.get("/me", verifyToken, allowRoles("patient", "doctor", "caregiver", "admin"), async (req, res) => {
  let query = {};
  if (req.user.role === "patient") query = { patientId: req.user._id };
  if (req.user.role === "doctor") {
    const rows = await User.find({ role: "patient", assignedDoctor: req.user._id }).select("_id");
    query = { patientId: { $in: rows.map((r) => r._id) } };
  }
  if (req.user.role === "caregiver") {
    const rows = await User.find({ role: "patient", linkedCaregiverIds: req.user._id }).select("_id");
    query = { patientId: { $in: rows.map((r) => r._id) } };
  }
  const items = await Alert.find(query).sort({ createdAt: -1 }).limit(100);
  return res.json({ success: true, items });
});

router.get("/", verifyToken, allowRoles("patient", "doctor", "caregiver", "admin"), async (req, res) => {
  let query = {};
  if (req.user.role === "patient") query = { patientId: req.user._id };
  if (req.user.role === "doctor") {
    const rows = await User.find({ role: "patient", assignedDoctor: req.user._id }).select("_id");
    query = { patientId: { $in: rows.map((r) => r._id) } };
  }
  if (req.user.role === "caregiver") {
    const rows = await User.find({ role: "patient", linkedCaregiverIds: req.user._id }).select("_id");
    query = { patientId: { $in: rows.map((r) => r._id) } };
  }
  const status = String(req.query.status || "").toLowerCase();
  if (status === "active") query.status = { $in: ["open", "active"] };
  if (status === "acknowledged") query.status = "acknowledged";
  const items = await Alert.find(query).sort({ createdAt: -1 }).limit(200);
  return res.json({ success: true, items });
});

router.patch("/:alertId/ack", verifyToken, allowRoles("patient", "doctor", "caregiver", "admin"), async (req, res) => {
  let query = { _id: req.params.alertId };
  if (req.user.role === "patient") {
    query.patientId = req.user._id;
  }
  if (req.user.role === "doctor") {
    const alert = await Alert.findById(req.params.alertId).select("patientId");
    if (!alert) return res.status(404).json({ success: false, message: "Alert not found" });
    const assigned = await User.exists({ _id: alert.patientId, role: "patient", assignedDoctor: req.user._id });
    if (!assigned) return res.status(403).json({ success: false, message: "Access denied" });
    query.patientId = alert.patientId;
  }
  if (req.user.role === "caregiver") {
    const alert = await Alert.findById(req.params.alertId).select("patientId");
    if (!alert) return res.status(404).json({ success: false, message: "Alert not found" });
    const linked = await User.exists({ _id: alert.patientId, role: "patient", linkedCaregiverIds: req.user._id });
    if (!linked) return res.status(403).json({ success: false, message: "Access denied" });
    query.patientId = alert.patientId;
  }
  const updated = await Alert.findOneAndUpdate(
    query,
    { status: "acknowledged", acknowledgedBy: req.user._id, acknowledgedAt: new Date() },
    { new: true },
  );
  if (!updated) return res.status(404).json({ success: false, message: "Alert not found" });
  return res.json({ success: true, item: updated });
});

module.exports = router;

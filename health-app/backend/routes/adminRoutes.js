const express = require("express");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const Consultation = require("../models/Consultation");
const { verifyToken, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.use(verifyToken, allowRoles("admin"));

router.get("/users", async (req, res) => {
  const users = await User.find().select("-password").sort({ createdAt: -1 }).limit(500);
  return res.json({ success: true, items: users });
});

router.get("/doctor-verifications/pending", async (req, res) => {
  const items = await User.find({
    role: "doctor",
    doctorVerificationStatus: "pending",
  })
    .select("name email specialization doctorProofFilePath doctorProofOriginalName createdAt doctorVerificationStatus")
    .sort({ createdAt: -1 })
    .limit(200);
  return res.json({ success: true, items });
});

router.patch("/doctor-verifications/:id", async (req, res) => {
  const decision = String(req.body?.decision || "").toLowerCase();
  const note = String(req.body?.note || "").trim();
  if (!["approve", "reject"].includes(decision)) {
    return res.status(400).json({ success: false, message: "decision must be approve or reject" });
  }

  const target = await User.findById(req.params.id).select("_id role doctorVerificationStatus");
  if (!target || target.role !== "doctor") {
    return res.status(404).json({ success: false, message: "Doctor account not found" });
  }
  if (target.doctorVerificationStatus !== "pending") {
    return res.status(400).json({ success: false, message: "Doctor account is not pending verification." });
  }

  const update = {
    doctorVerificationStatus: decision === "approve" ? "approved" : "rejected",
    isActive: decision === "approve",
    doctorVerificationReviewedAt: new Date(),
    doctorVerificationReviewedBy: req.user._id,
    doctorVerificationNote: note,
  };

  const item = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select("-password");
  if (!item) return res.status(404).json({ success: false, message: "Doctor account not found" });

  await AuditLog.create({
    actorId: req.user._id,
    action: decision === "approve" ? "APPROVE_DOCTOR_VERIFICATION" : "REJECT_DOCTOR_VERIFICATION",
    resourceType: "user",
    resourceId: String(item._id),
    metadata: { decision, note },
    ip: req.ip,
    userAgent: req.headers["user-agent"] || "",
  });

  return res.json({ success: true, item });
});

router.patch("/users/:id/status", async (req, res) => {
  const isActive = Boolean(req.body.isActive);
  const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true }).select("-password");
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  await AuditLog.create({
    actorId: req.user._id,
    action: "UPDATE_USER_STATUS",
    resourceType: "user",
    resourceId: String(user._id),
    metadata: { isActive },
    ip: req.ip,
    userAgent: req.headers["user-agent"] || "",
  });

  return res.json({ success: true, item: user });
});

router.patch("/users/:id/role", async (req, res) => {
  const nextRole = String(req.body.role || "").toLowerCase();
  const allowedRoles = ["doctor", "patient", "caregiver", "admin"];
  if (!allowedRoles.includes(nextRole)) {
    return res.status(400).json({ success: false, message: "Invalid role value" });
  }

  const target = await User.findById(req.params.id).select("_id role");
  if (!target) return res.status(404).json({ success: false, message: "User not found" });
  if (String(target._id) === String(req.user._id)) {
    return res.status(400).json({ success: false, message: "Admin cannot update own role." });
  }

  const user = await User.findByIdAndUpdate(req.params.id, { role: nextRole }, { new: true }).select("-password");
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  await AuditLog.create({
    actorId: req.user._id,
    action: "UPDATE_USER_ROLE",
    resourceType: "user",
    resourceId: String(user._id),
    metadata: { fromRole: target.role, toRole: nextRole },
    ip: req.ip,
    userAgent: req.headers["user-agent"] || "",
  });

  return res.json({ success: true, item: user });
});

router.delete("/users/:id", async (req, res) => {
  const user = await User.findById(req.params.id).select("_id role email");
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  if (String(user._id) === String(req.user._id)) {
    return res.status(400).json({ success: false, message: "Admin cannot delete own account." });
  }
  if (user.role === "admin") {
    return res.status(400).json({ success: false, message: "Admin accounts cannot be deleted." });
  }

  await User.deleteOne({ _id: user._id });

  await AuditLog.create({
    actorId: req.user._id,
    action: "DELETE_USER",
    resourceType: "user",
    resourceId: String(user._id),
    metadata: { role: user.role, email: user.email || "" },
    ip: req.ip,
    userAgent: req.headers["user-agent"] || "",
  });

  return res.json({ success: true, deletedId: String(user._id) });
});

router.get("/system-logs", async (req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(500);
  return res.json({ success: true, items: logs });
});

router.get("/ai-performance", async (req, res) => {
  return res.json({
    success: true,
    metrics: {
      averagePredictionSeconds: 3.8,
      p95PredictionSeconds: 7.1,
      errorRatePercent: 1.2,
      updatedAt: new Date().toISOString(),
    },
  });
});

router.get("/assignment/bootstrap", async (req, res) => {
  const doctors = await User.find({ role: "doctor", isActive: true }).select("name email specialization");
  const patients = await User.find({ role: "patient" }).select("name email assignedDoctor isActive");
  return res.json({ success: true, doctors, patients });
});

router.post("/assignment/assign-doctor", async (req, res) => {
  const { patientId, doctorId } = req.body || {};
  if (!patientId || !doctorId) {
    return res.status(400).json({ success: false, message: "patientId and doctorId are required" });
  }

  const doctor = await User.findById(doctorId).select("_id role isActive name email");
  if (!doctor || doctor.role !== "doctor" || !doctor.isActive) {
    return res.status(400).json({ success: false, message: "Invalid doctor selected" });
  }

  const patient = await User.findByIdAndUpdate(
    patientId,
    { assignedDoctor: doctor._id },
    { new: true },
  ).select("-password");

  if (!patient) return res.status(404).json({ success: false, message: "Patient not found" });

  await AuditLog.create({
    actorId: req.user._id,
    action: "ASSIGN_DOCTOR",
    resourceType: "user",
    resourceId: String(patient._id),
    metadata: { doctorId: String(doctor._id) },
    ip: req.ip,
    userAgent: req.headers["user-agent"] || "",
  });

  return res.json({ success: true, patient, doctor });
});

router.get("/consultations", async (req, res) => {
  const items = await Consultation.find()
    .populate("patientId", "name email")
    .populate("doctorId", "name email specialization")
    .sort({ createdAt: -1 })
    .limit(500);
  return res.json({ success: true, items });
});

module.exports = router;

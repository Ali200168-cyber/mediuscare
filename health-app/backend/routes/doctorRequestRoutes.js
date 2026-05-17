const express = require("express");
const DoctorRequest = require("../models/DoctorRequest");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { verifyToken, allowRoles } = require("../middleware/auth");

const router = express.Router();

// Patient creates request
router.post("/doctor-requests", verifyToken, allowRoles("patient"), async (req, res) => {
  const { doctorId, message } = req.body || {};
  if (!doctorId) return res.status(400).json({ success: false, message: "doctorId is required" });

  const patient = await User.findById(req.user._id).select("_id assignedDoctor");
  if (patient?.assignedDoctor) {
    return res.status(400).json({
      success: false,
      message: "You already have an assigned doctor. Chat with them or request reassignment from support.",
    });
  }

  const doctor = await User.findById(doctorId).select("_id role isActive");
  if (!doctor || doctor.role !== "doctor" || !doctor.isActive) {
    return res.status(400).json({ success: false, message: "Invalid doctor selected" });
  }

  // prevent duplicate pending requests
  const existing = await DoctorRequest.findOne({ patientId: req.user._id, doctorId, status: "pending" });
  if (existing) return res.json({ success: true, item: existing, message: "Request already pending." });

  const created = await DoctorRequest.create({
    patientId: req.user._id,
    doctorId,
    message: String(message || "").slice(0, 500),
  });

  await AuditLog.create({
    actorId: req.user._id,
    action: "REQUEST_DOCTOR",
    resourceType: "doctor_request",
    resourceId: String(created._id),
    metadata: { doctorId: String(doctorId) },
    ip: req.ip,
    userAgent: req.headers["user-agent"] || "",
  });

  return res.status(201).json({ success: true, item: created });
});

// Patient views own requests
router.get("/doctor-requests/me", verifyToken, allowRoles("patient"), async (req, res) => {
  const items = await DoctorRequest.find({ patientId: req.user._id })
    .populate("doctorId", "name email specialization")
    .sort({ createdAt: -1 })
    .limit(50);
  return res.json({ success: true, items });
});

// Doctor inbox
router.get("/doctor-requests/inbox", verifyToken, allowRoles("doctor"), async (req, res) => {
  const items = await DoctorRequest.find({ doctorId: req.user._id, status: "pending" })
    .populate("patientId", "name email phone")
    .sort({ createdAt: -1 })
    .limit(100);
  return res.json({ success: true, items });
});

// Doctor accept/decline
router.patch("/doctor-requests/:id/decision", verifyToken, allowRoles("doctor"), async (req, res) => {
  const { decision, notes } = req.body || {};
  const normalized = String(decision || "").toLowerCase();
  if (!["accepted", "declined"].includes(normalized)) {
    return res.status(400).json({ success: false, message: "decision must be accepted or declined" });
  }

  const request = await DoctorRequest.findById(req.params.id);
  if (!request) return res.status(404).json({ success: false, message: "Request not found" });
  if (String(request.doctorId) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }
  if (request.status !== "pending") {
    return res.status(400).json({ success: false, message: "Request already decided" });
  }

  request.status = normalized;
  request.decisionNotes = String(notes || "").slice(0, 500);
  request.decidedAt = new Date();
  await request.save();

  if (normalized === "accepted") {
    await User.updateOne({ _id: request.patientId }, { $set: { assignedDoctor: req.user._id } });
    await DoctorRequest.updateMany(
      {
        _id: { $ne: request._id },
        patientId: request.patientId,
        status: "pending",
      },
      {
        $set: {
          status: "declined",
          decisionNotes: "Automatically declined because another doctor accepted this patient.",
          decidedAt: new Date(),
        },
      },
    );
  }

  await AuditLog.create({
    actorId: req.user._id,
    action: normalized === "accepted" ? "ACCEPT_DOCTOR_REQUEST" : "DECLINE_DOCTOR_REQUEST",
    resourceType: "doctor_request",
    resourceId: String(request._id),
    metadata: { patientId: String(request.patientId) },
    ip: req.ip,
    userAgent: req.headers["user-agent"] || "",
  });

  return res.json({ success: true, item: request });
});

module.exports = router;

const express = require("express");
const { verifyToken, allowRoles } = require("../middleware/auth");
const User = require("../models/User");
const Consultation = require("../models/Consultation");
const DoctorFeedback = require("../models/DoctorFeedback");
const ChatMessage = require("../models/ChatMessage");
const CaregiverDoctorMessage = require("../models/CaregiverDoctorMessage");
const Alert = require("../models/Alert");

const router = express.Router();

const ensureAssignedPatient = async (doctorId, patientId) => {
  if (!patientId) return null;
  return User.findOne({ _id: patientId, role: "patient", assignedDoctor: doctorId }).select("name email cnic");
};

router.get("/patients", verifyToken, allowRoles("doctor"), async (req, res) => {
  const patients = await User.find({ role: "patient", assignedDoctor: req.user._id })
    .select("name email cnic")
    .sort({ name: 1 });
  return res.json({ success: true, patients });
});

router.get("/patients/:patientId/consultations", verifyToken, allowRoles("doctor"), async (req, res) => {
  const patient = await ensureAssignedPatient(req.user._id, req.params.patientId);
  if (!patient) {
    return res.status(403).json({ success: false, message: "You can only access consultations for assigned patients." });
  }
  const consultations = await Consultation.find({
    doctorId: req.user._id,
    patientId: req.params.patientId,
  })
    .select("_id date time status notes createdAt")
    .sort({ date: -1, time: -1 })
    .limit(100);
  return res.json({ success: true, consultations });
});

router.post("/feedback", verifyToken, allowRoles("doctor"), async (req, res) => {
  try {
    const {
      patientId,
      consultationId,
      notes,
      diagnosis,
      recommendations,
      followUp,
      status,
    } = req.body || {};

    if (!patientId) {
      return res.status(400).json({ success: false, message: "Patient selection is required." });
    }
    const notesValue = String(notes || "").trim();
    if (!notesValue) {
      return res.status(400).json({ success: false, message: "Clinical notes are required." });
    }

    const patient = await ensureAssignedPatient(req.user._id, patientId);
    if (!patient) {
      return res.status(403).json({ success: false, message: "You can only add feedback for assigned patients." });
    }

    let consultationRef = null;
    if (consultationId) {
      const consultation = await Consultation.findOne({
        _id: consultationId,
        doctorId: req.user._id,
        patientId,
      }).select("_id");
      if (!consultation) {
        return res.status(400).json({ success: false, message: "Invalid consultation selected for this patient." });
      }
      consultationRef = consultation._id;
    }

    const item = await DoctorFeedback.create({
      doctorId: req.user._id,
      patientId,
      consultationId: consultationRef,
      notes: notesValue,
      diagnosis: String(diagnosis || "").trim(),
      recommendations: {
        lifestyle: String(recommendations?.lifestyle || "").trim(),
        monitoring: String(recommendations?.monitoring || "").trim(),
        medicalAdvisory: String(recommendations?.medicalAdvisory || "").trim(),
      },
      followUp: {
        timeframe: String(followUp?.timeframe || "").trim(),
        nextVisitDate: followUp?.nextVisitDate ? new Date(followUp.nextVisitDate) : null,
      },
      status: status === "draft" ? "draft" : "submitted",
    });

    const populated = await DoctorFeedback.findById(item._id)
      .populate("patientId", "name email cnic")
      .populate("consultationId", "date time status");

    // Push submitted feedback to patient chat and linked caregivers.
    if (item.status === "submitted") {
      const sections = [
        "Doctor Feedback",
        `Notes: ${notesValue}`,
        diagnosis ? `Assessment: ${String(diagnosis).trim()}` : "",
        recommendations?.lifestyle ? `Lifestyle: ${String(recommendations.lifestyle).trim()}` : "",
        recommendations?.monitoring ? `Monitoring: ${String(recommendations.monitoring).trim()}` : "",
        recommendations?.medicalAdvisory ? `Medical advisory: ${String(recommendations.medicalAdvisory).trim()}` : "",
        followUp?.timeframe ? `Follow-up: ${String(followUp.timeframe).trim()}` : "",
      ].filter(Boolean);

      const chatText = sections.join("\n\n").slice(0, 2000);
      try {
        await ChatMessage.create({
          patientId,
          doctorId: req.user._id,
          senderId: req.user._id,
          receiverId: patientId,
          text: chatText,
        });
      } catch (chatError) {
        console.error("Doctor feedback chat notify error:", chatError);
      }

      const patientWithCaregivers = await User.findById(patientId).select("name linkedCaregiverIds");
      const caregiverIds = patientWithCaregivers?.linkedCaregiverIds || [];
      for (const caregiverId of caregiverIds) {
        try {
          await CaregiverDoctorMessage.create({
            caregiverId,
            doctorId: req.user._id,
            patientId,
            senderId: req.user._id,
            content: chatText,
          });
          await Alert.create({
            patientId,
            type: "doctor_feedback",
            severity: "Medium",
            message: `New doctor feedback for ${patientWithCaregivers.name}: ${notesValue.slice(0, 120)}`,
            channel: ["in_app"],
            status: "open",
            metadata: {
              feedbackId: String(item._id),
              caregiverId: String(caregiverId),
              audience: "caregiver",
            },
          });
        } catch (caregiverNotifyError) {
          console.error("Caregiver feedback notify error:", caregiverNotifyError);
        }
      }
    }

    return res.status(201).json({ success: true, item: populated });
  } catch (error) {
    console.error("Create doctor feedback error:", error);
    return res.status(500).json({ success: false, message: "Failed to save doctor feedback." });
  }
});

router.get("/feedback", verifyToken, allowRoles("doctor"), async (req, res) => {
  try {
    const { patientId, consultationId, fromDate, toDate, status, q } = req.query || {};
    const query = { doctorId: req.user._id };

    if (patientId) {
      const patient = await ensureAssignedPatient(req.user._id, patientId);
      if (!patient) {
        return res.status(403).json({ success: false, message: "You can only view feedback for assigned patients." });
      }
      query.patientId = patientId;
    }
    if (consultationId) query.consultationId = consultationId;
    if (status && ["draft", "submitted"].includes(String(status))) query.status = status;
    if (fromDate || toDate) {
      query.createdAt = {};
      if (fromDate) query.createdAt.$gte = new Date(fromDate);
      if (toDate) query.createdAt.$lte = new Date(toDate);
    }
    if (q) {
      const regex = new RegExp(String(q).trim(), "i");
      query.$or = [{ notes: regex }, { diagnosis: regex }];
    }

    const items = await DoctorFeedback.find(query)
      .populate("patientId", "name email cnic")
      .populate("consultationId", "date time status")
      .sort({ createdAt: -1 })
      .limit(500);

    return res.json({ success: true, items });
  } catch (error) {
    console.error("List doctor feedback error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch feedback entries." });
  }
});

router.get("/my-feedback", verifyToken, allowRoles("patient"), async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const items = await DoctorFeedback.find({
      patientId: req.user._id,
      status: "submitted",
    })
      .populate("doctorId", "name email specialization")
      .populate("consultationId", "date time status")
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.json({ success: true, items });
  } catch (error) {
    console.error("List patient feedback error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch your doctor feedback." });
  }
});

module.exports = router;


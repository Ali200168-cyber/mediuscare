const express = require("express");
const mongoose = require("mongoose");
const { verifyToken, allowRoles } = require("../middleware/auth");
const User = require("../models/User");
const CaregiverRequest = require("../models/CaregiverRequest");
const HealthEntry = require("../models/HealthEntry");
const Alert = require("../models/Alert");
const DoctorFeedback = require("../models/DoctorFeedback");
const AiSimulationResult = require("../models/AiSimulationResult");
const CaregiverDoctorMessage = require("../models/CaregiverDoctorMessage");
const Consultation = require("../models/Consultation");

const router = express.Router();

const getPatientHealthStatus = (entry) => {
  if (!entry) return "Unknown";
  const glucose = Number(entry.glucose);
  const systolic = Number(entry.systolic);
  const diastolic = Number(entry.diastolic);
  if ((glucose && glucose >= 200) || (systolic && systolic >= 140) || (diastolic && diastolic >= 90)) return "Critical";
  if ((glucose && glucose >= 141) || (systolic && systolic >= 130) || (diastolic && diastolic >= 80)) return "Warning";
  return "Normal";
};

const caregiverHasAccess = async (caregiverId, patientId) => {
  const patient = await User.findOne({
    _id: patientId,
    role: "patient",
    linkedCaregiverIds: caregiverId,
  }).select("_id");
  return Boolean(patient);
};

const getDayBounds = (inputDate) => {
  const dateObj = new Date(inputDate);
  const start = new Date(dateObj);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dateObj);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const formatRecommendations = (rec) => {
  if (!rec) return "";
  if (typeof rec === "string") return rec;
  const parts = [];
  if (rec.lifestyle) parts.push(`Lifestyle: ${rec.lifestyle}`);
  if (rec.monitoring) parts.push(`Monitoring: ${rec.monitoring}`);
  if (rec.medicalAdvisory) parts.push(`Medical advisory: ${rec.medicalAdvisory}`);
  return parts.join(" · ");
};

const isSlotTaken = async ({ doctorId, date, time }) => {
  const { start, end } = getDayBounds(date);
  return Boolean(
    await Consultation.exists({
      doctorId,
      date: { $gte: start, $lte: end },
      time: String(time),
      status: { $in: ["Pending", "Accepted"] },
    }),
  );
};

const latestAiRisk = async (patientId) => {
  const latestAi = await AiSimulationResult.findOne({ patient: patientId }).sort({ createdAt: -1 });
  if (!latestAi?.output?.length) return null;
  const mod = latestAi.output.find((o) => o?.risk_level || o?.explanation) || latestAi.output[0];
  return {
    riskLevel: mod?.risk_level || "Unknown",
    explanation:
      typeof mod?.explanation === "string"
        ? mod.explanation
        : mod?.explanation?.patient || mod?.explanation?.doctor || "",
    reviewStatus: latestAi.reviewStatus,
    createdAt: latestAi.createdAt,
  };
};

/* ── Patient access requests (link patients) ── */

router.get("/caregiver/patient-options", verifyToken, allowRoles("caregiver"), async (req, res) => {
  try {
    const query = String(req.query.q || "").trim();
    const filter = { role: "patient", isActive: true };
    if (query) {
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: regex }, { email: regex }, { cnic: regex }];
    }
    const patients = await User.find(filter).select("_id name email cnic linkedCaregiverIds").sort({ createdAt: -1 }).limit(80);
    const options = await Promise.all(
      patients.map(async (patient) => {
        const linked = (patient.linkedCaregiverIds || []).some((id) => String(id) === String(req.user._id));
        const pending = await CaregiverRequest.exists({
          caregiverId: req.user._id,
          patientId: patient._id,
          status: "Pending",
        });
        return {
          _id: patient._id,
          name: patient.name,
          email: patient.email,
          cnic: patient.cnic,
          alreadyLinked: linked,
          hasPendingRequest: Boolean(pending),
        };
      }),
    );
    return res.json({ success: true, items: options });
  } catch (error) {
    console.error("Caregiver patient options error:", error);
    return res.status(500).json({ success: false, message: "Failed to load patient options." });
  }
});

router.post("/caregiver/request", verifyToken, allowRoles("caregiver"), async (req, res) => {
  try {
    const { patientId, patientQuery, message } = req.body || {};
    let patient = null;
    const normalizedQuery = String(patientQuery || "").trim();
    if (patientId) {
      patient = await User.findOne({ _id: patientId, role: "patient", isActive: true }).select("_id email name linkedCaregiverIds");
    } else if (normalizedQuery) {
      const orQuery = [{ email: normalizedQuery.toLowerCase() }, { cnic: normalizedQuery }];
      if (mongoose.Types.ObjectId.isValid(normalizedQuery)) orQuery.push({ _id: normalizedQuery });
      patient = await User.findOne({ role: "patient", isActive: true, $or: orQuery }).select("_id email name linkedCaregiverIds");
    }
    if (!patient) return res.status(404).json({ success: false, message: "Patient not found." });
    if ((patient.linkedCaregiverIds || []).some((id) => String(id) === String(req.user._id))) {
      return res.status(409).json({ success: false, message: "You are already linked to this patient." });
    }
    const existingPending = await CaregiverRequest.findOne({
      caregiverId: req.user._id,
      patientId: patient._id,
      status: "Pending",
    });
    if (existingPending) {
      return res.status(409).json({ success: false, message: "A pending request already exists for this patient." });
    }
    const item = await CaregiverRequest.create({
      caregiverId: req.user._id,
      patientId: patient._id,
      message: String(message || "").trim(),
      status: "Pending",
    });
    await Alert.create({
      patientId: patient._id,
      type: "caregiver_access_request",
      severity: "Medium",
      message: `${req.user.name || "A caregiver"} requested access to your health data.`,
      channel: ["in_app"],
      status: "open",
      metadata: { caregiverId: String(req.user._id), requestId: String(item._id) },
    });
    const populated = await CaregiverRequest.findById(item._id)
      .populate("caregiverId", "name email")
      .populate("patientId", "name email");
    return res.status(201).json({ success: true, item: populated });
  } catch (error) {
    console.error("Create caregiver request error:", error);
    return res.status(500).json({ success: false, message: "Failed to create caregiver request." });
  }
});

router.get("/caregiver/requests", verifyToken, allowRoles("caregiver"), async (req, res) => {
  const items = await CaregiverRequest.find({ caregiverId: req.user._id })
    .populate("patientId", "name email")
    .sort({ createdAt: -1 });
  return res.json({ success: true, items });
});

router.get("/patient/caregiver-requests", verifyToken, allowRoles("patient"), async (req, res) => {
  const items = await CaregiverRequest.find({ patientId: req.user._id })
    .populate("caregiverId", "name email")
    .sort({ createdAt: -1 });
  return res.json({ success: true, items });
});

router.put("/caregiver/request/status", verifyToken, allowRoles("patient"), async (req, res) => {
  const { requestId, status } = req.body || {};
  if (!requestId || !["Approved", "Rejected"].includes(String(status))) {
    return res.status(400).json({ success: false, message: "requestId and valid status are required." });
  }
  const request = await CaregiverRequest.findOne({ _id: requestId, patientId: req.user._id });
  if (!request) return res.status(404).json({ success: false, message: "Request not found." });
  request.status = status;
  request.decisionAt = new Date();
  await request.save();
  if (status === "Approved") {
    await User.findByIdAndUpdate(req.user._id, { $addToSet: { linkedCaregiverIds: request.caregiverId } });
  }
  if (status === "Rejected") {
    await User.findByIdAndUpdate(req.user._id, { $pull: { linkedCaregiverIds: request.caregiverId } });
  }
  const item = await CaregiverRequest.findById(request._id)
    .populate("caregiverId", "name email")
    .populate("patientId", "name email");
  return res.json({ success: true, item });
});

/* ── Assigned patients ── */

router.get("/caregiver/patients", verifyToken, allowRoles("caregiver"), async (req, res) => {
  try {
    const patients = await User.find({ role: "patient", linkedCaregiverIds: req.user._id })
      .populate("assignedDoctor", "name email specialization")
      .select("name email createdAt assignedDoctor")
      .sort({ createdAt: -1 });

    const enriched = await Promise.all(
      patients.map(async (patient) => {
        const latest = await HealthEntry.findOne({ patient: patient._id }).sort({ createdAt: -1 });
        const openAlerts = await Alert.countDocuments({ patientId: patient._id, status: "open" });
        const aiRisk = await latestAiRisk(patient._id);
        return {
          _id: patient._id,
          name: patient.name,
          email: patient.email,
          assignedDoctor: patient.assignedDoctor,
          latestEntry: latest,
          healthStatus: getPatientHealthStatus(latest),
          aiRisk,
          openAlerts,
        };
      }),
    );

    return res.json({ success: true, patients: enriched });
  } catch (error) {
    console.error("Caregiver patients error:", error);
    return res.status(500).json({ success: false, message: "Failed to load patients." });
  }
});

router.get("/caregiver/patient/:patientId/overview", verifyToken, allowRoles("caregiver"), async (req, res) => {
  try {
    const { patientId } = req.params;
    const hasAccess = await caregiverHasAccess(req.user._id, patientId);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Access denied. Patient approval required." });
    }

    const [patient, entriesAsc, aiRisk, alerts] = await Promise.all([
      User.findById(patientId).populate("assignedDoctor", "name email specialization").select("name email createdAt assignedDoctor"),
      HealthEntry.find({ patient: patientId }).sort({ createdAt: 1 }).limit(500),
      latestAiRisk(patientId),
      Alert.find({ patientId }).sort({ createdAt: -1 }).limit(80),
    ]);

    if (!patient) return res.status(404).json({ success: false, message: "Patient not found." });

    const entries = [...entriesAsc].reverse();
    const latest = entries[0] || null;

    const glucoseVals = entriesAsc.map((e) => Number(e.glucose)).filter((n) => !Number.isNaN(n) && n > 0);
    const systolicVals = entriesAsc.map((e) => Number(e.systolic)).filter((n) => !Number.isNaN(n) && n > 0);
    const weightVals = entriesAsc.map((e) => Number(e.weight)).filter((n) => !Number.isNaN(n) && n > 0);

    const avg = (arr) => (arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : null);

    return res.json({
      success: true,
      patient,
      entries,
      alerts: alerts.map((a) => ({
        _id: a._id,
        severity: a.severity,
        description: a.message,
        type: a.type,
        status: a.status,
        createdAt: a.createdAt,
      })),
      healthSummary: {
        latestVitals: latest,
        healthStatus: getPatientHealthStatus(latest),
        aiRisk,
        stats: {
          totalEntries: entriesAsc.length,
          avgGlucose: avg(glucoseVals),
          avgSystolic: avg(systolicVals),
          avgWeight: avg(weightVals),
          firstEntryAt: entriesAsc[0]?.createdAt || null,
          lastEntryAt: latest?.createdAt || null,
        },
      },
    });
  } catch (error) {
    console.error("Caregiver patient overview error:", error);
    return res.status(500).json({ success: false, message: "Failed to load patient overview." });
  }
});

/* ── Alerts ── */

router.get("/caregiver/alerts", verifyToken, allowRoles("caregiver"), async (req, res) => {
  try {
    const patients = await User.find({ role: "patient", linkedCaregiverIds: req.user._id }).select("_id name");
    const patientIds = patients.map((p) => p._id);
    const patientMap = Object.fromEntries(patients.map((p) => [String(p._id), p.name]));

    const alerts = await Alert.find({ patientId: { $in: patientIds } })
      .sort({ createdAt: -1 })
      .limit(100);

    const items = alerts.map((a) => ({
      _id: a._id,
      patientId: a.patientId,
      patientName: patientMap[String(a.patientId)] || "Patient",
      severity: a.severity,
      description: a.message,
      type: a.type,
      status: a.status,
      createdAt: a.createdAt,
    }));

    return res.json({ success: true, alerts: items });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load alerts." });
  }
});

/* ── Consultation request on behalf of patient ── */

router.post("/caregiver/consultation/request", verifyToken, allowRoles("caregiver"), async (req, res) => {
  try {
    const { patientId, date, time, notes } = req.body || {};
    if (!patientId || !date || !time) {
      return res.status(400).json({ success: false, message: "patientId, date, and time are required." });
    }

    const hasAccess = await caregiverHasAccess(req.user._id, patientId);
    if (!hasAccess) return res.status(403).json({ success: false, message: "Access denied." });

    const patient = await User.findById(patientId).populate("assignedDoctor", "name email");
    if (!patient?.assignedDoctor?._id) {
      return res.status(400).json({ success: false, message: "Patient has no assigned doctor." });
    }

    const doctorId = patient.assignedDoctor._id;
    const slotBusy = await isSlotTaken({ doctorId, date, time });
    if (slotBusy) {
      return res.status(409).json({ success: false, message: "Selected slot is already booked. Pick another time." });
    }

    const caregiverNote = String(notes || "").trim();
    const item = await Consultation.create({
      patientId,
      doctorId,
      date: new Date(date),
      time: String(time),
      notes: caregiverNote
        ? `[Requested by caregiver ${req.user.name || ""}] ${caregiverNote}`
        : `[Requested by caregiver ${req.user.name || ""}]`,
      status: "Pending",
      consultationType: "Caregiver-requested consultation",
    });

    await Alert.create({
      patientId,
      type: "consultation_request",
      severity: "Medium",
      message: `Caregiver requested a consultation for ${patient.name} on ${new Date(date).toLocaleDateString()} at ${time}.`,
      channel: ["in_app"],
      status: "open",
      metadata: { consultationId: String(item._id), caregiverId: String(req.user._id) },
    });

    return res.status(201).json({ success: true, item });
  } catch (error) {
    console.error("Caregiver consultation request error:", error);
    return res.status(500).json({ success: false, message: "Failed to request consultation." });
  }
});

/* ── Doctor messaging ── */

router.get("/caregiver/messages/doctors", verifyToken, allowRoles("caregiver"), async (req, res) => {
  try {
    const patients = await User.find({ role: "patient", linkedCaregiverIds: req.user._id })
      .populate("assignedDoctor", "name email specialization")
      .select("name assignedDoctor");

    const doctors = [];
    const seen = new Set();
    for (const p of patients) {
      if (!p.assignedDoctor?._id) continue;
      const key = String(p.assignedDoctor._id);
      if (seen.has(key)) continue;
      seen.add(key);
      doctors.push({
        doctorId: p.assignedDoctor._id,
        name: p.assignedDoctor.name,
        specialty: p.assignedDoctor.specialization || "General",
        patientName: p.name,
        patientId: p._id,
      });
    }
    return res.json({ success: true, doctors });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load doctors." });
  }
});

router.get("/caregiver/messages/:doctorId", verifyToken, allowRoles("caregiver"), async (req, res) => {
  try {
    const { doctorId } = req.params;
    const allowed = await User.exists({
      role: "patient",
      linkedCaregiverIds: req.user._id,
      assignedDoctor: doctorId,
    });
    if (!allowed) return res.status(403).json({ success: false, message: "No linked patient for this doctor." });

    const messages = await CaregiverDoctorMessage.find({ caregiverId: req.user._id, doctorId })
      .sort({ createdAt: 1 })
      .limit(200);

    return res.json({ success: true, messages });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load messages." });
  }
});

router.post("/caregiver/messages/:doctorId", verifyToken, allowRoles("caregiver"), async (req, res) => {
  try {
    const { doctorId } = req.params;
    const content = String(req.body?.content || "").trim();
    if (!content) return res.status(400).json({ success: false, message: "Message content required." });

    const patient = await User.findOne({
      role: "patient",
      linkedCaregiverIds: req.user._id,
      assignedDoctor: doctorId,
    }).select("_id name");

    if (!patient) return res.status(403).json({ success: false, message: "Access denied." });

    const msg = await CaregiverDoctorMessage.create({
      caregiverId: req.user._id,
      doctorId,
      patientId: patient._id,
      senderId: req.user._id,
      content,
    });

    await Alert.create({
      patientId: patient._id,
      type: "caregiver_message",
      severity: "Medium",
      message: `Caregiver ${req.user.name || ""} sent a message regarding patient ${patient.name}.`,
      channel: ["in_app"],
      status: "open",
      metadata: {
        doctorId: String(doctorId),
        caregiverId: String(req.user._id),
        messageId: String(msg._id),
        audience: "doctor",
      },
    });

    return res.status(201).json({ success: true, message: msg });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to send message." });
  }
});

/* ── Doctor ↔ caregiver messaging ── */

router.get("/doctor/caregiver-contacts", verifyToken, allowRoles("doctor"), async (req, res) => {
  try {
    const patients = await User.find({
      role: "patient",
      assignedDoctor: req.user._id,
      linkedCaregiverIds: { $exists: true, $ne: [] },
    }).select("name linkedCaregiverIds");

    const contacts = [];
    for (const patient of patients) {
      const caregiverIds = patient.linkedCaregiverIds || [];
      if (!caregiverIds.length) continue;
      const caregivers = await User.find({ _id: { $in: caregiverIds }, role: "caregiver", isActive: true }).select(
        "name email",
      );
      for (const caregiver of caregivers) {
        contacts.push({
          contactKey: `cg:${caregiver._id}:${patient._id}`,
          _id: `cg:${caregiver._id}:${patient._id}`,
          caregiverId: caregiver._id,
          patientId: patient._id,
          name: caregiver.name,
          email: caregiver.email,
          contactType: "caregiver",
          patientName: patient.name,
          role: "caregiver",
        });
      }
    }
    return res.json({ success: true, contacts });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load caregiver contacts." });
  }
});

const verifyDoctorCaregiverPatient = async (doctorId, caregiverId, patientId) => {
  const patient = await User.findOne({
    _id: patientId,
    role: "patient",
    assignedDoctor: doctorId,
    linkedCaregiverIds: caregiverId,
  }).select("_id name");
  return patient;
};

router.get("/doctor/caregiver-messages/:caregiverId", verifyToken, allowRoles("doctor"), async (req, res) => {
  try {
    const { caregiverId } = req.params;
    const { patientId } = req.query;
    if (!patientId) return res.status(400).json({ success: false, message: "patientId is required." });

    const patient = await verifyDoctorCaregiverPatient(req.user._id, caregiverId, patientId);
    if (!patient) return res.status(403).json({ success: false, message: "Access denied." });

    const messages = await CaregiverDoctorMessage.find({
      caregiverId,
      doctorId: req.user._id,
      patientId,
    })
      .sort({ createdAt: 1 })
      .limit(200);

    return res.json({ success: true, messages, patient });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to load messages." });
  }
});

router.post("/doctor/caregiver-messages/:caregiverId", verifyToken, allowRoles("doctor"), async (req, res) => {
  try {
    const { caregiverId } = req.params;
    const { patientId, content } = req.body || {};
    const text = String(content || "").trim();
    if (!patientId || !text) {
      return res.status(400).json({ success: false, message: "patientId and content are required." });
    }

    const patient = await verifyDoctorCaregiverPatient(req.user._id, caregiverId, patientId);
    if (!patient) return res.status(403).json({ success: false, message: "Access denied." });

    const msg = await CaregiverDoctorMessage.create({
      caregiverId,
      doctorId: req.user._id,
      patientId,
      senderId: req.user._id,
      content: text,
    });

    return res.status(201).json({ success: true, message: msg });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to send message." });
  }
});

/* ── Doctor feedback & AI recommendations (read-only) ── */

router.get("/caregiver/feedback", verifyToken, allowRoles("caregiver"), async (req, res) => {
  try {
    const patients = await User.find({ role: "patient", linkedCaregiverIds: req.user._id }).select("_id name");
    const patientIds = patients.map((p) => p._id);
    const patientMap = Object.fromEntries(patients.map((p) => [String(p._id), p.name]));

    const [feedback, aiHistory] = await Promise.all([
      DoctorFeedback.find({ patientId: { $in: patientIds }, status: "submitted" })
        .populate("doctorId", "name email specialization")
        .sort({ createdAt: -1 })
        .limit(100),
      AiSimulationResult.find({ patient: { $in: patientIds } })
        .populate("reviewedBy", "name email")
        .sort({ createdAt: -1 })
        .limit(100),
    ]);

    const feedbackItems = feedback.map((f) => ({
      _id: f._id,
      patientId: f.patientId,
      patientName: patientMap[String(f.patientId)] || "Patient",
      doctorName: f.doctorId?.name || "Doctor",
      diagnosis: f.diagnosis,
      notes: f.notes,
      recommendations: formatRecommendations(f.recommendations),
      createdAt: f.createdAt,
    }));

    const aiItems = aiHistory.map((sim) => {
      const mod = (sim.output || []).find((o) => o?.prediction?.suggested_dose_units != null || o?.doctor_review_status) || sim.output?.[0];
      return {
        _id: sim._id,
        patientId: sim.patient,
        patientName: patientMap[String(sim.patient)] || "Patient",
        reviewStatus: sim.reviewStatus || mod?.doctor_review_status || "pending",
        reviewNotes: sim.reviewNotes || mod?.doctor_review_notes || "",
        suggestedDose: mod?.prediction?.suggested_dose_units ?? null,
        riskLevel: mod?.risk_level || null,
        reviewedBy: sim.reviewedBy?.name || null,
        createdAt: sim.createdAt,
        reviewedAt: sim.reviewedAt,
      };
    });

    return res.json({ success: true, feedback: feedbackItems, aiRecommendations: aiItems });
  } catch (error) {
    console.error("Caregiver feedback error:", error);
    return res.status(500).json({ success: false, message: "Failed to load feedback." });
  }
});

module.exports = router;

const router = require("express").Router();
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit");
const { runAiSimulation } = require("../services/aiHealthEngine");
const auth = require("../middleware/roleAuth");
const HealthEntry = require("../models/HealthEntry");
const AiSimulationResult = require("../models/AiSimulationResult");
const Appointment = require("../models/Appointment");
const User = require("../models/User");
const MIN_GLUCOSE_FORECAST_POINTS = Number(process.env.MIN_GLUCOSE_FORECAST_POINTS || 4);

const buildPayloadFromEntries = (patientId, entries) => {
  const sorted = [...entries].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const latest = sorted[sorted.length - 1];

  return {
    patientId: String(patientId),
    vitals: {
      age: latest?.age || 0,
      weight: latest?.weight || 0,
      activityScore: 5,
      currentGlucose: latest?.glucose || 0,
      glucoseTarget: 110,
      systolic: latest?.systolic || 0,
      diastolic: latest?.diastolic || 0,
    },
    history: {
      glucoseReadings: sorted
        .filter((entry) => entry.glucose != null)
        .map((entry) => ({ timestamp: entry.createdAt, value: entry.glucose })),
      meals: sorted
        .filter((entry) => entry.mealHoursAgo != null)
        .slice(-8)
        .map((entry) => ({
          timestamp: entry.createdAt,
          carbs: Math.max(0, (6 - Number(entry.mealHoursAgo || 0)) * 10),
        })),
      insulin: [],
      medications: sorted
        .flatMap((entry) => entry.medicationHistory || [])
        .slice(-20)
        .map((name) => ({ name, adherence: "unknown" })),
      mealRecords: sorted
        .flatMap((entry) => entry.mealRecords || [])
        .slice(-20)
        .map((item, idx) => ({
          timestamp: sorted[Math.max(0, sorted.length - 1 - idx)]?.createdAt || new Date(),
          note: item,
        })),
      bpReadings: sorted
        .filter((entry) => entry.systolic != null && entry.diastolic != null)
        .map((entry) => ({ systolic: entry.systolic, diastolic: entry.diastolic })),
      doctorRules: {
        correctionFactor: 40,
        minDose: 0,
        maxDose: 8,
      },
    },
  };
};

const saveSimulationResult = async ({ result, payload, requestedBy, patientId, source }) => {
  const normalizedOutput = result.output ? (Array.isArray(result.output) ? result.output : [result.output]) : [];
  const requiresDoctorReview = normalizedOutput.some((moduleResult) => moduleResult.requires_doctor_approval);
  const reviewStatus = requiresDoctorReview ? "pending" : "not_required";

  const alertsCount = normalizedOutput.reduce((sum, moduleResult) => {
    return sum + ((moduleResult.alerts || []).length || 0);
  }, 0);

  const simulationDoc = await AiSimulationResult.create({
    patient: patientId,
    requestedBy,
    source,
    inputSummary: {
      patientId: payload?.patientId || null,
      vitals: payload?.vitals || {},
      historyCounts: {
        glucoseReadings: payload?.history?.glucoseReadings?.length || 0,
        bpReadings: payload?.history?.bpReadings?.length || 0,
      },
    },
    safetyStatus: result.safety_status,
    success: result.success,
    reason: result.reason || "",
    performance: result.performance || {},
    output: normalizedOutput,
    alertsCount,
    reviewStatus,
  });

  return simulationDoc;
};

router.post("/simulate", auth(["patient", "doctor"]), async (req, res) => {
  try {
    const payload = req.body || {};
    if (req.user.role === "patient") {
      payload.patientId = String(req.user._id);
    }

    const result = runAiSimulation(payload);
    const targetPatientId = mongoose.Types.ObjectId.isValid(payload.patientId)
      ? payload.patientId
      : req.user._id;
    const saved = await saveSimulationResult({
      result,
      payload,
      requestedBy: req.user._id,
      patientId: targetPatientId,
      source: "manual_payload",
    });

    if (!result.success) {
      return res.status(422).json({ ...result, savedResultId: saved._id });
    }
    return res.json({ ...result, savedResultId: saved._id });
  } catch (error) {
    console.error("AI simulation error:", error);
    return res.status(500).json({
      success: false,
      message: "AI simulation failed",
    });
  }
});

router.post("/simulate-from-health", auth(["patient"]), async (req, res) => {
  try {
    const entries = await HealthEntry.find({ patient: req.user._id }).sort({ createdAt: -1 }).limit(40);
    const glucosePointCount = entries.filter((entry) => entry.glucose != null && Number.isFinite(Number(entry.glucose))).length;
    if (!entries.length || glucosePointCount < MIN_GLUCOSE_FORECAST_POINTS) {
      return res.status(200).json({
        success: false,
        safety_status: "blocked",
        reason: `At least ${MIN_GLUCOSE_FORECAST_POINTS} glucose entries are required for 6-24h forecast.`,
        requirements: {
          minGlucosePoints: MIN_GLUCOSE_FORECAST_POINTS,
          currentGlucosePoints: glucosePointCount,
        },
        output: {
          module: "safety_validation_layer",
          input_summary: { patientId: req.user._id },
          prediction: null,
          confidence_score: 0,
          risk_level: "High",
          explanation: "More glucose history is required before LSTM forecast can run safely.",
          recommendation: "Log additional glucose readings and try again.",
          requires_doctor_approval: true,
          alerts: [],
        },
      });
    }

    const payload = buildPayloadFromEntries(req.user._id, entries);
    const result = runAiSimulation(payload);
    const saved = await saveSimulationResult({
      result,
      payload,
      requestedBy: req.user._id,
      patientId: req.user._id,
      source: "health_entries",
    });

    if (!result.success) {
      return res.status(422).json({ ...result, savedResultId: saved._id });
    }
    return res.json({
      ...result,
      savedResultId: saved._id,
      requirements: {
        minGlucosePoints: MIN_GLUCOSE_FORECAST_POINTS,
        currentGlucosePoints: glucosePointCount,
      },
    });
  } catch (error) {
    console.error("AI simulation from health error:", error);
    return res.status(500).json({
      success: false,
      message: "AI simulation failed",
    });
  }
});

router.get("/history", auth(["patient", "doctor", "caregiver"]), async (req, res) => {
  try {
    const patientId =
      req.user.role === "patient"
        ? req.user._id
        : req.query.patientId || req.user._id;
    if (req.user.role === "doctor") {
      const allowed = await User.exists({ _id: patientId, role: "patient", assignedDoctor: req.user._id });
      if (!allowed) return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (req.user.role === "caregiver") {
      if (!req.query.patientId) {
        return res.status(400).json({ success: false, message: "patientId is required" });
      }
      const allowed = await User.exists({
        _id: patientId,
        role: "patient",
        linkedCaregiverIds: req.user._id,
      });
      if (!allowed) return res.status(403).json({ success: false, message: "Access denied" });
    }

    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));
    const page = Math.max(1, Number(req.query.page) || 1);
    const skip = (page - 1) * limit;
    const query = { patient: patientId };
    if (req.query.module) query["output.module"] = req.query.module;
    if (req.query.riskLevel) query["output.risk_level"] = req.query.riskLevel;
    if (req.query.reviewStatus) query.reviewStatus = req.query.reviewStatus;
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) query.createdAt.$gte = new Date(req.query.startDate);
      if (req.query.endDate) query.createdAt.$lte = new Date(req.query.endDate);
    }

    const [items, total] = await Promise.all([
      AiSimulationResult.find(query)
        .populate("reviewedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AiSimulationResult.countDocuments(query),
    ]);
    return res.json({
      success: true,
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("AI history fetch error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch AI history" });
  }
});

router.get("/history/analytics", auth(["patient", "doctor"]), async (req, res) => {
  try {
    const patientId =
      req.user.role === "patient" ? req.user._id : req.query.patientId || req.user._id;
    if (req.user.role === "doctor") {
      const allowed = await User.exists({ _id: patientId, role: "patient", assignedDoctor: req.user._id });
      if (!allowed) return res.status(403).json({ success: false, message: "Access denied" });
    }

    const rows = await AiSimulationResult.find({ patient: patientId }).sort({ createdAt: -1 }).limit(100);
    const moduleCounts = {};
    const riskCounts = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    let avgConfidence = 0;
    let confidenceSamples = 0;

    rows.forEach((row) => {
      (row.output || []).forEach((moduleOutput) => {
        moduleCounts[moduleOutput.module] = (moduleCounts[moduleOutput.module] || 0) + 1;
        const level = moduleOutput.risk_level;
        if (level && riskCounts[level] != null) riskCounts[level] += 1;
        if (typeof moduleOutput.confidence_score === "number") {
          avgConfidence += moduleOutput.confidence_score;
          confidenceSamples += 1;
        }
      });
    });

    return res.json({
      success: true,
      analytics: {
        totalSimulations: rows.length,
        moduleCounts,
        riskCounts,
        averageConfidence: confidenceSamples ? Number((avgConfidence / confidenceSamples).toFixed(2)) : 0,
      },
    });
  } catch (error) {
    console.error("AI analytics fetch error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch AI analytics" });
  }
});

router.get("/doctor/assigned-analytics", auth(["doctor"]), async (req, res) => {
  try {
    const patientIds = await Appointment.find({ doctor: req.user._id }).distinct("patient");
    if (!patientIds.length) {
      return res.json({
        success: true,
        analytics: {
          totalPatients: 0,
          totalSimulations: 0,
          pendingReviews: 0,
          riskCounts: { Low: 0, Medium: 0, High: 0, Critical: 0 },
          perPatient: [],
        },
      });
    }

    const rows = await AiSimulationResult.find({ patient: { $in: patientIds } })
      .populate("patient", "name email")
      .sort({ createdAt: -1 })
      .limit(500);

    const riskCounts = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    const perPatientMap = new Map();
    let pendingReviews = 0;

    rows.forEach((row) => {
      if (row.reviewStatus === "pending") pendingReviews += 1;
      (row.output || []).forEach((moduleOutput) => {
        const level = moduleOutput.risk_level;
        if (level && riskCounts[level] != null) riskCounts[level] += 1;
      });
      const key = String(row.patient?._id || row.patient);
      if (!perPatientMap.has(key)) {
        perPatientMap.set(key, {
          patientId: key,
          name: row.patient?.name || "Unknown",
          email: row.patient?.email || "",
          simulations: 0,
          pendingReviews: 0,
          alerts: 0,
        });
      }
      const curr = perPatientMap.get(key);
      curr.simulations += 1;
      curr.alerts += row.alertsCount || 0;
      if (row.reviewStatus === "pending") curr.pendingReviews += 1;
    });

    return res.json({
      success: true,
      analytics: {
        totalPatients: patientIds.length,
        totalSimulations: rows.length,
        pendingReviews,
        riskCounts,
        perPatient: Array.from(perPatientMap.values()).sort((a, b) => b.pendingReviews - a.pendingReviews),
      },
    });
  } catch (error) {
    console.error("Assigned analytics error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch assigned analytics" });
  }
});

router.get("/doctor/pending-count", auth(["doctor"]), async (req, res) => {
  try {
    const patientIds = await Appointment.find({ doctor: req.user._id }).distinct("patient");
    const pendingCount = await AiSimulationResult.countDocuments({
      patient: { $in: patientIds },
      reviewStatus: "pending",
    });
    return res.json({ success: true, pendingCount });
  } catch (error) {
    console.error("Pending count fetch error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch pending count" });
  }
});

router.get("/history/export", auth(["patient", "doctor"]), async (req, res) => {
  try {
    const patientId = req.user.role === "patient" ? req.user._id : req.query.patientId || req.user._id;
    if (req.user.role === "doctor") {
      const allowed = await User.exists({ _id: patientId, role: "patient", assignedDoctor: req.user._id });
      if (!allowed) return res.status(403).json({ success: false, message: "Access denied" });
    }
    const rows = await AiSimulationResult.find({ patient: patientId }).sort({ createdAt: -1 }).limit(500);
    const header = ["createdAt", "source", "safetyStatus", "success", "reviewStatus", "alertsCount", "modules"];
    const csv = [
      header.join(","),
      ...rows.map((row) => {
        const modules = (row.output || []).map((m) => m.module).join("|");
        return [
          new Date(row.createdAt).toISOString(),
          row.source,
          row.safetyStatus,
          row.success,
          row.reviewStatus,
          row.alertsCount,
          `"${modules}"`,
        ].join(",");
      }),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=ai-simulation-history.csv");
    return res.send(csv);
  } catch (error) {
    console.error("AI export error:", error);
    return res.status(500).json({ success: false, message: "Failed to export AI history" });
  }
});

router.get("/history/export.pdf", auth(["patient", "doctor"]), async (req, res) => {
  try {
    const patientId = req.user.role === "patient" ? req.user._id : req.query.patientId || req.user._id;
    if (req.user.role === "doctor") {
      const allowed = await User.exists({ _id: patientId, role: "patient", assignedDoctor: req.user._id });
      if (!allowed) return res.status(403).json({ success: false, message: "Access denied" });
    }
    const rows = await AiSimulationResult.find({ patient: patientId }).sort({ createdAt: -1 }).limit(200);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=ai-simulation-history.pdf");

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);

    doc.fontSize(16).text("AI Simulation History Report", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown(1);

    rows.forEach((row, index) => {
      doc.fontSize(11).text(`${index + 1}. ${new Date(row.createdAt).toLocaleString()}`);
      doc
        .fontSize(9)
        .text(
          `Source: ${row.source} | Safety: ${row.safetyStatus} | Review: ${row.reviewStatus} | Alerts: ${row.alertsCount}`,
        );
      const modules = (row.output || []).map((m) => `${m.module} (${m.risk_level}, conf ${m.confidence_score})`);
      doc.text(`Modules: ${modules.join(" | ")}`);
      if (row.reviewNotes) doc.text(`Review Notes: ${row.reviewNotes}`);
      doc.moveDown(0.5);
      if (doc.y > 740) doc.addPage();
    });

    doc.end();
  } catch (error) {
    console.error("AI PDF export error:", error);
    return res.status(500).json({ success: false, message: "Failed to export AI history PDF" });
  }
});

router.patch("/review/:resultId/insulin", auth(["doctor"]), async (req, res) => {
  try {
    const { resultId } = req.params;
    const decision = String(req.body.decision || "").toLowerCase();
    const notes = String(req.body.notes || "").trim();
    const doctorSuggestion = String(req.body.doctorSuggestion || "").trim();
    if (!["approved", "rejected", "modified"].includes(decision)) {
      return res.status(400).json({ success: false, message: "Decision must be approved, rejected, or modified" });
    }

    const result = await AiSimulationResult.findById(resultId);
    if (!result) return res.status(404).json({ success: false, message: "Result not found" });

    const allowed = await User.exists({ _id: result.patient, role: "patient", assignedDoctor: req.user._id });
    if (!allowed) return res.status(403).json({ success: false, message: "Access denied" });

    result.reviewStatus = decision;
    result.reviewNotes = notes || doctorSuggestion;
    result.reviewedBy = req.user._id;
    result.reviewedAt = new Date();
    result.output = (result.output || []).map((moduleOutput) => {
      if (!moduleOutput.requires_doctor_approval) return moduleOutput;
      return {
        ...moduleOutput,
        doctor_review_status: decision,
        doctor_review_notes: notes,
        doctor_suggestion: doctorSuggestion,
        requires_doctor_approval: false,
      };
    });

    await result.save();
    return res.json({ success: true, item: result });
  } catch (error) {
    console.error("Insulin review update error:", error);
    return res.status(500).json({ success: false, message: "Failed to update insulin review" });
  }
});

router.patch("/request-review/:resultId", auth(["patient"]), async (req, res) => {
  try {
    const { resultId } = req.params;
    const result = await AiSimulationResult.findById(resultId);
    if (!result) return res.status(404).json({ success: false, message: "Result not found" });
    if (String(result.patient) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    result.reviewStatus = "pending";
    result.reviewNotes = String(req.body?.notes || "Patient requested doctor review.");
    await result.save();
    return res.json({ success: true, item: result });
  } catch (error) {
    console.error("Patient request review error:", error);
    return res.status(500).json({ success: false, message: "Failed to request doctor review" });
  }
});


router.get("/sample-payload", (req, res) => {
  res.json({
    patientId: "P-1001",
    vitals: {
      age: 52,
      weight: 82,
      activityScore: 4,
      currentGlucose: 178,
      glucoseTarget: 110,
      systolic: 146,
      diastolic: 92,
    },
    history: {
      glucoseReadings: Array.from({ length: 30 }).map((_, i) => ({
        timestamp: new Date(Date.now() - (30 - i) * 60 * 60 * 1000).toISOString(),
        value: 110 + ((i % 7) - 3) * 8 + (i > 20 ? 10 : 0),
      })),
      meals: [
        { timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), carbs: 60 },
        { timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), carbs: 45 },
      ],
      insulin: [
        { timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), units: 4 },
        { timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), units: 3 },
      ],
      medications: [{ name: "Metformin", adherence: "good" }],
      bpReadings: [
        { systolic: 138, diastolic: 88 },
        { systolic: 142, diastolic: 91 },
        { systolic: 146, diastolic: 92 },
      ],
      doctorRules: {
        correctionFactor: 40,
        minDose: 0,
        maxDose: 8,
      },
    },
  });
});

module.exports = router;

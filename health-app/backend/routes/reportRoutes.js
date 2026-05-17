const router = require("express").Router();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const auth = require("../middleware/roleAuth");
const HealthEntry = require("../models/HealthEntry");
const User = require("../models/User");
const AiSimulationResult = require("../models/AiSimulationResult");
const Consultation = require("../models/Consultation");
const ReportAttachment = require("../models/ReportAttachment");

const PATIENT_REPORTS_DIR = path.resolve(__dirname, "..", "uploads", "patient-reports");
if (!fs.existsSync(PATIENT_REPORTS_DIR)) {
  fs.mkdirSync(PATIENT_REPORTS_DIR, { recursive: true });
}

const reportFileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PATIENT_REPORTS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `report-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

const reportFileUpload = multer({
  storage: reportFileStorage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    const allowed =
      mime === "application/pdf" ||
      mime.startsWith("image/") ||
      mime === "text/csv" ||
      mime === "application/vnd.ms-excel" ||
      mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    cb(allowed ? null : new Error("Allowed: PDF, images, CSV, or Excel."), allowed);
  },
});

const parseDateRange = (from, to) => {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const avg = (arr) => (arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : null);
const min = (arr) => (arr.length ? Math.min(...arr) : null);
const max = (arr) => (arr.length ? Math.max(...arr) : null);

const deriveRisk = ({ avgGlucose, avgSystolic, avgDiastolic }) => {
  const glucoseHigh = avgGlucose != null && avgGlucose >= 180;
  const glucoseWarn = avgGlucose != null && avgGlucose >= 140;
  const bpHigh = (avgSystolic != null && avgSystolic >= 140) || (avgDiastolic != null && avgDiastolic >= 90);
  const bpWarn = (avgSystolic != null && avgSystolic >= 130) || (avgDiastolic != null && avgDiastolic >= 80);
  if (glucoseHigh || bpHigh) return { level: "High Risk", color: "red" };
  if (glucoseWarn || bpWarn) return { level: "Warning", color: "yellow" };
  return { level: "Normal", color: "green" };
};

const buildInsights = (entries = []) => {
  if (!entries.length) return ["Insufficient data for AI insights."];
  const sorted = [...entries].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const insights = [];
  const lastThree = sorted.slice(-3).map((e) => e.glucose).filter((v) => typeof v === "number");
  if (lastThree.length === 3) {
    if (lastThree[2] > lastThree[1] && lastThree[1] > lastThree[0]) {
      insights.push("Your glucose trend is increasing over last 3 readings.");
    } else if (lastThree[2] < lastThree[1] && lastThree[1] < lastThree[0]) {
      insights.push("Your glucose trend is decreasing over last 3 readings.");
    } else {
      insights.push("Your glucose is relatively stable across recent readings.");
    }
  }

  const morningBp = sorted.filter((e) => {
    const h = new Date(e.createdAt).getHours();
    return h >= 5 && h <= 10 && e.systolic != null;
  });
  const highMorning = morningBp.filter((e) => e.systolic >= 140 || e.diastolic >= 90);
  if (morningBp.length && highMorning.length / morningBp.length >= 0.4) {
    insights.push("High BP detected in mornings.");
  }

  const week = sorted.slice(-7).filter((e) => e.glucose != null);
  const stable =
    week.length >= 4 &&
    Math.max(...week.map((e) => e.glucose)) - Math.min(...week.map((e) => e.glucose)) <= 25;
  if (stable) insights.push("Stable condition this week.");
  return insights.length ? insights : ["No major risk pattern detected in selected date range."];
};

const buildRecommendations = (summary) => {
  const items = [
    "Maintain balanced meals with controlled carbohydrate portions.",
    "Target at least 30 minutes of moderate activity on most days.",
    "Track blood glucose and BP at consistent times daily.",
    "Consult your doctor for medication review if readings remain elevated.",
  ];
  if (summary.avgGlucose != null && summary.avgGlucose >= 180) {
    items.unshift("Reduce sugary foods and monitor post-meal glucose more closely.");
  }
  if ((summary.avgSystolic || 0) >= 140 || (summary.avgDiastolic || 0) >= 90) {
    items.unshift("Reduce sodium intake and prioritize sleep and stress management.");
  }
  return items;
};

const buildTrendSeries = (entries, groupBy = "daily") => {
  const keyFn = (d) => {
    const dt = new Date(d);
    if (groupBy === "monthly") return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    if (groupBy === "weekly") {
      const tmp = new Date(dt);
      const day = (tmp.getDay() + 6) % 7;
      tmp.setDate(tmp.getDate() - day);
      return `${tmp.getFullYear()}-W${String(Math.ceil((tmp.getDate() + 6) / 7)).padStart(2, "0")}`;
    }
    return dt.toISOString().slice(0, 10);
  };

  const buckets = new Map();
  for (const entry of entries) {
    const key = keyFn(entry.createdAt);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(entry);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .map(([period, rows]) => ({
      period,
      glucose: avg(rows.map((r) => r.glucose).filter((v) => typeof v === "number")),
      systolic: avg(rows.map((r) => r.systolic).filter((v) => typeof v === "number")),
      diastolic: avg(rows.map((r) => r.diastolic).filter((v) => typeof v === "number")),
    }));
};

const buildReport = async ({ patientId, from, to, groupBy = "daily" }) => {
  const { start, end } = parseDateRange(from, to);
  const [patient, entries, aiRows, consultations, latestGenderEntry] = await Promise.all([
    User.findById(patientId).populate("assignedDoctor", "name email specialization"),
    HealthEntry.find({ patient: patientId, createdAt: { $gte: start, $lte: end } }).sort({ createdAt: -1 }),
    AiSimulationResult.find({ patient: patientId, createdAt: { $gte: start, $lte: end } })
      .sort({ createdAt: -1 })
      .limit(20),
    Consultation.find({ patientId, createdAt: { $gte: start, $lte: end } }).sort({ createdAt: -1 }).limit(20),
    HealthEntry.findOne({ patient: patientId, gender: { $in: ["male", "female"] } }).sort({ createdAt: -1 }),
  ]);

  const glucose = entries.map((e) => e.glucose).filter((v) => typeof v === "number");
  const systolic = entries.map((e) => e.systolic).filter((v) => typeof v === "number");
  const diastolic = entries.map((e) => e.diastolic).filter((v) => typeof v === "number");
  const summary = {
    averageGlucose: avg(glucose),
    averageBloodPressure: { systolic: avg(systolic), diastolic: avg(diastolic) },
    highest: { glucose: max(glucose), systolic: max(systolic), diastolic: max(diastolic) },
    lowest: { glucose: min(glucose), systolic: min(systolic), diastolic: min(diastolic) },
  };
  const risk = deriveRisk({
    avgGlucose: summary.averageGlucose,
    avgSystolic: summary.averageBloodPressure.systolic,
    avgDiastolic: summary.averageBloodPressure.diastolic,
  });

  const aiInsights = buildInsights(entries);
  const latestAi = aiRows[0];
  const doctorNotes = [
    ...consultations.map((c) => c.notes).filter(Boolean),
    ...aiRows.map((row) => row.reviewNotes).filter(Boolean),
  ].slice(0, 8);

  const report = {
    patient: {
      name: patient?.name || "Unknown",
      age: entries[0]?.age ?? null,
      gender: latestGenderEntry?.gender || entries.find((e) => e.gender)?.gender || "Not specified",
      patientId: String(patient?._id || patientId),
      assignedDoctor: patient?.assignedDoctor?.name || "Not assigned",
    },
    reportRange: {
      from: start.toISOString(),
      to: end.toISOString(),
      groupBy,
    },
    summary,
    vitalsHistory: entries.map((e) => ({
      id: String(e._id),
      dateTime: e.createdAt,
      glucose: e.glucose ?? null,
      systolic: e.systolic ?? null,
      diastolic: e.diastolic ?? null,
      notes: e.notes || "",
    })),
    trends: buildTrendSeries(entries, groupBy),
    aiInsights,
    risk,
    doctorNotes,
    recommendations: buildRecommendations({
      avgGlucose: summary.averageGlucose,
      avgSystolic: summary.averageBloodPressure.systolic,
      avgDiastolic: summary.averageBloodPressure.diastolic,
    }),
    aiMeta: latestAi
      ? {
          safetyStatus: latestAi.safetyStatus,
          reviewStatus: latestAi.reviewStatus,
          alertsCount: latestAi.alertsCount || 0,
        }
      : null,
    generatedAt: new Date().toISOString(),
  };
  return report;
};

router.get("/patient/files", auth(["patient"]), async (req, res) => {
  try {
    const files = await ReportAttachment.find({ patient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return res.json({
      success: true,
      files: files.map((f) => ({
        id: String(f._id),
        name: f.originalName,
        category: f.category,
        mimeType: f.mimeType,
        size: f.size,
        url: f.filePath,
        uploadedAt: f.createdAt,
      })),
    });
  } catch (error) {
    console.error("List report files error:", error);
    return res.status(500).json({ success: false, message: "Failed to load report files" });
  }
});

router.post("/patient/files", auth(["patient"]), reportFileUpload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }
    const category = ["lab", "imaging", "prescription", "other"].includes(req.body?.category)
      ? req.body.category
      : "other";
    const filePath = `/uploads/patient-reports/${req.file.filename}`;
    const doc = await ReportAttachment.create({
      patient: req.user._id,
      originalName: req.file.originalname,
      fileName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
      category,
      filePath,
    });
    return res.status(201).json({
      success: true,
      file: {
        id: String(doc._id),
        name: doc.originalName,
        category: doc.category,
        mimeType: doc.mimeType,
        size: doc.size,
        url: doc.filePath,
        uploadedAt: doc.createdAt,
      },
    });
  } catch (error) {
    console.error("Upload report file error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to upload file" });
  }
});

router.delete("/patient/files/:id", auth(["patient"]), async (req, res) => {
  try {
    const doc = await ReportAttachment.findOne({ _id: req.params.id, patient: req.user._id });
    if (!doc) {
      return res.status(404).json({ success: false, message: "File not found." });
    }
    const diskPath = path.join(PATIENT_REPORTS_DIR, doc.fileName);
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    await doc.deleteOne();
    return res.json({ success: true });
  } catch (error) {
    console.error("Delete report file error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete file" });
  }
});

router.get("/patient", auth(["patient"]), async (req, res) => {
  try {
    const report = await buildReport({
      patientId: req.user._id,
      from: req.query.from,
      to: req.query.to,
      groupBy: req.query.groupBy || "daily",
    });
    return res.json({ success: true, report });
  } catch (error) {
    console.error("Build patient report error:", error);
    return res.status(500).json({ success: false, message: "Failed to build patient report" });
  }
});

router.get("/patient/export.csv", auth(["patient"]), async (req, res) => {
  try {
    const report = await buildReport({
      patientId: req.user._id,
      from: req.query.from,
      to: req.query.to,
      groupBy: req.query.groupBy || "daily",
    });

    const header = ["DateTime", "Glucose", "Systolic", "Diastolic", "Notes"];
    const rows = report.vitalsHistory.map((row) =>
      [new Date(row.dateTime).toISOString(), row.glucose ?? "", row.systolic ?? "", row.diastolic ?? "", `"${(row.notes || "").replace(/"/g, '""')}"`].join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=patient-report.csv");
    return res.send(csv);
  } catch (error) {
    console.error("Export patient report CSV error:", error);
    return res.status(500).json({ success: false, message: "Failed to export patient report CSV" });
  }
});

router.get("/patient/export.pdf", auth(["patient"]), async (req, res) => {
  try {
    const report = await buildReport({
      patientId: req.user._id,
      from: req.query.from,
      to: req.query.to,
      groupBy: req.query.groupBy || "daily",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=patient-report.pdf");
    const doc = new PDFDocument({ margin: 36, size: "A4" });
    doc.pipe(res);

    doc.fontSize(16).text("MediusCare Clinical Patient Report", { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(10).text(`Patient: ${report.patient.name} (${report.patient.patientId})`);
    doc.text(`Assigned Doctor: ${report.patient.assignedDoctor}`);
    doc.text(`Date Range: ${new Date(report.reportRange.from).toLocaleDateString()} - ${new Date(report.reportRange.to).toLocaleDateString()}`);
    doc.moveDown(0.6);
    doc.fontSize(11).text("Health Summary", { underline: true });
    doc.fontSize(10).text(`Average Glucose: ${report.summary.averageGlucose ?? "N/A"} mg/dL`);
    doc.text(`Average BP: ${report.summary.averageBloodPressure.systolic ?? "N/A"}/${report.summary.averageBloodPressure.diastolic ?? "N/A"}`);
    doc.text(`Risk Level: ${report.risk.level}`);
    doc.moveDown(0.5);
    doc.fontSize(11).text("AI Insights", { underline: true });
    report.aiInsights.forEach((i) => doc.fontSize(10).text(`- ${i}`));
    doc.moveDown(0.4);
    doc.fontSize(11).text("Recommendations", { underline: true });
    report.recommendations.forEach((i) => doc.fontSize(10).text(`- ${i}`));
    doc.moveDown(0.5);
    doc.fontSize(8).text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`);
    doc.text("MediusCare");
    doc.text("This report is AI-assisted. Consult your doctor for medical decisions.");
    doc.end();
  } catch (error) {
    console.error("Export patient report PDF error:", error);
    return res.status(500).json({ success: false, message: "Failed to export patient report PDF" });
  }
});

module.exports = router;

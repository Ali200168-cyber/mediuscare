const router = require("express").Router();
const HealthEntry = require("../models/HealthEntry");
const auth = require("../middleware/roleAuth");
const Alert = require("../models/Alert");
const User = require("../models/User");
const { sendSmsNotification } = require("../services/emailService");

const CRITICAL_GLUCOSE_THRESHOLD = Number(process.env.CRITICAL_GLUCOSE_THRESHOLD || 250);

const parsePositive = (value, label, { min = 0, max = Infinity, required = true } = {}) => {
  if (value === undefined || value === null || value === "") {
    if (!required) return null;
    throw new Error(`${label} is required.`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${label} must be a valid number.`);
  if (n < min) {
    throw new Error(min <= 0 ? `${label} cannot be negative.` : `${label} must be at least ${min}.`);
  }
  if (n > max) throw new Error(`${label} is out of range.`);
  return n;
};

const normalizeSymptoms = (symptoms) => {
  const list = Array.isArray(symptoms)
    ? symptoms.map((s) => String(s || "").trim()).filter(Boolean)
    : [];
  if (!list.length) throw new Error("Select symptoms or choose “No symptoms”.");
  const hasNone = list.some((s) => s.toLowerCase() === "no symptoms");
  if (hasNone) return ["No symptoms"];
  return list;
};

router.post("/", auth(["patient"]), async (req, res) => {
  const { height, weight, gender, glucose, systolic, diastolic, symptoms, mealHoursAgo, age, notes } = req.body;

  try {
    const normalizedSymptoms = normalizeSymptoms(symptoms);
    const parsed = {
      height: height != null && height !== "" ? parsePositive(height, "Height", { min: 0, max: 300, required: false }) : undefined,
      weight: parsePositive(weight, "Weight", { min: 0.1, max: 500 }),
      gender,
      glucose: parsePositive(glucose, "Glucose", { min: 0.1, max: 600 }),
      systolic: parsePositive(systolic, "Systolic blood pressure", { min: 0.1, max: 300 }),
      diastolic: parsePositive(diastolic, "Diastolic blood pressure", { min: 0.1, max: 200 }),
      symptoms: normalizedSymptoms,
      mealHoursAgo: parsePositive(mealHoursAgo, "Meal hours ago", { min: 0, max: 72 }),
      age: parsePositive(age, "Age", { min: 1, max: 120 }),
      notes,
    };

    if (parsed.systolic <= parsed.diastolic) {
      return res.status(400).json({ success: false, message: "Systolic blood pressure must be higher than diastolic." });
    }

    const entry = await HealthEntry.create({
      patient: req.user._id,
      ...parsed,
    });

    const glucoseValue = Number(glucose);
    if (Number.isFinite(glucoseValue) && glucoseValue >= CRITICAL_GLUCOSE_THRESHOLD) {
      const patient = await User.findById(req.user._id).select("name email phone assignedDoctor linkedCaregiverIds");

      const recipients = [];
      if (patient) {
        recipients.push({
          role: "patient",
          userId: String(patient._id),
          name: patient.name || "Patient",
          email: patient.email || "",
          phone: patient.phone || "",
        });
      }

      if (patient?.assignedDoctor) {
        const doctor = await User.findById(patient.assignedDoctor).select("name email phone");
        if (doctor) {
          recipients.push({
            role: "doctor",
            userId: String(doctor._id),
            name: doctor.name || "Doctor",
            email: doctor.email || "",
            phone: doctor.phone || "",
          });
        }
      }

      if (Array.isArray(patient?.linkedCaregiverIds) && patient.linkedCaregiverIds.length) {
        const caregivers = await User.find({ _id: { $in: patient.linkedCaregiverIds } }).select("name email phone");
        caregivers.forEach((cg) => {
          recipients.push({
            role: "caregiver",
            userId: String(cg._id),
            name: cg.name || "Caregiver",
            email: cg.email || "",
            phone: cg.phone || "",
          });
        });
      }

      const patientName = patient?.name || "Patient";
      const alertMessage = `Critical glucose reading detected (${glucoseValue} mg/dL) for ${patientName}.`;
      await Alert.create({
        patientId: req.user._id,
        type: "critical_glucose",
        severity: "High",
        message: alertMessage,
        channel: ["in_app", "email", "sms"],
        status: "open",
        metadata: {
          healthEntryId: String(entry._id),
          glucose: glucoseValue,
          threshold: CRITICAL_GLUCOSE_THRESHOLD,
          recipients: recipients.map((r) => ({ role: r.role, userId: r.userId, email: r.email, phone: r.phone })),
        },
      });

      const smsText = `CRITICAL ALERT: ${patientName} glucose ${glucoseValue} mg/dL. Please review now.`;
      await Promise.all(
        recipients.map(async (r) => {
          // Email alerts are disabled on this server.
          if (r.phone) {
            try {
              await sendSmsNotification({ phone: r.phone, message: smsText });
            } catch (smsErr) {
              console.error(`Critical alert SMS failed for ${r.phone}:`, smsErr.message);
            }
          }
        }),
      );
    }

    res.json({ success: true, entry });
  } catch (err) {
    const msg = err?.message || "Failed to submit health data";
    const isValidation = /required|negative|valid number|symptoms|diastolic|range/i.test(msg);
    if (isValidation) {
      return res.status(400).json({ success: false, message: msg });
    }
    console.error("Health data submission error:", err);
    res.status(500).json({ success: false, message: "Failed to submit health data" });
  }
});

// GET /api/health/latest - latest entry for patient
router.get("/latest", auth(["patient"]), async (req, res) => {
  try {
    const latest = await HealthEntry.findOne({ patient: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, entry: latest });
  } catch (err) {
    console.error("Fetch latest entry error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch latest entry" });
  }
});

// GET /api/health/recent?limit=6 - recent entries
router.get("/recent", auth(["patient"]), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const entries = await HealthEntry.find({ patient: req.user._id }).sort({ createdAt: -1 }).limit(limit);
    res.json({ success: true, entries });
  } catch (err) {
    console.error("Fetch recent entries error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch recent entries" });
  }
});

// GET /api/health - all entries (doctor can see all)
router.get("/", auth(["patient", "doctor"]), async (req, res) => {
  try {
    const query = req.user.role === "patient" ? { patient: req.user._id } : {};
    const entries = await HealthEntry.find(query).populate("patient", "name email").sort({ createdAt: -1 });
    res.json({ success: true, entries });
  } catch (err) {
    console.error("Fetch health data error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch health data" });
  }
});

module.exports = router;

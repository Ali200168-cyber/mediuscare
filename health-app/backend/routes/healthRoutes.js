const router = require("express").Router();
const HealthEntry = require("../models/HealthEntry");
const auth = require("../middleware/roleAuth");
const Alert = require("../models/Alert");
const User = require("../models/User");
const { sendSmsNotification } = require("../services/emailService");

const CRITICAL_GLUCOSE_THRESHOLD = Number(process.env.CRITICAL_GLUCOSE_THRESHOLD || 250);

router.post("/", auth(["patient"]), async (req, res) => {
  const { height, weight, gender, glucose, systolic, diastolic, symptoms, mealHoursAgo, age, notes } = req.body;

  try {
    const entry = await HealthEntry.create({
      patient: req.user._id,
      height,
      weight,
      gender,
      glucose,
      systolic,
      diastolic,
      symptoms,
      mealHoursAgo,
      age,
      notes,
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

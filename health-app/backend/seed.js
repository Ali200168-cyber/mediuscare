/**
 * One-time demo seed for assigned patient / doctor / caregiver accounts.
 * Run: npm run seed   (from backend/)
 * Does not modify users or delete existing data.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const User = require("./models/User");
const HealthEntry = require("./models/HealthEntry");
const Alert = require("./models/Alert");
const AiSimulationResult = require("./models/AiSimulationResult");
const DoctorFeedback = require("./models/DoctorFeedback");
const Consultation = require("./models/Consultation");
const ChatMessage = require("./models/ChatMessage");
const CaregiverDoctorMessage = require("./models/CaregiverDoctorMessage");

/** Demo window: last ~15 days (half month) */
const DEMO_DAYS = 15;
const SEED_TAG = "chali-demo-v2-halfmonth";

const EMAILS = {
  patient: "chali200168@gmail.com",
  doctor: "chali200169@gmail.com",
  caregiver: "chali200172@gmail.com",
};

const daysAgo = (n, hour = 10, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
};

async function connect() {
  const candidates = [
    process.env.MONGO_URI,
    process.env.LOCAL_MONGO_URI,
    "mongodb://127.0.0.1:27017/Medius",
  ].filter(Boolean);

  let lastError;
  for (const uri of candidates) {
    try {
      await mongoose.connect(uri, { dbName: "Medius" });
      const safe = uri.replace(/\/\/.*@/, "//***@");
      console.log(`Connected to MongoDB (db: Medius) — ${safe}`);
      return;
    } catch (err) {
      lastError = err;
      await mongoose.disconnect().catch(() => {});
    }
  }
  throw lastError || new Error("Could not connect to MongoDB");
}

async function findUserByEmail(email, role) {
  const user = await User.findOne({ email: email.toLowerCase().trim(), role });
  if (!user) throw new Error(`User not found: ${role} → ${email}`);
  return user;
}

async function seedAlreadyRun(patientId) {
  const marker = await HealthEntry.findOne({
    patient: patientId,
    notes: { $regex: SEED_TAG },
  }).select("_id");
  return Boolean(marker);
}

function buildHealthEntries(patientId) {
  // ~14 logs across the last 15 days (most days covered)
  const specs = [
    { days: 14, glucose: 98, sys: 118, dia: 76, weight: 78.2, symptoms: [], meal: "breakfast", mealH: 2 },
    { days: 13, glucose: 132, sys: 124, dia: 80, weight: 78.0, symptoms: ["Fatigue"], meal: "lunch", mealH: 3 },
    { days: 12, glucose: 155, sys: 134, dia: 86, weight: 77.9, symptoms: [], meal: "dinner", mealH: 1 },
    { days: 11, glucose: 108, sys: 120, dia: 78, weight: 77.7, symptoms: [], meal: "breakfast", mealH: 4 },
    { days: 10, glucose: 148, sys: 128, dia: 82, weight: 78.1, symptoms: ["Headache"], meal: "lunch", mealH: 2 },
    { days: 9, glucose: 178, sys: 142, dia: 90, weight: 78.3, symptoms: ["Blurred Vision", "Dizziness"], meal: "dinner", mealH: 1 },
    { days: 8, glucose: 102, sys: 116, dia: 74, weight: 77.6, symptoms: [], meal: "breakfast", mealH: 3 },
    { days: 7, glucose: 162, sys: 136, dia: 88, weight: 78.2, symptoms: ["Nausea"], meal: "lunch", mealH: 2 },
    { days: 6, glucose: 115, sys: 122, dia: 79, weight: 77.8, symptoms: [], meal: "dinner", mealH: 3 },
    { days: 5, glucose: 94, sys: 112, dia: 72, weight: 77.5, symptoms: [], meal: "breakfast", mealH: 2 },
    { days: 4, glucose: 168, sys: 138, dia: 87, weight: 78.0, symptoms: ["Fatigue"], meal: "lunch", mealH: 1 },
    { days: 3, glucose: 172, sys: 140, dia: 90, weight: 78.4, symptoms: ["Headache"], meal: "dinner", mealH: 1 },
    { days: 2, glucose: 110, sys: 118, dia: 76, weight: 77.7, symptoms: [], meal: "breakfast", mealH: 3 },
    { days: 1, glucose: 118, sys: 120, dia: 78, weight: 77.6, symptoms: [], meal: "lunch", mealH: 2 },
  ];

  return specs.map((s, i) => {
    const createdAt = daysAgo(s.days, 8 + (i % 4) * 2);
    return {
      patient: patientId,
      age: 42,
      gender: "male",
      glucose: s.glucose,
      fastingGlucose: s.meal === "breakfast" ? s.glucose : undefined,
      postMealGlucose: s.meal !== "breakfast" ? s.glucose : undefined,
      systolic: s.sys,
      diastolic: s.dia,
      weight: s.weight,
      symptoms: s.symptoms,
      mealRecords: [s.meal],
      mealHoursAgo: s.mealH,
      medicationHistory: ["Metformin 500mg daily"],
      notes: `Demo vitals log #${i + 1}. Resting HR ~${72 + (i % 5) * 4} bpm. [${SEED_TAG}]`,
      createdAt,
      updatedAt: createdAt,
    };
  });
}

function buildAiPredictions(patientId, doctorId) {
  const specs = [
    {
      days: 13,
      risk: "Normal",
      reviewStatus: "approved",
      summary: "Glucose and BP within acceptable ranges for the past week.",
      score: 0.22,
      dose: null,
    },
    {
      days: 10,
      risk: "Elevated",
      reviewStatus: "pending",
      summary: "Post-meal glucose spikes detected; monitor carbohydrate intake.",
      score: 0.58,
      dose: null,
    },
    {
      days: 7,
      risk: "High",
      reviewStatus: "modified",
      summary: "Sustained elevation after dinner readings; clinician review advised.",
      score: 0.81,
      dose: "Discuss metformin timing — consider evening dose adjustment per protocol.",
    },
    {
      days: 5,
      risk: "Elevated",
      reviewStatus: "rejected",
      summary: "Model flagged irregular meal timing; insufficient data for dose change.",
      score: 0.55,
      dose: "Suggested 750mg — rejected pending more readings.",
    },
    {
      days: 2,
      risk: "Normal",
      reviewStatus: "approved",
      summary: "Recent BP improved; glucose trending down after dietary changes.",
      score: 0.28,
      dose: null,
    },
  ];

  return specs.map((s) => {
    const createdAt = daysAgo(s.days, 14);
    const reviewed = ["approved", "modified", "rejected"].includes(s.reviewStatus);
    return {
      patient: patientId,
      requestedBy: patientId,
      source: "health_entries",
      inputSummary: { seedTag: SEED_TAG, vitalsWindowDays: DEMO_DAYS },
      safetyStatus: "validated",
      success: true,
      reason: "",
      performance: { latencyMs: 420 },
      reviewStatus: s.reviewStatus,
      reviewNotes: reviewed ? `Doctor review: ${s.reviewStatus} for demo.` : "",
      reviewedBy: reviewed ? doctorId : null,
      reviewedAt: reviewed ? createdAt : null,
      alertsCount: s.risk === "High" ? 2 : s.risk === "Elevated" ? 1 : 0,
      output: [
        {
          module: "glucose_forecast",
          risk_level: s.risk,
          confidence: 1 - s.score * 0.3,
          explanation: {
            summary: s.summary,
            top_factors: ["Meal timing", "Recent glucose trend", "BP variability"],
          },
          prediction: {
            risk_score: s.score,
            glucose_trend: s.risk === "Normal" ? "Stable" : s.risk === "Elevated" ? "Rising" : "High volatility",
          },
        },
        {
          module: "smart_recommendation_system",
          requires_doctor_approval: s.risk !== "Normal",
          recommendation: s.dose || "Continue current monitoring plan; log meals consistently.",
          prediction: { suggested_dose_units: s.dose },
        },
      ],
      createdAt,
      updatedAt: createdAt,
    };
  });
}

function buildAlerts(patientId) {
  const specs = [
    {
      days: 2,
      type: "glucose_critical",
      severity: "High",
      title: "High glucose detected",
      message: "Glucose reading 172 mg/dL exceeds your target range. Please review recent meals and hydration.",
      status: "open",
    },
    {
      days: 4,
      type: "bp_critical",
      severity: "High",
      title: "High blood pressure alert",
      message: "Blood pressure 140/90 mmHg recorded. Rest for 15 minutes and recheck if symptoms persist.",
      status: "open",
    },
    {
      days: 7,
      type: "bp_trend",
      severity: "Medium",
      title: "Elevated BP trend",
      message: "Average systolic over the last 3 readings is above 130 mmHg. Consider morning monitoring.",
      status: "acknowledged",
    },
    {
      days: 9,
      type: "meal_timing",
      severity: "Medium",
      title: "Irregular meal timing",
      message: "Several entries logged less than 2 hours after meals. This may affect glucose interpretation.",
      status: "open",
    },
    {
      days: 12,
      type: "health_entry",
      severity: "Low",
      title: "Health entry submitted",
      message: "Your vitals were logged successfully. Keep up daily tracking for better AI insights.",
      status: "closed",
    },
    {
      days: 14,
      type: "weekly_summary",
      severity: "Low",
      title: "Weekly summary ready",
      message: "Your 7-day health summary is available on the dashboard.",
      status: "closed",
    },
  ];

  return specs.map((s) => {
    const createdAt = daysAgo(s.days, 9);
    return {
      patientId,
      type: s.type,
      severity: s.severity,
      message: s.message,
      channel: ["in_app"],
      status: s.status,
      metadata: { seedTag: SEED_TAG, title: s.title },
      createdAt,
      updatedAt: createdAt,
    };
  });
}

function buildDoctorFeedback(patientId, doctorId, consultationIds) {
  const specs = [
    {
      days: 12,
      notes: "Overall health is stable. Continue balanced meals, 30 minutes of light activity daily, and stay hydrated.",
      diagnosis: "Type 2 diabetes — controlled",
      lifestyle: "Reduce refined carbs at dinner; add a short walk after meals.",
    },
    {
      days: 9,
      notes: "Responding to your elevated glucose reading (178 mg/dL): avoid sugary drinks and recheck fasting glucose tomorrow.",
      diagnosis: "Post-prandial hyperglycemia",
      monitoring: "Log glucose before breakfast and 2 hours after largest meal for 5 days.",
    },
    {
      days: 6,
      notes: "Reminder: take Metformin 500mg with your evening meal as prescribed. Do not skip doses.",
      diagnosis: "",
      medicalAdvisory: "Metformin 500mg daily with dinner. Contact clinic if nausea persists.",
    },
    {
      days: 3,
      notes: "Great improvement in blood pressure readings over the past week. Your latest BP 120/78 is excellent — keep up the good work!",
      diagnosis: "Hypertension — improving",
      lifestyle: "Continue low-sodium diet and regular monitoring.",
    },
  ];

  return specs.map((s, i) => {
    const createdAt = daysAgo(s.days, 11);
    return {
      doctorId,
      patientId,
      consultationId: consultationIds[i % consultationIds.length] || null,
      notes: `${s.notes} [${SEED_TAG}]`,
      diagnosis: s.diagnosis || "",
      recommendations: {
        lifestyle: s.lifestyle || "",
        monitoring: s.monitoring || "",
        medicalAdvisory: s.medicalAdvisory || "",
      },
      followUp: { timeframe: "2 weeks", nextVisitDate: daysAgo(-14) },
      status: "submitted",
      createdAt,
      updatedAt: createdAt,
    };
  });
}

function buildConsultations(patientId, doctorId) {
  const nextWeek = daysAgo(-5, 15, 0);
  const fiveDaysAgo = daysAgo(5, 11, 0);
  const completedVisit = daysAgo(12, 10, 30);

  return [
    {
      patientId,
      doctorId,
      date: nextWeek,
      time: "15:00",
      status: "Pending",
      notes: `Follow-up on recent glucose spikes and medication adherence. [${SEED_TAG}]`,
      consultationType: "Video consultation",
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
    {
      patientId,
      doctorId,
      date: fiveDaysAgo,
      time: "11:00",
      status: "Accepted",
      notes: `Review BP trend and adjust monitoring plan. [${SEED_TAG}]`,
      consultationType: "Video consultation",
      zegoLink: "",
      createdAt: daysAgo(8),
      updatedAt: daysAgo(5),
    },
    {
      patientId,
      doctorId,
      date: completedVisit,
      time: "10:30",
      status: "Completed",
      notes: `Initial diabetes management review — completed successfully. [${SEED_TAG}]`,
      consultationType: "Video consultation",
      durationMinutes: 30,
      createdAt: daysAgo(13),
      updatedAt: daysAgo(12),
    },
  ];
}

function buildChatMessages(patientId, doctorId) {
  const thread = [
    { from: "patient", days: 11, text: "Doctor, I started logging daily this week. My glucose was 155 yesterday evening." },
    { from: "doctor", days: 11, text: "Good initiative. Continue twice-daily logs for the next 15 days so we can see a clear trend." },
    { from: "patient", days: 7, text: "Good morning Doctor, my fasting glucose was 102 today. Is that okay?" },
    { from: "doctor", days: 7, text: "Good morning! 102 mg/dL fasting is within an acceptable range. Keep logging after meals." },
    { from: "patient", days: 4, text: "I had a reading of 172 after dinner. Should I be worried?" },
    { from: "doctor", days: 4, text: "That is elevated. Note what you ate, hydrate well, and recheck in the morning. I've added notes to your chart." },
    { from: "patient", days: 2, text: "Today's BP was 120/78. Feeling much better, thank you." },
    { from: "doctor", days: 2, text: "Excellent progress on BP. Continue your current plan and we'll review at your upcoming consultation." },
  ];

  return thread.map((m, i) => {
    const createdAt = daysAgo(m.days, 10 + i);
    const fromPatient = m.from === "patient";
    return {
      patientId,
      doctorId,
      senderId: fromPatient ? patientId : doctorId,
      receiverId: fromPatient ? doctorId : patientId,
      text: m.text,
      createdAt,
      updatedAt: createdAt,
    };
  });
}

function buildCaregiverDoctorMessages(caregiverId, doctorId, patientId) {
  const thread = [
    { from: "caregiver", days: 10, text: "Hello Doctor, glucose was high (178) a few days ago — any advice for home monitoring this week?" },
    { from: "doctor", days: 10, text: "Please ensure they log meals and take Metformin with dinner. Recheck fasting glucose and message me if above 140." },
    { from: "caregiver", days: 6, text: "They've been logging vitals daily for the past two weeks. BP today was 120/78." },
    { from: "doctor", days: 6, text: "Yes, continue twice-daily BP checks for this half-month period. Their trend is improving — thank you." },
    { from: "caregiver", days: 3, text: "Latest reading 118 mg/dL. Should we keep the same meal schedule?" },
    { from: "doctor", days: 3, text: "Yes, maintain current meal timing. I'll review full trends at the upcoming consultation." },
  ];

  return thread.map((m, i) => {
    const createdAt = daysAgo(m.days, 16 + i);
    const fromCaregiver = m.from === "caregiver";
    return {
      caregiverId,
      doctorId,
      patientId,
      senderId: fromCaregiver ? caregiverId : doctorId,
      content: m.text,
      createdAt,
      updatedAt: createdAt,
    };
  });
}

async function seed() {
  await connect();

  const patient = await findUserByEmail(EMAILS.patient, "patient");
  const doctor = await findUserByEmail(EMAILS.doctor, "doctor");
  const caregiver = await findUserByEmail(EMAILS.caregiver, "caregiver");

  console.log(`Patient:   ${patient.name} (${patient._id})`);
  console.log(`Doctor:    ${doctor.name} (${doctor._id})`);
  console.log(`Caregiver: ${caregiver.name} (${caregiver._id})`);

  if (await seedAlreadyRun(patient._id)) {
    console.log("\nSeed already run — skipping (demo data marker found).");
    await mongoose.disconnect();
    return;
  }

  const summary = {
    healthEntries: 0,
    aiPredictions: 0,
    alerts: 0,
    doctorFeedback: 0,
    consultations: 0,
    chatMessages: 0,
    caregiverMessages: 0,
  };

  const healthRows = buildHealthEntries(patient._id);
  const insertedHealth = await HealthEntry.insertMany(healthRows);
  summary.healthEntries = insertedHealth.length;

  const aiRows = buildAiPredictions(patient._id, doctor._id);
  const insertedAi = await AiSimulationResult.insertMany(aiRows);
  summary.aiPredictions = insertedAi.length;

  const alertRows = buildAlerts(patient._id);
  const insertedAlerts = await Alert.insertMany(alertRows);
  summary.alerts = insertedAlerts.length;

  const consultRows = buildConsultations(patient._id, doctor._id);
  const insertedConsults = await Consultation.insertMany(consultRows);
  summary.consultations = insertedConsults.length;
  const consultIds = insertedConsults.map((c) => c._id);

  const feedbackRows = buildDoctorFeedback(patient._id, doctor._id, consultIds);
  const insertedFeedback = await DoctorFeedback.insertMany(feedbackRows);
  summary.doctorFeedback = insertedFeedback.length;

  const chatRows = buildChatMessages(patient._id, doctor._id);
  const insertedChat = await ChatMessage.insertMany(chatRows);
  summary.chatMessages = insertedChat.length;

  const cgRows = buildCaregiverDoctorMessages(caregiver._id, doctor._id, patient._id);
  const insertedCg = await CaregiverDoctorMessage.insertMany(cgRows);
  summary.caregiverMessages = insertedCg.length;

  console.log("\n✅ Demo seed complete (insert-only, users unchanged):\n");
  console.log(`   Health entries:        ${summary.healthEntries}`);
  console.log(`   AI predictions:        ${summary.aiPredictions}`);
  console.log(`   Alerts:                ${summary.alerts}`);
  console.log(`   Doctor feedback:       ${summary.doctorFeedback}`);
  console.log(`   Consultations:         ${summary.consultations}`);
  console.log(`   Doctor–patient chat:   ${summary.chatMessages}`);
  console.log(`   Caregiver–doctor chat: ${summary.caregiverMessages}`);
  console.log(`\n   Date window: last ${DEMO_DAYS} days (half month)`);
  console.log(`   Marker tag: ${SEED_TAG}`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});

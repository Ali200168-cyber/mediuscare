/**
 * Committee demo: creates 3 linked accounts + ~15 days of sample data.
 * Run from backend/:  npm run seed
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("./models/User");
const HealthEntry = require("./models/HealthEntry");
const Alert = require("./models/Alert");
const AiSimulationResult = require("./models/AiSimulationResult");
const DoctorFeedback = require("./models/DoctorFeedback");
const Consultation = require("./models/Consultation");
const ChatMessage = require("./models/ChatMessage");
const CaregiverDoctorMessage = require("./models/CaregiverDoctorMessage");
const CaregiverRequest = require("./models/CaregiverRequest");

const DEMO_DAYS = 15;
const SEED_TAG = "committee-demo-v1";
const FORECAST_SEED_TAG = "committee-demo-forecast";
const DEMO_PASSWORD = "Demo1234!";

/** Smooth 6–24h forecast curve for demo charts (mg/dL). */
const DEMO_GLUCOSE_FORECAST_SERIES = [
  { hour: 4, glucose: 118 },
  { hour: 8, glucose: 124 },
  { hour: 12, glucose: 131 },
  { hour: 16, glucose: 127 },
  { hour: 20, glucose: 121 },
  { hour: 24, glucose: 116 },
];

/** Two readings per day (fasting AM + post-meal PM) for a rich trend line. */
const GLUCOSE_TREND_DAYS = [
  { d: 14, am: 96, pm: 128, sys: 116, dia: 74, w: 78.3 },
  { d: 13, am: 99, pm: 142, sys: 118, dia: 76, w: 78.2 },
  { d: 12, am: 94, pm: 155, sys: 122, dia: 80, w: 78.1 },
  { d: 11, am: 101, pm: 134, sys: 120, dia: 78, w: 77.9 },
  { d: 10, am: 97, pm: 148, sys: 126, dia: 82, w: 78.0 },
  { d: 9, am: 103, pm: 172, sys: 134, dia: 86, w: 78.2 },
  { d: 8, am: 100, pm: 146, sys: 124, dia: 80, w: 77.8 },
  { d: 7, am: 95, pm: 162, sys: 132, dia: 88, w: 78.1 },
  { d: 6, am: 92, pm: 118, sys: 118, dia: 76, w: 77.6 },
  { d: 5, am: 94, pm: 168, sys: 136, dia: 87, w: 78.0 },
  { d: 4, am: 98, pm: 152, sys: 128, dia: 84, w: 78.2 },
  { d: 3, am: 101, pm: 172, sys: 138, dia: 88, w: 78.3 },
  { d: 2, am: 104, pm: 128, sys: 120, dia: 77, w: 77.7 },
  { d: 1, am: 98, pm: 118, sys: 118, dia: 76, w: 77.6 },
  { d: 0, am: 102, pm: 115, sys: 116, dia: 75, w: 77.5 },
];

const ACCOUNTS = {
  patient: { email: "patient1@gmail.com", name: "Alex Morgan", role: "patient" },
  doctor: {
    email: "doctor1@gmail.com",
    name: "Dr. Sarah Chen",
    role: "doctor",
    specialization: "Endocrinology",
  },
  caregiver: { email: "caregiver1@gmail.com", name: "Jordan Lee", role: "caregiver" },
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

async function upsertAccount({ name, email, role, extra = {} }) {
  const normalized = email.toLowerCase().trim();
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  let user = await User.findOne({ email: normalized });

  if (user) {
    user.name = name;
    user.password = hash;
    user.role = role;
    user.isActive = true;
    Object.assign(user, extra);
    await user.save();
    return { user, created: false };
  }

  user = await User.create({
    name,
    email: normalized,
    password: hash,
    role,
    isActive: true,
    ...extra,
  });
  return { user, created: true };
}

async function linkAccounts(patient, doctor, caregiver) {
  patient.assignedDoctor = doctor._id;
  const linked = new Set((patient.linkedCaregiverIds || []).map(String));
  linked.add(String(caregiver._id));
  patient.linkedCaregiverIds = [...linked].map((id) => new mongoose.Types.ObjectId(id));
  await patient.save();

  await CaregiverRequest.findOneAndUpdate(
    { caregiverId: caregiver._id, patientId: patient._id },
    {
      $set: {
        status: "Approved",
        decisionAt: new Date(),
        message: "Committee demo — accounts linked automatically.",
      },
    },
    { upsert: true, new: true },
  );
}

async function seedAlreadyRun(patientId) {
  const marker = await HealthEntry.findOne({
    patient: patientId,
    notes: { $regex: SEED_TAG },
  }).select("_id");
  return Boolean(marker);
}

async function forecastDemoAlreadyRun(patientId) {
  const marker = await HealthEntry.findOne({
    patient: patientId,
    notes: { $regex: FORECAST_SEED_TAG },
  }).select("_id");
  return Boolean(marker);
}

function buildGlucoseTrendEntries(patientId, noteTag) {
  const rows = [];
  let seq = 0;
  for (const day of GLUCOSE_TREND_DAYS) {
    const slots = [
      { glucose: day.am, meal: "breakfast", mealH: 4, hour: 7, symptoms: ["No symptoms"] },
      {
        glucose: day.pm,
        meal: day.pm >= 160 ? "dinner" : "lunch",
        mealH: 2,
        hour: 19,
        symptoms: day.pm >= 165 ? ["Fatigue"] : ["No symptoms"],
      },
    ];
    for (const slot of slots) {
      seq += 1;
      const createdAt = daysAgo(day.d, slot.hour, 10 + (seq % 3) * 5);
      rows.push({
        patient: patientId,
        age: 42,
        gender: "male",
        glucose: slot.glucose,
        fastingGlucose: slot.meal === "breakfast" ? slot.glucose : undefined,
        postMealGlucose: slot.meal !== "breakfast" ? slot.glucose : undefined,
        systolic: day.sys,
        diastolic: day.dia,
        weight: day.w,
        symptoms: slot.symptoms,
        mealRecords: [slot.meal],
        mealHoursAgo: slot.mealH,
        medicationHistory: ["Metformin 500mg daily"],
        notes: `Committee demo glucose trend #${seq}. [${noteTag}]${
          noteTag === SEED_TAG ? ` [${FORECAST_SEED_TAG}]` : ""
        }`,
        createdAt,
        updatedAt: createdAt,
      });
    }
  }
  return rows;
}

function buildHealthEntries(patientId) {
  return buildGlucoseTrendEntries(patientId, SEED_TAG);
}

function buildForecastHealthEntries(patientId) {
  return buildGlucoseTrendEntries(patientId, FORECAST_SEED_TAG);
}

function buildLatestForecastAiResult(patientId, doctorId) {
  const createdAt = daysAgo(0, 15);
  const currentGlucose = GLUCOSE_TREND_DAYS[GLUCOSE_TREND_DAYS.length - 1].pm;
  return {
    patient: patientId,
    requestedBy: patientId,
    source: "health_entries",
    inputSummary: { seedTag: FORECAST_SEED_TAG, vitalsWindowDays: DEMO_DAYS },
    safetyStatus: "validated",
    success: true,
    reason: "",
    performance: { latencyMs: 380 },
    reviewStatus: "approved",
    reviewNotes: "Committee demo: glucose forecast snapshot for charts.",
    reviewedBy: doctorId,
    reviewedAt: createdAt,
    alertsCount: 0,
    output: [
      {
        module: "glucose_prediction_lstm",
        risk_level: "Medium",
        confidence_score: 0.86,
        explanation: {
          patient:
            "Your glucose is expected to stay mostly stable over the next day, with a mild afternoon rise then settling by evening.",
          doctor: "Demo forecast from dense 15-day glucose logs; suitable for committee chart walkthrough.",
          key_factors: ["Meal timing", "Recent evening readings", "Metformin adherence"],
        },
        prediction: {
          current_glucose: currentGlucose,
          forecast_horizon_hours: 24,
          predicted_series: DEMO_GLUCOSE_FORECAST_SERIES,
          trend_curve: "Stable",
          glucose_trend: "Stable",
        },
        recommendation: "Continue routine monitoring and meal logging.",
        requires_doctor_approval: false,
        alerts: [],
      },
      {
        module: "smart_recommendation_system",
        requires_doctor_approval: false,
        recommendation: "Maintain current meal schedule; light walk after dinner if approved by your doctor.",
        prediction: { suggested_dose_units: null },
      },
    ],
    createdAt,
    updatedAt: createdAt,
  };
}

async function ensureForecastDemoData(patientId, doctorId) {
  const added = { healthEntries: 0, aiSnapshot: 0 };

  if (!(await forecastDemoAlreadyRun(patientId))) {
    added.healthEntries = (await HealthEntry.insertMany(buildForecastHealthEntries(patientId))).length;
  }

  const hasForecastAi = await AiSimulationResult.findOne({
    patient: patientId,
    "inputSummary.seedTag": FORECAST_SEED_TAG,
  }).select("_id");

  if (!hasForecastAi) {
    await AiSimulationResult.create(buildLatestForecastAiResult(patientId, doctorId));
    added.aiSnapshot = 1;
  }

  return added;
}

function buildAiPredictions(patientId, doctorId) {
  const specs = [
    { days: 13, risk: "Normal", reviewStatus: "approved", summary: "Glucose and BP within acceptable ranges.", score: 0.22, dose: null },
    { days: 10, risk: "Elevated", reviewStatus: "pending", summary: "Post-meal glucose spikes detected.", score: 0.58, dose: null },
    {
      days: 7,
      risk: "High",
      reviewStatus: "modified",
      summary: "Sustained elevation after dinner readings.",
      score: 0.81,
      dose: "Consider evening metformin timing adjustment.",
    },
    {
      days: 5,
      risk: "Elevated",
      reviewStatus: "rejected",
      summary: "Irregular meal timing flagged; more data needed.",
      score: 0.55,
      dose: "Suggested dose change rejected pending review.",
    },
    { days: 2, risk: "Normal", reviewStatus: "approved", summary: "BP improved; glucose trending down.", score: 0.28, dose: null },
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
      reviewNotes: reviewed ? `Committee demo review: ${s.reviewStatus}.` : "",
      reviewedBy: reviewed ? doctorId : null,
      reviewedAt: reviewed ? createdAt : null,
      alertsCount: s.risk === "High" ? 2 : s.risk === "Elevated" ? 1 : 0,
      output: [
        {
          module: "glucose_prediction_lstm",
          risk_level: s.risk,
          confidence_score: 1 - s.score * 0.3,
          explanation: { summary: s.summary, top_factors: ["Meal timing", "Glucose trend", "BP variability"] },
          prediction: {
            risk_score: s.score,
            current_glucose: s.risk === "High" ? 172 : s.risk === "Elevated" ? 148 : 110,
            glucose_trend: s.risk === "Normal" ? "Stable" : s.risk === "Elevated" ? "Rising" : "High volatility",
            trend_curve: s.risk === "Normal" ? "Stable" : s.risk === "Elevated" ? "Increasing" : "Increasing",
            predicted_series: DEMO_GLUCOSE_FORECAST_SERIES,
          },
        },
        {
          module: "smart_recommendation_system",
          requires_doctor_approval: s.risk !== "Normal",
          recommendation: s.dose || "Continue monitoring and meal logging.",
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
    { days: 2, type: "glucose_critical", severity: "High", title: "High glucose detected", message: "Glucose 172 mg/dL exceeds target. Review meals and hydration.", status: "open" },
    { days: 4, type: "bp_critical", severity: "High", title: "High blood pressure", message: "BP 140/90 recorded. Rest and recheck if symptoms persist.", status: "open" },
    { days: 7, type: "bp_trend", severity: "Medium", title: "Elevated BP trend", message: "Average systolic above 130 mmHg over 3 readings.", status: "acknowledged" },
    { days: 9, type: "meal_timing", severity: "Medium", title: "Irregular meal timing", message: "Several logs within 2 hours of meals.", status: "open" },
    { days: 12, type: "health_entry", severity: "Low", title: "Health entry logged", message: "Vitals saved successfully. Keep daily tracking.", status: "closed" },
    { days: 14, type: "weekly_summary", severity: "Low", title: "Weekly summary ready", message: "Your 7-day summary is on the dashboard.", status: "closed" },
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
    { days: 12, notes: "Overall health stable. Balanced meals and light daily activity recommended.", diagnosis: "Type 2 diabetes — controlled", lifestyle: "Walk 20 min after dinner." },
    { days: 9, notes: "Elevated glucose 178 mg/dL — avoid sugary drinks; recheck fasting tomorrow.", diagnosis: "Post-prandial hyperglycemia", monitoring: "Log glucose before breakfast and 2h after largest meal." },
    { days: 6, notes: "Take Metformin 500mg with evening meal as prescribed.", diagnosis: "", medicalAdvisory: "Metformin 500mg daily with dinner." },
    { days: 3, notes: "BP improved to 120/78 — excellent progress.", diagnosis: "Hypertension — improving", lifestyle: "Continue low-sodium diet." },
  ];

  return specs.map((s, i) => {
    const createdAt = daysAgo(s.days, 11);
    return {
      doctorId,
      patientId,
      consultationId: consultationIds[i % consultationIds.length] || null,
      notes: `${s.notes} [${SEED_TAG}]`,
      diagnosis: s.diagnosis || "",
      recommendations: { lifestyle: s.lifestyle || "", monitoring: s.monitoring || "", medicalAdvisory: s.medicalAdvisory || "" },
      followUp: { timeframe: "2 weeks", nextVisitDate: daysAgo(-10) },
      status: "submitted",
      createdAt,
      updatedAt: createdAt,
    };
  });
}

function buildConsultations(patientId, doctorId) {
  return [
    {
      patientId,
      doctorId,
      date: daysAgo(-5, 15, 0),
      time: "15:00",
      status: "Pending",
      notes: `Follow-up on glucose trends. [${SEED_TAG}]`,
      consultationType: "Video consultation",
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },
    {
      patientId,
      doctorId,
      date: daysAgo(5, 11, 0),
      time: "11:00",
      status: "Accepted",
      notes: `BP trend review. [${SEED_TAG}]`,
      consultationType: "Video consultation",
      createdAt: daysAgo(8),
      updatedAt: daysAgo(5),
    },
    {
      patientId,
      doctorId,
      date: daysAgo(12, 10, 30),
      time: "10:30",
      status: "Completed",
      notes: `Initial diabetes review completed. [${SEED_TAG}]`,
      consultationType: "Video consultation",
      durationMinutes: 30,
      createdAt: daysAgo(13),
      updatedAt: daysAgo(12),
    },
  ];
}

function buildChatMessages(patientId, doctorId) {
  const thread = [
    { from: "patient", days: 11, text: "Doctor, I started daily logging. Glucose was 155 last night." },
    { from: "doctor", days: 11, text: "Good work. Keep logging for the next two weeks so we can see trends clearly." },
    { from: "patient", days: 7, text: "Fasting glucose 102 today — is that okay?" },
    { from: "doctor", days: 7, text: "Yes, that's acceptable. Continue post-meal logs as well." },
    { from: "patient", days: 4, text: "172 after dinner yesterday — should I worry?" },
    { from: "doctor", days: 4, text: "That's elevated. Note your meal, hydrate, and recheck in the morning." },
    { from: "patient", days: 2, text: "BP 120/78 today. Feeling better!" },
    { from: "doctor", days: 2, text: "Great progress. We'll review everything at your next visit." },
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
    { from: "caregiver", days: 10, text: "Hi Dr. Chen — patient's glucose hit 178 recently. Home monitoring advice?" },
    { from: "doctor", days: 10, text: "Ensure meal logs and Metformin with dinner. Message me if fasting glucose exceeds 140." },
    { from: "caregiver", days: 6, text: "Daily vitals are consistent. BP today 120/78." },
    { from: "doctor", days: 6, text: "Please continue twice-daily BP checks this week. Trend looks good." },
    { from: "caregiver", days: 3, text: "Latest glucose 118. Same meal schedule?" },
    { from: "doctor", days: 3, text: "Yes, keep current timing. I'll review charts at consultation." },
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

  const doctorResult = await upsertAccount({
    ...ACCOUNTS.doctor,
    extra: {
      specialization: ACCOUNTS.doctor.specialization,
      doctorVerificationStatus: "approved",
    },
  });

  const patientResult = await upsertAccount({ ...ACCOUNTS.patient });
  const caregiverResult = await upsertAccount({ ...ACCOUNTS.caregiver });

  const doctor = doctorResult.user;
  const patient = patientResult.user;
  const caregiver = caregiverResult.user;

  await linkAccounts(patient, doctor, caregiver);

  console.log("\n📋 Committee demo accounts (all linked):\n");
  console.log(`   Patient:   ${patient.name}  →  ${ACCOUNTS.patient.email}  ${patientResult.created ? "(created)" : "(updated)"}`);
  console.log(`   Doctor:    ${doctor.name}  →  ${ACCOUNTS.doctor.email}  ${doctorResult.created ? "(created)" : "(updated)"}`);
  console.log(`   Caregiver: ${caregiver.name}  →  ${ACCOUNTS.caregiver.email}  ${caregiverResult.created ? "(created)" : "(updated)"}`);
  console.log(`\n   Password for all three: ${DEMO_PASSWORD}`);

  const summary = { healthEntries: 0, aiPredictions: 0, alerts: 0, doctorFeedback: 0, consultations: 0, chatMessages: 0, caregiverMessages: 0, forecastHealth: 0, forecastAi: 0 };

  if (await seedAlreadyRun(patient._id)) {
    console.log("\n⏭️  Core demo data already present — skipped full insert (accounts still updated/linked).");
    const forecast = await ensureForecastDemoData(patient._id, doctor._id);
    summary.forecastHealth = forecast.healthEntries;
    summary.forecastAi = forecast.aiSnapshot;
    if (forecast.healthEntries || forecast.aiSnapshot) {
      console.log("\n📈 Glucose forecast demo data added:");
      console.log(`   Extra glucose readings: ${forecast.healthEntries}`);
      console.log(`   Forecast AI snapshot:   ${forecast.aiSnapshot ? "yes" : "already present"}`);
    } else {
      console.log("\n📈 Glucose forecast demo data already present.");
    }
    await mongoose.disconnect();
    return;
  }

  summary.healthEntries = (await HealthEntry.insertMany(buildHealthEntries(patient._id))).length;
  summary.aiPredictions = (await AiSimulationResult.insertMany(buildAiPredictions(patient._id, doctor._id))).length;
  summary.alerts = (await Alert.insertMany(buildAlerts(patient._id))).length;

  const consults = await Consultation.insertMany(buildConsultations(patient._id, doctor._id));
  summary.consultations = consults.length;
  const consultIds = consults.map((c) => c._id);

  summary.doctorFeedback = (await DoctorFeedback.insertMany(buildDoctorFeedback(patient._id, doctor._id, consultIds))).length;
  summary.chatMessages = (await ChatMessage.insertMany(buildChatMessages(patient._id, doctor._id))).length;
  summary.caregiverMessages = (
    await CaregiverDoctorMessage.insertMany(buildCaregiverDoctorMessages(caregiver._id, doctor._id, patient._id))
  ).length;

  const forecast = await ensureForecastDemoData(patient._id, doctor._id);
  summary.forecastHealth = forecast.healthEntries;
  summary.forecastAi = forecast.aiSnapshot;

  console.log("\n✅ Demo data inserted (last 15 days):\n");
  console.log(`   Health entries:        ${summary.healthEntries} (2 glucose logs/day)`);
  console.log(`   AI predictions:        ${summary.aiPredictions}`);
  console.log(`   Alerts:                ${summary.alerts}`);
  console.log(`   Doctor feedback:       ${summary.doctorFeedback}`);
  console.log(`   Consultations:         ${summary.consultations}`);
  console.log(`   Doctor–patient chat:   ${summary.chatMessages}`);
  console.log(`   Caregiver–doctor chat: ${summary.caregiverMessages}`);
  if (summary.forecastAi) {
    console.log(`   Forecast AI snapshot:  added (6–24h chart)`);
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});

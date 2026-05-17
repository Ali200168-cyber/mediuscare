require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const HealthEntry = require("../models/HealthEntry");

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.split("=")[1];
};

const AUGMENT_MULTIPLIER = Math.max(0, Number(getArg("augment", "8")));
const MIN_ROWS_TARGET = Math.max(0, Number(getArg("minRows", "20000")));
const OUTPUT_PATH =
  getArg("out", "") ||
  path.resolve(__dirname, "..", "..", "ai-service", "data", "training_data.csv");

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const toNum = (v, fallback = "") => {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const rand = (seed) => {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

const jitter = (value, pct, seed) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const noise = (rand(seed) * 2 - 1) * pct;
  return Number((n * (1 + noise)).toFixed(2));
};

const asCsv = (value) => {
  if (value == null) return "";
  const s = String(value);
  if (!s.includes(",") && !s.includes('"') && !s.includes("\n")) return s;
  return `"${s.replace(/"/g, '""')}"`;
};

const expandMealRecords = (entry) => {
  if (Array.isArray(entry.mealRecords) && entry.mealRecords.length) {
    return entry.mealRecords.join(" | ");
  }
  return entry.notes || "";
};

const expandMedications = (entry) => {
  if (Array.isArray(entry.medicationHistory) && entry.medicationHistory.length) {
    return entry.medicationHistory.join(" | ");
  }
  return "";
};

const makeRow = (entry, isSynthetic, seed) => {
  const glucose =
    toNum(entry.glucose, "") !== ""
      ? toNum(entry.glucose, "")
      : toNum(entry.randomGlucose, "") !== ""
        ? toNum(entry.randomGlucose, "")
        : toNum(entry.postMealGlucose, "") !== ""
          ? toNum(entry.postMealGlucose, "")
          : toNum(entry.fastingGlucose, "");

  const base = {
    patientId: String(entry.patient),
    timestamp: new Date(entry.createdAt).toISOString(),
    glucose: toNum(glucose, ""),
    fastingGlucose: toNum(entry.fastingGlucose, ""),
    randomGlucose: toNum(entry.randomGlucose, ""),
    postMealGlucose: toNum(entry.postMealGlucose, ""),
    systolic: toNum(entry.systolic, ""),
    diastolic: toNum(entry.diastolic, ""),
    weight: toNum(entry.weight, ""),
    age: toNum(entry.age, ""),
    mealHoursAgo: toNum(entry.mealHoursAgo, ""),
    mealRecords: expandMealRecords(entry),
    medicationHistory: expandMedications(entry),
    synthetic: isSynthetic ? "1" : "0",
  };

  if (!isSynthetic) return base;

  return {
    ...base,
    glucose: jitter(base.glucose, 0.07, seed + 1),
    fastingGlucose: jitter(base.fastingGlucose, 0.06, seed + 2),
    randomGlucose: jitter(base.randomGlucose, 0.08, seed + 3),
    postMealGlucose: jitter(base.postMealGlucose, 0.08, seed + 4),
    systolic: clamp(jitter(base.systolic, 0.04, seed + 5), 85, 230),
    diastolic: clamp(jitter(base.diastolic, 0.05, seed + 6), 50, 140),
    weight: clamp(jitter(base.weight, 0.03, seed + 8), 25, 260),
    mealHoursAgo: clamp(jitter(base.mealHoursAgo, 0.2, seed + 9), 0, 14),
    timestamp: new Date(new Date(base.timestamp).getTime() + Math.round((rand(seed + 10) * 6 - 3) * 3600000)).toISOString(),
  };
};

async function connectMongo() {
  const primaryUri = process.env.MONGO_URI;
  if (!primaryUri) {
    throw new Error("Missing MONGO_URI in environment.");
  }
  await mongoose.connect(primaryUri, { dbName: "Medius" });
}

async function run() {
  await connectMongo();
  const entries = await HealthEntry.find({}).sort({ createdAt: 1 }).lean();
  if (!entries.length) {
    throw new Error("No health entries found in database.");
  }

  const rows = [];
  entries.forEach((entry, idx) => {
    rows.push(makeRow(entry, false, idx + 17));
    for (let i = 0; i < AUGMENT_MULTIPLIER; i += 1) {
      rows.push(makeRow(entry, true, idx * 100 + i + 31));
    }
  });

  // If still small, keep augmenting cyclically until minRows target.
  let cursor = 0;
  while (rows.length < MIN_ROWS_TARGET && entries.length) {
    const entry = entries[cursor % entries.length];
    rows.push(makeRow(entry, true, 700000 + cursor));
    cursor += 1;
  }

  const headers = [
    "patientId",
    "timestamp",
    "glucose",
    "fastingGlucose",
    "randomGlucose",
    "postMealGlucose",
    "systolic",
    "diastolic",
    "weight",
    "age",
    "mealHoursAgo",
    "mealRecords",
    "medicationHistory",
    "synthetic",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => asCsv(row[h])).join(","));
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");
  await mongoose.disconnect();

  const realCount = rows.filter((r) => r.synthetic === "0").length;
  const synthCount = rows.length - realCount;
  console.log(`Exported ${rows.length} rows -> ${OUTPUT_PATH}`);
  console.log(`Real rows: ${realCount}`);
  console.log(`Synthetic rows: ${synthCount}`);
  console.log(`augment=${AUGMENT_MULTIPLIER}, minRows=${MIN_ROWS_TARGET}`);
}

run().catch(async (err) => {
  console.error("Export failed:", err.message);
  try {
    await mongoose.disconnect();
  } catch (_e) {}
  process.exit(1);
});

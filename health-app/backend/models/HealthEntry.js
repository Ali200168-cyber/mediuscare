const mongoose = require("mongoose");

const healthEntrySchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  height: Number,
  weight: Number,
  gender: { type: String, enum: ["male", "female"] },
  glucose: Number,
  fastingGlucose: Number,
  randomGlucose: Number,
  postMealGlucose: Number,
  systolic: Number,
  diastolic: Number,
  symptoms: [String],
  mealRecords: [{ type: String }],
  medicationHistory: [{ type: String }],
  mealHoursAgo: Number,
  age: Number,
  notes: String,
}, { timestamps: true });

module.exports = mongoose.model("HealthEntry", healthEntrySchema);

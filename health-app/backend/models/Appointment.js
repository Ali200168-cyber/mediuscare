const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  reason: { type: String },
  consultationType: { type: String, default: "Consultation" },
  status: { type: String, enum: ["pending", "approved", "rescheduled", "cancelled"], default: "pending" },
  meetingProvider: { type: String, enum: ["zego", "other"], default: "zego" },
  meetingLink: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Appointment", appointmentSchema);

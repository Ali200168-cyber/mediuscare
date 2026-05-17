const mongoose = require("mongoose");

const consultationSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    status: {
      type: String,
      enum: ["Pending", "Accepted", "Rejected", "Completed"],
      default: "Pending",
      index: true,
    },
    zegoLink: { type: String, default: "" },
    zegoRoomId: { type: String, default: "" },
    zegoToken: { type: String, default: "" },
    meetingProvider: { type: String, enum: ["zego", "fallback"], default: "fallback", index: true },
    notes: { type: String, default: "" },
    consultationType: { type: String, default: "Video consultation" },
    doctorReviewStatus: {
      type: String,
      enum: ["not_requested", "requested", "approved"],
      default: "not_requested",
    },
    durationMinutes: { type: Number, default: 30 },
  },
  { timestamps: true },
);

consultationSchema.index({ doctorId: 1, date: 1, time: 1 });
consultationSchema.index({ patientId: 1, date: 1, time: 1 });

module.exports = mongoose.model("Consultation", consultationSchema);

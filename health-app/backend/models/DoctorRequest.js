const mongoose = require("mongoose");

const doctorRequestSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    message: { type: String, default: "", trim: true },
    status: { type: String, enum: ["pending", "accepted", "declined"], default: "pending", index: true },
    decisionNotes: { type: String, default: "", trim: true },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

doctorRequestSchema.index({ patientId: 1, doctorId: 1, status: 1 });

module.exports = mongoose.model("DoctorRequest", doctorRequestSchema);

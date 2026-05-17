const mongoose = require("mongoose");

const emergencyEscalationSchema = new mongoose.Schema(
  {
    caregiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    notes: { type: String, default: "", trim: true },
    confirmationCode: { type: String, required: true, unique: true },
    status: { type: String, enum: ["open", "resolved"], default: "open" },
    doctorNotifiedAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("EmergencyEscalation", emergencyEscalationSchema);

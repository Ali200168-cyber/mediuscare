const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true },
    severity: { type: String, enum: ["Low", "Medium", "High"], required: true },
    message: { type: String, required: true },
    channel: [{ type: String, enum: ["in_app", "sms", "email"] }],
    status: { type: String, enum: ["open", "acknowledged", "closed"], default: "open" },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    acknowledgedAt: { type: Date },
    metadata: { type: Object, default: {} },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Alert", alertSchema);

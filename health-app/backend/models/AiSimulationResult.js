const mongoose = require("mongoose");

const aiSimulationResultSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    source: { type: String, enum: ["manual_payload", "health_entries"], default: "health_entries" },
    inputSummary: { type: Object, default: {} },
    safetyStatus: { type: String, enum: ["validated", "blocked"], required: true },
    success: { type: Boolean, required: true },
    reason: { type: String, default: "" },
    performance: { type: Object, default: {} },
    output: { type: [Object], default: [] },
    alertsCount: { type: Number, default: 0 },
    reviewStatus: {
      type: String,
      enum: ["not_required", "pending", "approved", "rejected", "modified"],
      default: "not_required",
      index: true,
    },
    reviewNotes: { type: String, default: "" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AiSimulationResult", aiSimulationResultSchema);

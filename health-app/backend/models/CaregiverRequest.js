const mongoose = require("mongoose");

const caregiverRequestSchema = new mongoose.Schema(
  {
    caregiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
      index: true,
    },
    message: { type: String, default: "", trim: true, maxlength: 500 },
    decisionAt: { type: Date, default: null },
  },
  { timestamps: true },
);

caregiverRequestSchema.index({ caregiverId: 1, patientId: 1, createdAt: -1 });

module.exports = mongoose.model("CaregiverRequest", caregiverRequestSchema);


const mongoose = require("mongoose");

const medicationAdminLogSchema = new mongoose.Schema(
  {
    caregiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    medicationName: { type: String, required: true, trim: true },
    administeredAt: { type: Date, required: true },
    notes: { type: String, default: "", trim: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("MedicationAdminLog", medicationAdminLogSchema);

const mongoose = require("mongoose");

const doctorFeedbackSchema = new mongoose.Schema(
  {
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    consultationId: { type: mongoose.Schema.Types.ObjectId, ref: "Consultation", default: null, index: true },
    notes: { type: String, required: true, trim: true, maxlength: 5000 },
    diagnosis: { type: String, default: "", trim: true, maxlength: 500 },
    recommendations: {
      lifestyle: { type: String, default: "", trim: true, maxlength: 2000 },
      monitoring: { type: String, default: "", trim: true, maxlength: 2000 },
      medicalAdvisory: { type: String, default: "", trim: true, maxlength: 2000 },
    },
    followUp: {
      timeframe: { type: String, default: "", trim: true, maxlength: 200 },
      nextVisitDate: { type: Date, default: null },
    },
    status: { type: String, enum: ["draft", "submitted"], default: "submitted", index: true },
  },
  { timestamps: true },
);

doctorFeedbackSchema.index({ doctorId: 1, patientId: 1, createdAt: -1 });

module.exports = mongoose.model("DoctorFeedback", doctorFeedbackSchema);


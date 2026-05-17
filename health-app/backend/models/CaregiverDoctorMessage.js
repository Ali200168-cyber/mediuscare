const mongoose = require("mongoose");

const caregiverDoctorMessageSchema = new mongoose.Schema(
  {
    caregiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

caregiverDoctorMessageSchema.index({ caregiverId: 1, doctorId: 1, createdAt: 1 });

module.exports = mongoose.model("CaregiverDoctorMessage", caregiverDoctorMessageSchema);

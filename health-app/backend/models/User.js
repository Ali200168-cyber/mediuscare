const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, sparse: true, unique: true },
    cnic: { type: String, trim: true, sparse: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["doctor", "patient", "caregiver", "admin"], required: true },
    specialization: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    doctorVerificationStatus: {
      type: String,
      enum: ["not_required", "pending", "approved", "rejected"],
      default: "not_required",
      index: true,
    },
    doctorProofFilePath: { type: String, default: "" },
    doctorProofOriginalName: { type: String, default: "" },
    doctorVerificationReviewedAt: { type: Date, default: null },
    doctorVerificationReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    doctorVerificationNote: { type: String, default: "" },
    assignedDoctor: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    linkedCaregiverIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    caregiverPreferences: {
      emailCritical: { type: Boolean, default: true },
      emailAI: { type: Boolean, default: true },
      pushNotif: { type: Boolean, default: false },
    },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ role: 1 });

module.exports = mongoose.model("User", userSchema);

const mongoose = require("mongoose");

const doctorNoteSchema = new mongoose.Schema(
  {
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

doctorNoteSchema.index({ doctorId: 1, patientId: 1, createdAt: -1 });

module.exports = mongoose.model("DoctorNote", doctorNoteSchema);


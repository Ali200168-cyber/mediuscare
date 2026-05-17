const mongoose = require("mongoose");

const reportAttachmentSchema = new mongoose.Schema(
  {
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    originalName: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, default: "" },
    size: { type: Number, default: 0 },
    category: {
      type: String,
      enum: ["lab", "imaging", "prescription", "other"],
      default: "other",
    },
    filePath: { type: String, required: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("ReportAttachment", reportAttachmentSchema);

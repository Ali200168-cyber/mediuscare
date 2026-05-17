const router = require("express").Router();
const Appointment = require("../models/Appointment");
const auth = require("../middleware/roleAuth");
const User = require("../models/User");

const generateZegoLink = () => {
  const id = Math.floor(100000000 + Math.random() * 900000000);
  const base = process.env.ZEGO_MEETING_BASE_URL || "https://zegocloud.com";
  return `${base}?roomID=${id}`;
};

// Get all appointments for logged-in doctor
router.get("/", auth(["doctor"]), async (req, res) => {
  try {
    const appointments = await Appointment.find({ doctor: req.user._id })
      .populate("patient", "name email")
      .sort({ date: 1, time: 1 });

    res.json({ success: true, appointments });
  } catch (err) {
    console.error("Fetch doctor appointments error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch appointments" });
  }
});

// Update appointment status (confirm, reschedule, cancel)
router.post("/:id/status", auth(["doctor"]), async (req, res) => {
  try {
    const { status, newDate, newTime } = req.body;
    if (!["approved", "rescheduled", "cancelled"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    if (appointment.doctor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    if ((status === "approved" || status === "rescheduled") && (newDate || newTime)) {
      if (newDate) appointment.date = new Date(newDate);
      if (newTime) appointment.time = String(newTime);
    }

    appointment.status = status;
    if ((status === "approved" || status === "rescheduled") && !appointment.meetingLink) {
      appointment.meetingProvider = "zego";
      appointment.meetingLink = generateZegoLink();
    }
    await appointment.save();

    if (status === "approved") {
      await User.updateOne(
        { _id: appointment.patient, assignedDoctor: { $exists: false } },
        { $set: { assignedDoctor: req.user._id } },
      );
      await User.updateOne({ _id: appointment.patient, assignedDoctor: null }, { $set: { assignedDoctor: req.user._id } });
    }

    res.json({ success: true, appointment });
  } catch (err) {
    console.error("Update appointment status error:", err);
    res.status(500).json({ success: false, message: "Server error while updating status" });
  }
});

module.exports = router;

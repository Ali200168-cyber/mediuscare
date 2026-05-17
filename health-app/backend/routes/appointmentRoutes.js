const express = require("express");
const router = express.Router();
const roleAuth = require("../middleware/roleAuth");
const Appointment = require("../models/Appointment");
const User = require("../models/User");
const { createRoom, hasZegoConfig } = require("../services/zegoService");

// Book appointment (patient)
router.post("/book", roleAuth(["patient"]), async (req, res) => {
  try {
    const { doctorId, date, time, reason, consultationType } = req.body;
    if (!doctorId || !date || !time || !reason) return res.status(400).json({ success: false, message: "All fields required" });

    const doctor = await User.findById(doctorId);
    if (!doctor || doctor.role !== "doctor") return res.status(404).json({ success: false, message: "Doctor not found" });

    const patient = await User.findById(req.user._id).select("name email");
    const appointment = await Appointment.create({
      patient: req.user._id,
      doctor: doctorId,
      date,
      time,
      reason,
      consultationType: consultationType ? String(consultationType).trim() : "Consultation",
      status: "pending",
    });

    let meetingLink = "";
    if (hasZegoConfig()) {
      const roomRes = await createRoom({ consultationId: appointment._id });
      if (roomRes.ok && roomRes.data?.url) {
        meetingLink = roomRes.data.url;
      }
    }
    if (!meetingLink) {
      const base = process.env.ZEGO_MEETING_BASE_URL || "https://zegocloud.com";
      const separator = base.includes("?") ? "&" : "?";
      meetingLink = `${base}${separator}roomID=appt-${appointment._id}`;
    }
    appointment.meetingProvider = "zego";
    appointment.meetingLink = meetingLink;
    await appointment.save();

    res.json({ success: true, appointment });
  } catch (err) {
    console.error("Booking error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get patient’s appointments
router.get("/my", roleAuth(["patient"]), async (req, res) => {
  try {
    const appointments = await Appointment.find({ patient: req.user._id }).populate("doctor", "name email specialization");
    res.json({ success: true, appointments });
  } catch (err) {
    console.error("Fetch my appointments error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;

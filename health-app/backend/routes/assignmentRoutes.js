const express = require("express");
const User = require("../models/User");
const { verifyToken, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.get("/patient/assigned-doctor", verifyToken, allowRoles("patient"), async (req, res) => {
  const patient = await User.findById(req.user._id).populate("assignedDoctor", "name email specialization");
  return res.json({ success: true, doctor: patient?.assignedDoctor || null });
});

router.get("/doctor/assigned-patients", verifyToken, allowRoles("doctor"), async (req, res) => {
  const patients = await User.find({ role: "patient", assignedDoctor: req.user._id })
    .select("name email phone isActive assignedDoctor")
    .sort({ createdAt: -1 });
  return res.json({ success: true, patients });
});

module.exports = router;

const express = require("express");
const router = express.Router();
const roleAuth = require("../middleware/roleAuth");
const User = require("../models/User");


router.get("/", roleAuth(["patient"]), async (req, res) => {
  try {
    const doctors = await User.find({ role: "doctor" }, "name email specialization");
    res.json({ success: true, doctors });
  } catch (err) {
    console.error("Doctor list error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;

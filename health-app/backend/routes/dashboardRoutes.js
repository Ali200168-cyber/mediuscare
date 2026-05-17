const express = require("express");
const router = express.Router();
const HealthEntry = require("../models/HealthEntry");
const auth = require("../middleware/roleAuth");


router.post("/", auth(["patient"]), async (req, res) => {
  try {
    console.log("Dashboard: Adding health entry for user:", req.user._id, req.body);

    const entry = await HealthEntry.create({
      user: req.user._id, 
      age: req.body.age,
      weight: req.body.weight,
      glucose: req.body.glucose,
      systolic: req.body.systolic,
      diastolic: req.body.diastolic,
      mealDetails: req.body.mealDetails,
      mealHoursAgo: req.body.mealHoursAgo,
      symptoms: req.body.symptoms || [],
    });

    res.json({ success: true, entry });
  } catch (err) {
    console.error("Dashboard Health POST Error:", err);
    res.status(500).json({ success: false, message: "Server error saving entry." });
  }
});


router.get("/latest", auth(["patient"]), async (req, res) => {
  try {
    const entry = await HealthEntry.findOne({ user: req.user._id })
      .sort({ createdAt: -1 });

    res.json({ success: true, entry });
  } catch (err) {
    console.error("Dashboard Health Latest Error:", err);
    res.status(500).json({ success: false, message: "Server error fetching latest entry." });
  }
});


router.get("/recent", auth(["patient"]), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;

    const entries = await HealthEntry.find({ user: req.user._id }) 
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({ success: true, entries });
  } catch (err) {
    console.error("Dashboard Health Recent Error:", err);
    res.status(500).json({ success: false, message: "Server error fetching recent entries." });
  }
});

module.exports = router;

const router = require("express").Router();
const roleAuth = require("../middleware/roleAuth");
const Consultation = require("../models/Consultation");
const Alert = require("../models/Alert");
const { hasZegoConfig, createRoom, getRoom, createUserToken } = require("../services/zegoService");

router.get("/status", roleAuth(["doctor", "admin"]), async (req, res) => {
  return res.json({
    success: true,
    zegoConfigured: hasZegoConfig(),
  });
});

router.get("/validate/:consultationId", roleAuth(["doctor", "admin"]), async (req, res) => {
  try {
    const item = await Consultation.findById(req.params.consultationId);
    if (!item) return res.status(404).json({ success: false, message: "Consultation not found" });
    if (req.user.role === "doctor" && String(item.doctorId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Only assigned doctor can validate room" });
    }
    if (!item.zegoRoomId) {
      return res.json({ success: true, valid: false, reason: "No zegoRoomId saved", provider: item.meetingProvider || "unknown" });
    }
    if (item.meetingProvider !== "zego") {
      return res.json({ success: true, valid: false, reason: "Meeting provider is not zego", provider: item.meetingProvider || "unknown" });
    }
    const check = await getRoom({ roomId: item.zegoRoomId });
    if (!check.ok) {
      return res.json({
        success: true,
        valid: false,
        reason: check.message || "ZEGO room not found",
        status: check.status,
        provider: "zego",
      });
    }
    return res.json({
      success: true,
      valid: true,
      provider: "zego",
      room: {
        roomId: check.data?.roomId,
        url: check.data?.url,
      },
    });
  } catch (error) {
    console.error("Validate ZEGO room error:", error);
    return res.status(500).json({ success: false, message: "Failed to validate ZEGO room" });
  }
});

router.post("/create-room", roleAuth(["doctor"]), async (req, res) => {
  try {
    const { consultationId, date, time, duration } = req.body || {};
    if (!consultationId || !date || !time) {
      return res.status(400).json({ success: false, message: "consultationId, date, and time are required" });
    }

    const item = await Consultation.findById(consultationId);
    if (!item) return res.status(404).json({ success: false, message: "Consultation not found" });
    if (String(item.doctorId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Only assigned doctor can create room" });
    }
    if (item.status !== "Accepted") {
      return res.status(400).json({ success: false, message: "Consultation must be accepted before creating room" });
    }

    const roomRes = await createRoom({ consultationId: item._id });
    if (!roomRes.ok) {
      return res.status(roomRes.status || 502).json({ success: false, message: roomRes.message || "Failed to create ZEGO room" });
    }

    const room = roomRes.data || {};
    if (!room.roomId || !room.url) {
      return res.status(502).json({
        success: false,
        message: "ZEGO room creation returned an invalid response (missing roomId/url).",
      });
    }

    item.zegoRoomId = room.roomId;
    item.zegoLink = room.url;
    item.zegoToken = "";
    item.durationMinutes = Number(duration || item.durationMinutes || 30);
    item.meetingProvider = "zego";
    await item.save();

    await Alert.create({
      patientId: item.patientId,
      type: "consultation_meeting",
      severity: "Medium",
      message: `Your doctor created a ZEGOCLOUD video room for ${new Date(item.date).toLocaleDateString()} at ${item.time}.`,
      channel: ["in_app"],
      status: "open",
      metadata: {
        consultationId: String(item._id),
        roomId: room.roomId,
        joinUrl: room.url,
      },
    });

    return res.json({
      success: true,
      roomId: room.roomId,
      join_url: room.url,
      item,
    });
  } catch (error) {
    console.error("Create ZEGO room error:", error);
    return res.status(500).json({ success: false, message: "Failed to create ZEGO room" });
  }
});

router.post("/session/:consultationId", roleAuth(["doctor", "patient", "admin"]), async (req, res) => {
  try {
    if (!hasZegoConfig()) {
      return res.status(412).json({ success: false, message: "ZEGOCLOUD is not configured" });
    }
    const item = await Consultation.findById(req.params.consultationId);
    if (!item) return res.status(404).json({ success: false, message: "Consultation not found" });
    const isAllowed =
      req.user.role === "admin" ||
      (req.user.role === "doctor" && String(item.doctorId) === String(req.user._id)) ||
      (req.user.role === "patient" && String(item.patientId) === String(req.user._id));
    if (!isAllowed) return res.status(403).json({ success: false, message: "Access denied" });
    if (item.status !== "Accepted") {
      return res.status(400).json({ success: false, message: "Call is only available for accepted consultations" });
    }
    if (!item.zegoRoomId) {
      return res.status(400).json({ success: false, message: "Room not created yet by doctor" });
    }

    const userId = String(req.user._id);
    const tokenRes = createUserToken({ roomId: item.zegoRoomId, userId });
    if (!tokenRes.ok) {
      return res.status(tokenRes.status || 500).json({ success: false, message: tokenRes.message || "Failed to create ZEGO token" });
    }

    return res.json({
      success: true,
      session: {
        appId: tokenRes.data.appId,
        token: tokenRes.data.token,
        roomId: item.zegoRoomId,
        userId,
        userName: req.user.name || req.user.email || `${req.user.role}-${userId.slice(-4)}`,
        role: req.user.role,
      },
    });
  } catch (error) {
    console.error("Create ZEGO session error:", error);
    return res.status(500).json({ success: false, message: "Failed to create ZEGO session" });
  }
});

module.exports = router;

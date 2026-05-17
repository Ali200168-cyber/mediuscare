const express = require("express");
const ChatMessage = require("../models/ChatMessage");
const { verifyToken, allowRoles } = require("../middleware/auth");
const { resolveChatPair, getChatContacts } = require("../services/chatAccess");

const router = express.Router();

router.get("/chat/contacts", verifyToken, allowRoles("patient", "doctor"), async (req, res) => {
  const contacts = await getChatContacts(req.user);
  return res.json({ success: true, contacts });
});

router.get("/chat/messages/:contactId", verifyToken, allowRoles("patient", "doctor"), async (req, res) => {
  const pair = await resolveChatPair(req.user, req.params.contactId);
  if (!pair) return res.status(403).json({ success: false, message: "You can chat only with your linked doctor/patient." });

  const messages = await ChatMessage.find({ patientId: pair.patientId, doctorId: pair.doctorId })
    .sort({ createdAt: 1 })
    .limit(500);

  return res.json({ success: true, messages, conversation: pair });
});

router.post("/chat/messages/:contactId", verifyToken, allowRoles("patient", "doctor"), async (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ success: false, message: "Message text is required." });
  if (text.length > 2000) return res.status(400).json({ success: false, message: "Message is too long." });

  const pair = await resolveChatPair(req.user, req.params.contactId);
  if (!pair) return res.status(403).json({ success: false, message: "You can chat only with your linked doctor/patient." });

  const message = await ChatMessage.create({
    patientId: pair.patientId,
    doctorId: pair.doctorId,
    senderId: req.user._id,
    receiverId: req.params.contactId,
    text,
  });

  return res.status(201).json({ success: true, message });
});

module.exports = router;

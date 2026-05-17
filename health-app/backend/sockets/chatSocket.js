const jwt = require("jsonwebtoken");
const User = require("../models/User");
const ChatMessage = require("../models/ChatMessage");
const { resolveChatPair } = require("../services/chatAccess");

const connectedUsers = new Map();

function registerConnection(userId, socketId) {
  const key = String(userId);
  const current = connectedUsers.get(key) || new Set();
  current.add(socketId);
  connectedUsers.set(key, current);
}

function unregisterConnection(userId, socketId) {
  const key = String(userId);
  const current = connectedUsers.get(key);
  if (!current) return;
  current.delete(socketId);
  if (!current.size) connectedUsers.delete(key);
}

function emitToUser(io, userId, eventName, payload) {
  const sockets = connectedUsers.get(String(userId));
  if (!sockets) return;
  sockets.forEach((sid) => io.to(sid).emit(eventName, payload));
}

function setupChatSocket(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Unauthorized"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded._id).select("_id role isActive");
      if (!user || !user.isActive) return next(new Error("Unauthorized"));

      socket.user = user;
      registerConnection(user._id, socket.id);
      return next();
    } catch (err) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.on("chat:send", async (payload = {}, ack = () => {}) => {
      try {
        const contactId = String(payload.contactId || "");
        const text = String(payload.text || "").trim();
        if (!contactId || !text) return ack({ success: false, message: "contactId and text are required." });
        if (text.length > 2000) return ack({ success: false, message: "Message is too long." });

        const pair = await resolveChatPair(socket.user, contactId);
        if (!pair) {
          return ack({ success: false, message: "You can chat only with your linked doctor/patient." });
        }

        const message = await ChatMessage.create({
          patientId: pair.patientId,
          doctorId: pair.doctorId,
          senderId: socket.user._id,
          receiverId: contactId,
          text,
        });

        const eventPayload = { success: true, message };
        emitToUser(io, socket.user._id, "chat:new", eventPayload);
        emitToUser(io, contactId, "chat:new", eventPayload);

        return ack({ success: true, message });
      } catch (err) {
        return ack({ success: false, message: "Failed to send message." });
      }
    });

    socket.on("disconnect", () => {
      if (socket.user?._id) unregisterConnection(socket.user._id, socket.id);
    });
  });
}

module.exports = { setupChatSocket };

const { generateToken04 } = require("./zegoTokenService");

const hasZegoConfig = () => Boolean(process.env.ZEGO_APP_ID && process.env.ZEGO_SERVER_SECRET);

const buildRoomId = (consultationId) => {
  const safeId = String(consultationId).replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
  return `consult-${safeId}-${Date.now()}`.slice(0, 80);
};

const buildJoinUrl = (roomId) => {
  const base = process.env.ZEGO_MEETING_BASE_URL || "https://zegocloud.com";
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}roomID=${encodeURIComponent(roomId)}`;
};

const createRoom = async ({ consultationId }) => {
  if (!hasZegoConfig()) {
    return { ok: false, status: 412, message: "ZEGOCLOUD is not configured" };
  }
  const roomId = buildRoomId(consultationId);
  return {
    ok: true,
    status: 200,
    data: {
      roomId,
      url: buildJoinUrl(roomId),
    },
  };
};

const updateRoom = async ({ roomId }) => {
  if (!roomId) return { ok: false, status: 400, message: "roomId is required" };
  return { ok: true, status: 200, data: { roomId, url: buildJoinUrl(roomId) } };
};

const deleteRoom = async ({ roomId }) => {
  if (!roomId) return { ok: false, status: 400, message: "roomId is required" };
  return { ok: true, status: 204, data: null };
};

const getRoom = async ({ roomId }) => {
  if (!roomId) return { ok: false, status: 400, message: "roomId is required" };
  return { ok: true, status: 200, data: { roomId, url: buildJoinUrl(roomId) } };
};

const createUserToken = ({ roomId, userId }) => {
  if (!hasZegoConfig()) {
    return { ok: false, status: 412, message: "ZEGOCLOUD is not configured" };
  }
  const appId = Number(process.env.ZEGO_APP_ID);
  const secret = String(process.env.ZEGO_SERVER_SECRET || "");
  if (!appId || !secret) {
    return { ok: false, status: 412, message: "ZEGO_APP_ID or ZEGO_SERVER_SECRET missing" };
  }
  const ttlSec = Number(process.env.ZEGO_TOKEN_TTL_SEC || 3600);
  const payload = JSON.stringify({
    room_id: String(roomId),
    privilege: { 1: 1, 2: 1 },
    stream_id_list: null,
  });
  const token = generateToken04(appId, String(userId), secret, ttlSec, payload);
  return {
    ok: true,
    status: 200,
    data: {
      token,
      appId,
      expiresIn: ttlSec,
    },
  };
};

module.exports = {
  hasZegoConfig,
  createRoom,
  updateRoom,
  deleteRoom,
  getRoom,
  createUserToken,
};

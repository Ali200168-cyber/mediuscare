const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");

const router = express.Router();
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const FIXED_ADMIN_EMAIL = (process.env.FIXED_ADMIN_EMAIL || "admin@medius.local").toLowerCase();
const FIXED_ADMIN_PASSWORD = process.env.FIXED_ADMIN_PASSWORD || "Admin@12345";
const FIXED_ADMIN_NAME = process.env.FIXED_ADMIN_NAME || "System Admin";

const getAttemptKey = (email, phone, ip) => `${(email || phone || "").toLowerCase()}::${ip || "unknown"}`;
const isBlocked = (key) => {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
};
const recordFailure = (key) => {
  const existing = loginAttempts.get(key);
  if (!existing || Date.now() > existing.expiresAt) {
    loginAttempts.set(key, { count: 1, expiresAt: Date.now() + WINDOW_MS });
    return;
  }
  loginAttempts.set(key, { ...existing, count: existing.count + 1 });
};
const clearFailures = (key) => loginAttempts.delete(key);
const hashToken = (value) => crypto.createHash("sha256").update(value).digest("hex");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads", "doctor-proofs");
const buildAccessToken = (user) =>
  jwt.sign({ _id: user._id, role: user.role, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1d" });
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const doctorProofStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `doctor-proof-${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

const doctorProofUpload = multer({
  storage: doctorProofStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    const isAllowed =
      mime === "application/pdf" ||
      mime.startsWith("image/") ||
      mime === "application/msword" ||
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    cb(isAllowed ? null : new Error("Only PDF, image, or Word files are allowed."), isAllowed);
  },
});
const ensureFixedAdminAccount = async () => {
  const adminEmail = FIXED_ADMIN_EMAIL;
  const existingAdmin = await User.findOne({ email: adminEmail });
  const hashed = await bcrypt.hash(FIXED_ADMIN_PASSWORD, 10);

  if (!existingAdmin) {
    return User.create({
      name: FIXED_ADMIN_NAME,
      email: adminEmail,
      password: hashed,
      role: "admin",
      isActive: true,
    });
  }

  existingAdmin.name = FIXED_ADMIN_NAME;
  existingAdmin.role = "admin";
  existingAdmin.isActive = true;
  existingAdmin.password = hashed;
  await existingAdmin.save();
  return existingAdmin;
};
const issueRefreshToken = async (userId) => {
  const raw = crypto.randomBytes(32).toString("hex");
  await RefreshToken.create({
    userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  return raw;
};

// Signup
router.post("/signup", doctorProofUpload.single("doctorProof"), async (req, res) => {
  try {
    const { name, email, phone, cnic, password, role, specialization } = req.body;
    if (!name || !email || !password || !role)
      return res.status(400).json({ success: false, message: "All fields required" });

    const allowedRoles = ["patient", "doctor", "caregiver"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid role selected" });
    }

    const normalizedEmail = normalizeEmail(email);
    const exists = await User.findOne({
      $or: [{ email: normalizedEmail }, ...(phone ? [{ phone }] : []), ...(cnic ? [{ cnic }] : [])],
    });
    if (exists) return res.status(400).json({ success: false, message: "User already registered" });

    const hashed = await bcrypt.hash(password, 10);
    const isDoctor = role === "doctor";
    if (isDoctor && !req.file) {
      return res.status(400).json({ success: false, message: "Doctor proof document is required." });
    }

    const user = await User.create({
      name,
      email: normalizedEmail,
      phone,
      cnic,
      password: hashed,
      role,
      specialization: role === "doctor" ? specialization : undefined,
      isActive: isDoctor ? false : true,
      doctorVerificationStatus: isDoctor ? "pending" : "not_required",
      doctorProofFilePath: isDoctor ? `/uploads/doctor-proofs/${req.file.filename}` : "",
      doctorProofOriginalName: isDoctor ? req.file.originalname || "" : "",
    });
    if (isDoctor) {
      return res.json({
        success: true,
        pendingApproval: true,
        message: "Doctor signup submitted. Your account will be activated after admin approval.",
      });
    }

    const token = buildAccessToken(user);
    const refreshToken = await issueRefreshToken(user._id);

    const userResponse = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      cnic: user.cnic,
      role: user.role,
      isActive: user.isActive,
    };
    res.json({ success: true, token, refreshToken, user: userResponse, message: "Signup successful" });
  } catch (err) {
    console.error("Signup error:", err);
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: err.message || "Doctor proof upload failed." });
    }
    if (err?.name === "ValidationError") {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (String(err?.message || "").includes("Only PDF, image, or Word files are allowed")) {
      return res.status(400).json({ success: false, message: err.message });
    }
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, phone, password } = req.body;
    if ((!email && !phone) || !password) {
      return res.status(400).json({ success: false, message: "Email/phone and password are required" });
    }
    const attemptKey = getAttemptKey(email, phone, req.ip);
    if (isBlocked(attemptKey)) {
      return res.status(429).json({
        success: false,
        message: "Too many failed attempts. Please try again in 15 minutes.",
      });
    }

    const normalizedEmail = normalizeEmail(email);
    const isFixedAdminLogin = normalizedEmail === FIXED_ADMIN_EMAIL;

    let user = null;
    if (isFixedAdminLogin) {
      if (password !== FIXED_ADMIN_PASSWORD) {
        recordFailure(attemptKey);
        return res.status(400).json({ success: false, message: "Invalid password" });
      }
      user = await ensureFixedAdminAccount();
    } else {
      user = await User.findOne(email ? { email: normalizedEmail } : { phone });
    }
    if (!user) {
      recordFailure(attemptKey);
      return res.status(404).json({ success: false, message: "User not found" });
    }
    if (user.role === "doctor" && user.doctorVerificationStatus === "pending") {
      recordFailure(attemptKey);
      return res.status(403).json({
        success: false,
        message: "Doctor account pending admin approval.",
      });
    }
    if (user.role === "doctor" && user.doctorVerificationStatus === "rejected") {
      recordFailure(attemptKey);
      return res.status(403).json({
        success: false,
        message: "Doctor verification was rejected. Contact admin support.",
      });
    }
    if (!user.isActive) {
      recordFailure(attemptKey);
      return res.status(403).json({ success: false, message: "User is deactivated" });
    }

    if (!isFixedAdminLogin) {
      // Only the fixed admin credentials can login as admin.
      if (user.role === "admin") {
        recordFailure(attemptKey);
        return res.status(403).json({ success: false, message: "Admin login is restricted" });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        recordFailure(attemptKey);
        return res.status(400).json({ success: false, message: "Invalid password" });
      }
    }
    clearFailures(attemptKey);

    const token = buildAccessToken(user);
    const refreshToken = await issueRefreshToken(user._id);

    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ success: false, message: "refreshToken is required" });

    const saved = await RefreshToken.findOne({
      tokenHash: hashToken(refreshToken),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!saved) return res.status(401).json({ success: false, message: "Invalid refresh token" });

    const user = await User.findById(saved.userId);
    if (!user || !user.isActive) return res.status(401).json({ success: false, message: "User not authorized" });

    saved.revokedAt = new Date();
    await saved.save();

    const token = buildAccessToken(user);
    const nextRefreshToken = await issueRefreshToken(user._id);
    return res.json({ success: true, token, refreshToken: nextRefreshToken });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to refresh token" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await RefreshToken.updateOne({ tokenHash: hashToken(refreshToken) }, { revokedAt: new Date() });
    }
    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: true });
  }
});

module.exports = router;

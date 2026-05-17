require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");


const authRoutes = require("./routes/authRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const doctorAppointmentsRoutes = require("./routes/doctorAppointments");
const healthRoutes = require("./routes/healthRoutes");
const doctorMonitoringRoutes = require("./routes/doctorMonitoringRoutes");
const aiRoutes = require("./routes/aiRoutes");
const mediusHealthRoutes = require("./routes/mediusHealthRoutes");
const aiGatewayRoutes = require("./routes/aiGatewayRoutes");
const alertsRoutes = require("./routes/alertsRoutes");
const adminRoutes = require("./routes/adminRoutes");
const assignmentRoutes = require("./routes/assignmentRoutes");
const doctorRequestRoutes = require("./routes/doctorRequestRoutes");
const chatRoutes = require("./routes/chatRoutes");
const consultationRoutes = require("./routes/consultationRoutes");
const zegoRoutes = require("./routes/zegoRoutes");
const reportRoutes = require("./routes/reportRoutes");
const doctorFeedbackRoutes = require("./routes/doctorFeedbackRoutes");
const caregiverRoutes = require("./routes/caregiverRoutes");
const { apiRateLimit } = require("./middleware/security");
const { setupChatSocket } = require("./sockets/chatSocket");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH"],
  },
});


app.use(cors());
app.use(express.json());
app.use(apiRateLimit({ windowMs: 60 * 1000, max: 180 }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


const connectToMongo = async () => {
  const primaryUri = process.env.MONGO_URI;

  try {
    if (!primaryUri) {
      throw new Error("Missing MONGO_URI in environment.");
    }
    await mongoose.connect(primaryUri, { dbName: "Medius" });
    console.log("✅ MongoDB connected (primary URI)");
    return;
  } catch (primaryError) {
    console.error("❌ MongoDB connection error:", primaryError.message);
    process.exit(1);
  }
};

connectToMongo();


app.use("/api/auth", authRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/doctor/appointments", doctorAppointmentsRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/doctor/monitoring", doctorMonitoringRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/v1/health", mediusHealthRoutes);
app.use("/api/v1/ai", aiGatewayRoutes);
app.use("/api/v1/alerts", alertsRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1", assignmentRoutes);
app.use("/api/v1", doctorRequestRoutes);
app.use("/api/v1", chatRoutes);
app.use("/api/consultation", consultationRoutes);
app.use("/api/zego", zegoRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/doctor", doctorFeedbackRoutes);
app.use("/api", caregiverRoutes);

setupChatSocket(io);


app.get("/", (req, res) => res.send("🚀 API is running"));


app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  res.status(500).json({ success: false, message: "Internal server error" });
});


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

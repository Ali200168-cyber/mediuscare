const router = require("express").Router();
const roleAuth = require("../middleware/roleAuth");
const Consultation = require("../models/Consultation");
const User = require("../models/User");
const Alert = require("../models/Alert");
const { hasZegoConfig, createRoom, updateRoom, deleteRoom } = require("../services/zegoService");

const hasJoinAccess = (consultation, user) => {
  if (!consultation || !user) return false;
  if (user.role === "admin") return true;
  if (user.role === "patient") return String(consultation.patientId) === String(user._id);
  if (user.role === "doctor") return String(consultation.doctorId) === String(user._id);
  return false;
};

const getDayBounds = (inputDate) => {
  const dateObj = new Date(inputDate);
  const start = new Date(dateObj);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dateObj);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const isSlotTaken = async ({ doctorId, date, time, excludeConsultationId }) => {
  const { start, end } = getDayBounds(date);
  const query = {
    doctorId,
    date: { $gte: start, $lte: end },
    time: String(time),
    status: { $in: ["Pending", "Accepted"] },
  };
  if (excludeConsultationId) {
    query._id = { $ne: excludeConsultationId };
  }
  return Boolean(await Consultation.exists(query));
};

const notifyPatient = async ({ patientId, type, message, metadata = {}, severity = "Medium" }) => {
  await Alert.create({
    patientId,
    type,
    severity,
    message,
    channel: ["in_app"],
    status: "open",
    metadata,
  });
};

router.post("/request", roleAuth(["patient"]), async (req, res) => {
  try {
    const { doctorId, date, time, notes, consultationType } = req.body || {};
    if (!date || !time) return res.status(400).json({ success: false, message: "date and time are required" });

    const patient = await User.findById(req.user._id).select("_id assignedDoctor name email");
    if (!patient) return res.status(404).json({ success: false, message: "Patient not found" });

    const resolvedDoctorId = doctorId || patient.assignedDoctor;
    if (!resolvedDoctorId) {
      return res.status(400).json({ success: false, message: "No assigned doctor found. Contact admin first." });
    }

    const doctor = await User.findById(resolvedDoctorId).select("_id role isActive name email");
    if (!doctor || doctor.role !== "doctor" || !doctor.isActive) {
      return res.status(400).json({ success: false, message: "Invalid doctor selected" });
    }

    const slotBusy = await isSlotTaken({ doctorId: resolvedDoctorId, date, time });
    if (slotBusy) {
      return res.status(409).json({
        success: false,
        message: "Selected slot is already booked or pending. Please pick another time.",
      });
    }

    const normalizedType =
      consultationType != null && String(consultationType).trim()
        ? String(consultationType).trim()
        : undefined;

    const item = await Consultation.create({
      patientId: req.user._id,
      doctorId: resolvedDoctorId,
      date: new Date(date),
      time: String(time),
      notes: String(notes || ""),
      status: "Pending",
      ...(normalizedType ? { consultationType: normalizedType } : {}),
    });

    return res.status(201).json({ success: true, item });
  } catch (error) {
    console.error("Create consultation request error:", error);
    return res.status(500).json({ success: false, message: "Failed to request consultation" });
  }
});

router.get("/patient", roleAuth(["patient"]), async (req, res) => {
  await Consultation.updateMany(
    { patientId: req.user._id, meetingProvider: { $exists: false } },
    { $set: { meetingProvider: "fallback" } },
  );

  const items = await Consultation.find({ patientId: req.user._id })
    .populate("doctorId", "name email specialization")
    .sort({ date: 1, time: 1 });
  return res.json({ success: true, items });
});

router.get("/doctor", roleAuth(["doctor"]), async (req, res) => {
  await Consultation.updateMany(
    { doctorId: req.user._id, meetingProvider: { $exists: false } },
    { $set: { meetingProvider: "fallback" } },
  );

  const items = await Consultation.find({ doctorId: req.user._id })
    .populate("patientId", "name email")
    .sort({ status: 1, date: 1, time: 1 });
  return res.json({ success: true, items });
});

router.get("/details/:id", roleAuth(["patient", "doctor", "admin"]), async (req, res) => {
  const item = await Consultation.findById(req.params.id)
    .populate("patientId", "name email")
    .populate("doctorId", "name email specialization");
  if (!item) return res.status(404).json({ success: false, message: "Consultation not found" });
  if (!hasJoinAccess(item, req.user)) return res.status(403).json({ success: false, message: "Access denied" });
  return res.json({ success: true, item });
});

router.get("/details", roleAuth(["patient", "doctor", "admin"]), async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const items = await Consultation.find()
        .populate("patientId", "name email")
        .populate("doctorId", "name email specialization")
        .sort({ createdAt: -1 });
      return res.json({ success: true, items });
    }

    if (req.user.role === "doctor") {
      const items = await Consultation.find({ doctorId: req.user._id })
        .populate("patientId", "name email")
        .populate("doctorId", "name email specialization")
        .sort({ createdAt: -1 });
      return res.json({ success: true, items });
    }

    const items = await Consultation.find({ patientId: req.user._id })
      .populate("patientId", "name email")
      .populate("doctorId", "name email specialization")
      .sort({ createdAt: -1 });
    return res.json({ success: true, items });
  } catch (error) {
    console.error("Get consultation details list error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch consultation details" });
  }
});

const updateStatusHandler = async (req, res) => {
  try {
    const { consultationId, status, notes, date, time, durationMinutes } = req.body || {};
    const allowed = ["Pending", "Accepted", "Rejected", "Completed"];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: "Invalid status value" });

    const resolvedId = req.params.id || consultationId;
    if (!resolvedId) return res.status(400).json({ success: false, message: "Consultation id is required" });
    const item = await Consultation.findById(resolvedId);
    if (!item) return res.status(404).json({ success: false, message: "Consultation not found" });

    if (req.user.role === "doctor" && String(item.doctorId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Only assigned doctor can update this consultation" });
    }
    if (req.user.role === "patient" && String(item.patientId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    if (req.user.role === "patient" && status !== "Completed") {
      return res.status(403).json({ success: false, message: "Patients can only mark consultation as Completed" });
    }

    if (status === "Accepted") {
      const slotBusy = await isSlotTaken({
        doctorId: item.doctorId,
        date: date || item.date,
        time: time || item.time,
        excludeConsultationId: item._id,
      });
      if (slotBusy) {
        return res.status(409).json({
          success: false,
          message: "Another consultation already occupies this date/time slot.",
        });
      }
    }

    const beforeDate = new Date(item.date);
    const beforeTime = String(item.time);
    const beforeStatus = String(item.status);

    item.status = status;
    if (notes != null) item.notes = String(notes);
    if (date) item.date = new Date(date);
    if (time) item.time = String(time);
    if (durationMinutes != null) item.durationMinutes = Number(durationMinutes);

    // Auto-create ZEGO room on Accept (doctor approval).
    if (status === "Accepted" && hasZegoConfig() && !item.zegoRoomId) {
      const roomRes = await createRoom({ consultationId: item._id });
      if (roomRes.ok && roomRes.data?.roomId && roomRes.data?.url) {
        item.zegoRoomId = roomRes.data.roomId;
        item.zegoLink = roomRes.data.url;
        item.zegoToken = "";
        item.meetingProvider = "zego";

        await Alert.create({
          patientId: item.patientId,
          type: "consultation_meeting",
          severity: "Medium",
          message: `Your consultation was approved. Video room is ready for ${new Date(item.date).toLocaleDateString()} at ${item.time}.`,
          channel: ["in_app"],
          status: "open",
          metadata: {
            consultationId: String(item._id),
            roomId: roomRes.data.roomId,
            joinUrl: roomRes.data.url,
          },
        });
      }
    }
    await item.save();

    const dateChanged =
      (date && new Date(date).toISOString().slice(0, 10) !== beforeDate.toISOString().slice(0, 10)) ||
      (time && String(time) !== beforeTime) ||
      durationMinutes != null;

    // ZEGO room lifecycle: update room on reschedule, delete on reject/cancel.
    if (item.zegoRoomId && item.meetingProvider === "zego" && hasZegoConfig()) {
      if (status === "Rejected" && beforeStatus === "Accepted") {
        const del = await deleteRoom({ roomId: item.zegoRoomId });
        if (!del.ok) {
          console.warn("ZEGO room delete failed:", del.status, del.message);
        }
        item.zegoRoomId = "";
        item.zegoLink = "";
        item.zegoToken = "";
        item.meetingProvider = "fallback";
        await item.save();

        await notifyPatient({
          patientId: item.patientId,
          type: "consultation_meeting_cancelled",
          severity: "High",
          message: "Your ZEGOCLOUD room was cancelled by your doctor.",
          metadata: { consultationId: String(item._id) },
        });
      }

      if (status === "Accepted" && item.zegoRoomId && dateChanged) {
        const patch = await updateRoom({
          roomId: item.zegoRoomId,
          durationMinutes: Number(item.durationMinutes || 30),
        });
        if (!patch.ok) {
          console.warn("ZEGO room update failed:", patch.status, patch.message);
        } else {
          await notifyPatient({
            patientId: item.patientId,
            type: "consultation_meeting_updated",
            severity: "Medium",
            message: `Your ZEGOCLOUD call was rescheduled to ${new Date(item.date).toLocaleDateString()} at ${item.time}.`,
            metadata: { consultationId: String(item._id) },
          });
        }
      }
    }

    if (["Accepted", "Rejected", "Completed"].includes(status)) {
      const actorName = req.user.name || req.user.email || "Doctor";
      const statusMessage =
        status === "Accepted"
          ? `${actorName} accepted your consultation request for ${new Date(item.date).toLocaleDateString()} at ${item.time}.`
          : status === "Rejected"
            ? `${actorName} rejected your consultation request scheduled for ${new Date(item.date).toLocaleDateString()} at ${item.time}.`
            : `${actorName} marked your consultation as completed.`;
      await notifyPatient({
        patientId: item.patientId,
        type: "consultation_status",
        message: statusMessage,
        metadata: { consultationId: String(item._id), status },
        severity: status === "Rejected" ? "High" : "Medium",
      });
    }

    return res.json({ success: true, item });
  } catch (error) {
    console.error("Update consultation status error:", error);
    return res.status(500).json({ success: false, message: "Failed to update consultation status" });
  }
};

router.put("/status", roleAuth(["doctor", "admin", "patient"]), updateStatusHandler);
router.put("/status/:id", roleAuth(["doctor", "admin", "patient"]), updateStatusHandler);

router.put("/reschedule/:id", roleAuth(["doctor", "admin"]), async (req, res) => {
  try {
    const { date, time, durationMinutes, notes } = req.body || {};
    if (!date && !time && durationMinutes == null && notes == null) {
      return res.status(400).json({ success: false, message: "Nothing to update" });
    }

    const item = await Consultation.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: "Consultation not found" });

    if (req.user.role === "doctor" && String(item.doctorId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Only assigned doctor can reschedule this consultation" });
    }

    const nextDate = date ? new Date(date) : new Date(item.date);
    const nextTime = time ? String(time) : String(item.time);

    const slotBusy = await isSlotTaken({
      doctorId: item.doctorId,
      date: nextDate,
      time: nextTime,
      excludeConsultationId: item._id,
    });
    if (slotBusy) {
      return res.status(409).json({
        success: false,
        message: "Selected slot is already booked or pending. Please pick another time.",
      });
    }

    const beforeDate = new Date(item.date);
    const beforeTime = String(item.time);

    if (date) item.date = nextDate;
    if (time) item.time = nextTime;
    if (durationMinutes != null) item.durationMinutes = Number(durationMinutes);
    if (notes != null) item.notes = String(notes);
    await item.save();

    const changed =
      beforeDate.toISOString().slice(0, 10) !== new Date(item.date).toISOString().slice(0, 10) || beforeTime !== String(item.time);

    if (changed) {
      const actorName = req.user.name || req.user.email || "Doctor";
      await notifyPatient({
        patientId: item.patientId,
        type: "consultation_rescheduled",
        severity: "Medium",
        message: `${actorName} rescheduled your consultation to ${new Date(item.date).toLocaleDateString()} at ${item.time}.`,
        metadata: { consultationId: String(item._id) },
      });

    }

    if (item.zegoRoomId && item.meetingProvider === "zego" && hasZegoConfig() && changed && item.status === "Accepted") {
      const patch = await updateRoom({
        roomId: item.zegoRoomId,
        durationMinutes: Number(item.durationMinutes || 30),
      });
      if (!patch.ok) {
        console.warn("ZEGO room update failed:", patch.status, patch.message);
      }
    }

    return res.json({ success: true, item });
  } catch (error) {
    console.error("Reschedule consultation error:", error);
    return res.status(500).json({ success: false, message: "Failed to reschedule consultation" });
  }
});

router.post("/doctor-create", roleAuth(["doctor", "admin"]), async (req, res) => {
  try {
    const { patientId, date, time, notes, durationMinutes, consultationType } = req.body || {};
    if (!patientId || !date || !time) {
      return res.status(400).json({ success: false, message: "patientId, date and time are required" });
    }

    const patient = await User.findById(patientId).select("_id role isActive assignedDoctor name email");
    if (!patient || patient.role !== "patient" || !patient.isActive) {
      return res.status(400).json({ success: false, message: "Invalid patient selected" });
    }

    const doctorId = req.user.role === "admin" ? req.body.doctorId : req.user._id;
    if (!doctorId) return res.status(400).json({ success: false, message: "doctorId is required" });

    const actingDoctor = await User.findById(doctorId).select("name email");
    if (!actingDoctor) {
      return res.status(400).json({ success: false, message: "Doctor account not found" });
    }

    if (req.user.role === "doctor" && String(patient.assignedDoctor) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "You can only create consultations for your assigned patients.",
      });
    }

    const slotBusy = await isSlotTaken({ doctorId, date, time });
    if (slotBusy) {
      return res.status(409).json({
        success: false,
        message: "Selected slot is already booked or pending. Please pick another time.",
      });
    }

    const normalizedType =
      consultationType != null && String(consultationType).trim()
        ? String(consultationType).trim()
        : undefined;

    const item = await Consultation.create({
      patientId,
      doctorId,
      date: new Date(date),
      time: String(time),
      notes: String(notes || ""),
      status: "Accepted",
      durationMinutes: durationMinutes != null ? Number(durationMinutes) : undefined,
      ...(normalizedType ? { consultationType: normalizedType } : {}),
    });

    // If ZEGO is configured, create room immediately.
    if (hasZegoConfig()) {
      const roomRes = await createRoom({ consultationId: item._id });
      if (roomRes.ok && roomRes.data?.roomId && roomRes.data?.url) {
        item.zegoRoomId = roomRes.data.roomId;
        item.zegoLink = roomRes.data.url;
        item.zegoToken = "";
        item.meetingProvider = "zego";
        await item.save();
      }
    } else if (!item.meetingProvider) {
      item.meetingProvider = "fallback";
      await item.save();
    }

    const actorName = req.user.name || req.user.email || "Doctor";
    await notifyPatient({
      patientId,
      type: "consultation_created",
      severity: "Medium",
      message: `${actorName} scheduled a consultation for ${new Date(item.date).toLocaleDateString()} at ${item.time}.`,
      metadata: { consultationId: String(item._id) },
    });

    return res.status(201).json({ success: true, item });
  } catch (error) {
    console.error("Doctor create consultation error:", error);
    return res.status(500).json({ success: false, message: "Failed to create consultation" });
  }
});

module.exports = router;

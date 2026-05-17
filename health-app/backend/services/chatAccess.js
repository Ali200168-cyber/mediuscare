const User = require("../models/User");

const toStr = (id) => String(id);

async function resolveChatPair(currentUser, contactId) {
  const contact = await User.findById(contactId).select("_id role name email specialization assignedDoctor isActive");
  if (!contact || !contact.isActive) return null;

  if (currentUser.role === "patient" && contact.role === "doctor") {
    const patient = await User.findById(currentUser._id).select("_id assignedDoctor");
    if (!patient?.assignedDoctor || toStr(patient.assignedDoctor) !== toStr(contact._id)) return null;
    return {
      patientId: toStr(currentUser._id),
      doctorId: toStr(contact._id),
      contact,
    };
  }

  if (currentUser.role === "doctor" && contact.role === "patient") {
    const patient = await User.findById(contact._id).select("_id assignedDoctor");
    if (!patient?.assignedDoctor || toStr(patient.assignedDoctor) !== toStr(currentUser._id)) return null;
    return {
      patientId: toStr(contact._id),
      doctorId: toStr(currentUser._id),
      contact,
    };
  }

  return null;
}

async function getChatContacts(currentUser) {
  if (currentUser.role === "patient") {
    const patient = await User.findById(currentUser._id).populate("assignedDoctor", "name email specialization role isActive");
    if (!patient?.assignedDoctor || !patient.assignedDoctor.isActive) return [];
    return [patient.assignedDoctor];
  }

  if (currentUser.role === "doctor") {
    return User.find({
      role: "patient",
      assignedDoctor: currentUser._id,
      isActive: true,
    })
      .select("name email role")
      .sort({ name: 1 })
      .limit(500);
  }

  return [];
}

module.exports = {
  resolveChatPair,
  getChatContacts,
};

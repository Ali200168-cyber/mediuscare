const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  oxygenLevel: Number,
  bloodPressure: String,
  notes: String,
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('History', historySchema);

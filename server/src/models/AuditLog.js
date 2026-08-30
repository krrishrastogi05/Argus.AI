const mongoose = require('mongoose');

// Append-only record of every state change an operator makes. Written inside
// the same transaction as the change itself, so the log can never disagree
// with the data (no "dispatched but not logged", no "logged but rolled back").
const AuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: ['DISPATCH', 'RESOLVE', 'REMOVE', 'RESET'], required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    incident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident' },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'ForceUnit' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AuditLogSchema.index({ incident: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);

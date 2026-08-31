const mongoose = require('mongoose');

// Written in the same transaction as the change, so the log always agrees with the data.
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

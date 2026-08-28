const mongoose = require('mongoose');

const { INCIDENT_STATUS, REPORT_CHANNELS } = require('./enums');

const IncidentSchema = new mongoose.Schema(
  {
    // --- Who reported it, and how ------------------------------------------
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: String, enum: REPORT_CHANNELS, required: true },
    // Client-generated UUID per submission. Unique per reporter, so a retried
    // request (flaky network, double tap) can never create a second incident.
    clientRequestId: { type: String },

    // --- What the AI (or the fallback rules) concluded ---------------------
    type: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    severity: { type: Number, required: true, min: 1, max: 10 },
    location: {
      address: { type: String, default: 'Unknown location' },
      coordinates: {
        type: [Number], // [lat, lng] - what the map renders
        validate: (value) => value.length === 2,
      },
      // true when the AI could not place the report and we fell back to the city centre.
      approximate: { type: Boolean, default: false },
    },
    breakdown: {
      evidence_source: String,
      acoustics: [String],
      visual_clues: [String],
      logistics_needed: [String],
    },
    action_plan: String,
    // Provenance from the AI harness: model vs fallback, attempts, latency.
    analysis: {
      source: { type: String, enum: ['model', 'fallback'] },
      provider: String,
      attempts: Number,
      latencyMs: Number,
      error: String,
    },

    // --- Dispatch state -----------------------------------------------------
    status: {
      type: String,
      enum: Object.values(INCIDENT_STATUS),
      default: INCIDENT_STATUS.PENDING,
    },
    assignedUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'ForceUnit', default: null },
  },
  { timestamps: true },
);

// Dashboard query: "active incidents, newest first" (+ _id as the pagination tiebreaker).
IncidentSchema.index({ status: 1, createdAt: -1, _id: -1 });
// Citizen query: "my reports, newest first".
IncidentSchema.index({ reporter: 1, createdAt: -1 });
// Idempotency key. Partial so legacy/seeded incidents without a key don't collide.
IncidentSchema.index(
  { reporter: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } },
);

// What a citizen may see about their own report: no operator notes, no unit details.
IncidentSchema.methods.toCitizenView = function toCitizenView() {
  return {
    id: this.id,
    channel: this.channel,
    type: this.type,
    severity: this.severity,
    description: this.description,
    address: this.location.address,
    status: this.status,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('Incident', IncidentSchema);

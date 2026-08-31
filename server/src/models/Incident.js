const mongoose = require('mongoose');

const { INCIDENT_STATUS, REPORT_CHANNELS } = require('./enums');

const IncidentSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    channel: { type: String, enum: REPORT_CHANNELS, required: true },
    // One UUID per post. A retry cannot make a second incident.
    clientRequestId: { type: String },

    // From the AI or the fallback rules.
    type: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    severity: { type: Number, required: true, min: 1, max: 10 },
    location: {
      address: { type: String, default: 'Unknown location' },
      coordinates: {
        type: [Number], // [lat, lng]
        validate: (value) => value.length === 2,
      },
      // true: no location found, the pin is the city centre.
      approximate: { type: Boolean, default: false },
    },
    breakdown: {
      evidence_source: String,
      acoustics: [String],
      visual_clues: [String],
      logistics_needed: [String],
    },
    action_plan: String,
    analysis: {
      source: { type: String, enum: ['model', 'fallback'] },
      provider: String,
      attempts: Number,
      latencyMs: Number,
      error: String,
    },

    status: {
      type: String,
      enum: Object.values(INCIDENT_STATUS),
      default: INCIDENT_STATUS.PENDING,
    },
    assignedUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'ForceUnit', default: null },
  },
  { timestamps: true },
);

// Dashboard list. _id breaks ties for the cursor.
IncidentSchema.index({ status: 1, createdAt: -1, _id: -1 });
// "My reports".
IncidentSchema.index({ reporter: 1, createdAt: -1 });
// Partial: old incidents without a key do not collide.
IncidentSchema.index(
  { reporter: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } },
);

// A citizen does not see AI notes or unit data.
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

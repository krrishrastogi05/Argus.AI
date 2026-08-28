const mongoose = require('mongoose');

const AdvisorySchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true, maxlength: 280 },
    author: { type: String, default: 'Location Help Centre' },
    relatedIncidentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident' },
  },
  { timestamps: true },
);

AdvisorySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Advisory', AdvisorySchema);

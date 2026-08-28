const mongoose = require('mongoose');

const { UNIT_STATUS, UNIT_TYPES } = require('./enums');

// Stored as GeoJSON ([lng, lat]) so MongoDB can index it; exposed to the
// client as `coordinates: [lat, lng]` to match Leaflet.
const PointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

const ForceUnitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: UNIT_TYPES, required: true },
    status: { type: String, enum: Object.values(UNIT_STATUS), default: UNIT_STATUS.IDLE },
    location: { type: PointSchema, required: true },
    currentIncident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  },
);

ForceUnitSchema.index({ location: '2dsphere' });

ForceUnitSchema.virtual('coordinates').get(function coordinates() {
  return ForceUnitSchema.statics.toLatLng(this.location);
});

ForceUnitSchema.statics.toPoint = ([lat, lng]) => ({ type: 'Point', coordinates: [lng, lat] });
ForceUnitSchema.statics.toLatLng = (point) => (point ? [point.coordinates[1], point.coordinates[0]] : null);

module.exports = mongoose.model('ForceUnit', ForceUnitSchema);

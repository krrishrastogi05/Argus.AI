const ForceUnit = require('../../models/ForceUnit');
const Incident = require('../../models/Incident');
const { emitIncidentAlert, emitUnitsUpdated } = require('../services/realtimeService');

async function createUnit(req, res, next) {
  try {
    const unit = await ForceUnit.create(req.body);
    const units = await ForceUnit.find();

    emitUnitsUpdated(units);
    return res.json(unit);
  } catch (err) {
    return next(err);
  }
}

async function deployUnit(req, res, next) {
  try {
    const { incidentId, unitId } = req.body;

    // Mark the unit BUSY first so the populated incident below reflects its real status.
    await ForceUnit.findByIdAndUpdate(unitId, { status: 'BUSY' });

    const incident = await Incident.findByIdAndUpdate(
      incidentId,
      { status: 'DISPATCHED', assignedUnit: unitId },
      { new: true },
    ).populate('assignedUnit');

    const incidents = await Incident.find().populate('assignedUnit').sort({ timestamp: -1 });
    const units = await ForceUnit.find();

    // newIncident is null here (not an actual new incident) so deploying doesn't
    // re-trigger the "new incident" toast/flash for an incident that already existed.
    emitIncidentAlert({ incidents, units, newIncident: null });
    return res.json({ success: true, incident });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createUnit, deployUnit };

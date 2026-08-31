// Each update filters on the state it expects (for example `status: IDLE`).
// If another operator changed the document first, the filter finds nothing.
// We then throw 409, and the transaction undoes all writes.
// Result: one unit can never go to two incidents.

const Advisory = require('../models/Advisory');
const AuditLog = require('../models/AuditLog');
const ForceUnit = require('../models/ForceUnit');
const Incident = require('../models/Incident');
const { INCIDENT_STATUS, UNIT_STATUS } = require('../models/enums');
const { publish } = require('../realtime/socket');
const { HttpError } = require('../utils/httpError');
const { inTransaction } = require('../utils/transaction');

function audit(session, entry) {
  return AuditLog.create([entry], { session });
}

// Call only after the commit.
async function announce(incident, unit) {
  await incident.populate('assignedUnit');
  publish.incidentUpdated(incident);
  publish.reportUpdated(incident.reporter, incident.toCitizenView());
  if (unit) publish.unitUpdated(unit);
}

async function dispatchUnit({ incidentId, unitId, actorId }) {
  const { incident, unit } = await inTransaction(async (session) => {
    const unit = await ForceUnit.findOneAndUpdate(
      { _id: unitId, status: UNIT_STATUS.IDLE },
      { status: UNIT_STATUS.BUSY, currentIncident: incidentId },
      { new: true, session },
    );
    if (!unit) throw new HttpError(409, 'Unit is no longer available');

    const incident = await Incident.findOneAndUpdate(
      { _id: incidentId, status: INCIDENT_STATUS.PENDING },
      { status: INCIDENT_STATUS.DISPATCHED, assignedUnit: unitId },
      { new: true, session },
    );
    // This also undoes the unit update.
    if (!incident) throw new HttpError(409, 'Incident is not awaiting dispatch');

    await audit(session, { action: 'DISPATCH', actor: actorId, incident: incidentId, unit: unitId });
    return { incident, unit };
  });

  await announce(incident, unit);
  return incident;
}

async function resolveIncident({ incidentId, actorId }) {
  const { incident, unit } = await inTransaction(async (session) => {
    const incident = await Incident.findOneAndUpdate(
      { _id: incidentId, status: INCIDENT_STATUS.DISPATCHED },
      { status: INCIDENT_STATUS.RESOLVED },
      { new: true, session },
    );
    if (!incident) throw new HttpError(409, 'Only dispatched incidents can be resolved');

    const unit = await ForceUnit.findOneAndUpdate(
      { _id: incident.assignedUnit, currentIncident: incident._id },
      { status: UNIT_STATUS.IDLE, currentIncident: null },
      { new: true, session },
    );

    await audit(session, { action: 'RESOLVE', actor: actorId, incident: incident._id, unit: unit?._id });
    return { incident, unit };
  });

  await announce(incident, unit);
  return incident;
}

async function removeIncident({ incidentId, actorId }) {
  const { incident, unit } = await inTransaction(async (session) => {
    const incident = await Incident.findOneAndDelete({ _id: incidentId }, { session });
    if (!incident) throw new HttpError(404, 'Incident not found');

    // Free the unit only if it is still working this incident.
    const unit = await ForceUnit.findOneAndUpdate(
      { currentIncident: incident._id },
      { status: UNIT_STATUS.IDLE, currentIncident: null },
      { new: true, session },
    );

    await audit(session, { action: 'REMOVE', actor: actorId, incident: incident._id, unit: unit?._id });
    return { incident, unit };
  });

  publish.incidentRemoved(incident._id);
  publish.reportRemoved(incident.reporter, incident._id);
  if (unit) publish.unitUpdated(unit);
}

// ponytail: one transaction for all data. Limit is ~60s and 16MB; use batches at scale.
async function resetSystem({ actorId }) {
  await inTransaction(async (session) => {
    await Incident.deleteMany({}, { session });
    await Advisory.deleteMany({}, { session });
    await ForceUnit.updateMany({}, { status: UNIT_STATUS.IDLE, currentIncident: null }, { session });
    await audit(session, { action: 'RESET', actor: actorId });
  });

  publish.systemReset();
}

module.exports = { dispatchUnit, removeIncident, resetSystem, resolveIncident };

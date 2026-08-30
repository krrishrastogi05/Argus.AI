// Runs against a real single-node replica set (transactions need one).
// First run downloads a mongod binary; set MONGOMS_SYSTEM_BINARY to reuse a local install.
process.env.JWT_SECRET ??= 'test-secret';

const assert = require('node:assert/strict');
const { after, before, beforeEach, test } = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const AuditLog = require('../src/models/AuditLog');
const ForceUnit = require('../src/models/ForceUnit');
const Incident = require('../src/models/Incident');
const { dispatchUnit, resolveIncident } = require('../src/services/incidentService');

let replSet;
const actorId = new mongoose.Types.ObjectId();

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  await Promise.all([AuditLog, ForceUnit, Incident].map((model) => model.syncIndexes()));
});

after(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

beforeEach(() => Promise.all([AuditLog, ForceUnit, Incident].map((model) => model.deleteMany({}))));

const makeUnit = () =>
  ForceUnit.create({ name: `MED-${Date.now()}`, type: 'MEDICAL', location: ForceUnit.toPoint([28.6, 77.2]) });

const makeIncident = (overrides = {}) =>
  Incident.create({
    reporter: new mongoose.Types.ObjectId(),
    channel: 'SOCIAL',
    type: 'Medical Emergency',
    description: 'Person collapsed',
    severity: 8,
    location: { address: 'CP', coordinates: [28.63, 77.21] },
    ...overrides,
  });

test('ten dispatchers racing for one unit: exactly one wins, nine get 409', async () => {
  const unit = await makeUnit();
  const incidents = await Promise.all(Array.from({ length: 10 }, () => makeIncident()));

  const results = await Promise.allSettled(
    incidents.map((incident) => dispatchUnit({ incidentId: incident.id, unitId: unit.id, actorId })),
  );

  const winners = results.filter((r) => r.status === 'fulfilled');
  const losers = results.filter((r) => r.status === 'rejected');
  assert.equal(winners.length, 1);
  assert.equal(losers.length, 9);
  losers.forEach((r) => assert.equal(r.reason.status, 409));

  const winnerId = winners[0].value.id;
  const savedUnit = await ForceUnit.findById(unit.id);
  assert.equal(savedUnit.status, 'BUSY');
  assert.equal(String(savedUnit.currentIncident), winnerId);

  // Losing transactions left nothing behind.
  assert.equal(await Incident.countDocuments({ status: 'DISPATCHED' }), 1);
  assert.equal(await Incident.countDocuments({ status: 'PENDING', assignedUnit: null }), 9);
  assert.equal(await AuditLog.countDocuments({ action: 'DISPATCH' }), 1);
});

test('a failed second step rolls back the first (atomicity)', async () => {
  const unit = await makeUnit();
  const alreadyHandled = await makeIncident({ status: 'DISPATCHED' });

  // Step 1 (unit IDLE -> BUSY) succeeds inside the transaction, step 2 fails.
  await assert.rejects(
    dispatchUnit({ incidentId: alreadyHandled.id, unitId: unit.id, actorId }),
    { status: 409, message: 'Incident is not awaiting dispatch' },
  );

  const savedUnit = await ForceUnit.findById(unit.id);
  assert.equal(savedUnit.status, 'IDLE'); // rolled back, not stranded as BUSY
  assert.equal(savedUnit.currentIncident, null);
  assert.equal(await AuditLog.countDocuments(), 0);
});

test('resolving an incident frees its unit for the next dispatch', async () => {
  const unit = await makeUnit();
  const first = await makeIncident();
  const second = await makeIncident();

  await dispatchUnit({ incidentId: first.id, unitId: unit.id, actorId });
  await resolveIncident({ incidentId: first.id, actorId });
  await dispatchUnit({ incidentId: second.id, unitId: unit.id, actorId });

  assert.equal((await Incident.findById(first.id)).status, 'RESOLVED');
  assert.equal(String((await ForceUnit.findById(unit.id)).currentIncident), second.id);
  assert.deepEqual(
    (await AuditLog.find().sort({ createdAt: 1 })).map((entry) => entry.action),
    ['DISPATCH', 'RESOLVE', 'DISPATCH'],
  );
});

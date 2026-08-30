const { z } = require('zod');

const ForceUnit = require('../models/ForceUnit');
const Incident = require('../models/Incident');
const { INCIDENT_STATUS, UNIT_STATUS } = require('../models/enums');
const incidentService = require('../services/incidentService');
const { objectId } = require('../middleware/validate');
const { HttpError } = require('../utils/httpError');
const { NEWEST_FIRST, afterCursor, encodeCursor } = require('../utils/pagination');

const listQuerySchema = z.object({
  status: z
    .string()
    .default('PENDING,DISPATCHED')
    .transform((value) => value.split(','))
    .pipe(z.array(z.enum(Object.values(INCIDENT_STATUS)))),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const dispatchSchema = z.object({ unitId: objectId });

// GET /incidents?status=PENDING,DISPATCHED&limit=50&cursor=...
async function list(req, res) {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, 'Invalid query parameters');
  const { status, limit, cursor } = parsed.data;

  // Fetch one extra row to learn whether another page exists without a COUNT.
  const rows = await Incident.find({ status: { $in: status }, ...afterCursor(cursor) })
    .sort(NEWEST_FIRST)
    .limit(limit + 1)
    .populate('assignedUnit');

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  res.json({ items, nextCursor: hasMore ? encodeCursor(items.at(-1)) : null });
}

// The closest idle unit of each type, in one indexed query. $geoNear uses the
// 2dsphere index and returns units ordered by distance, so $first per type is
// the nearest one. Replaces a client-side scan over every unit.
async function nearestUnits(req, res) {
  const incident = await Incident.findById(req.params.id);
  if (!incident) throw new HttpError(404, 'Incident not found');

  const [lat, lng] = incident.location.coordinates;
  const groups = await ForceUnit.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        key: 'location',
        distanceField: 'distanceMeters',
        query: { status: UNIT_STATUS.IDLE },
        spherical: true,
      },
    },
    { $group: { _id: '$type', unit: { $first: '$$ROOT' } } },
    { $sort: { 'unit.distanceMeters': 1 } },
  ]);

  const units = groups.map(({ unit }) => ({
    ...unit,
    coordinates: ForceUnit.toLatLng(unit.location),
    distanceKm: Math.round(unit.distanceMeters / 100) / 10,
  }));
  res.json({ units });
}

async function dispatch(req, res) {
  const incident = await incidentService.dispatchUnit({
    incidentId: req.params.id,
    unitId: req.body.unitId,
    actorId: req.user.id,
  });
  res.json({ incident });
}

async function resolve(req, res) {
  const incident = await incidentService.resolveIncident({ incidentId: req.params.id, actorId: req.user.id });
  res.json({ incident });
}

async function remove(req, res) {
  await incidentService.removeIncident({ incidentId: req.params.id, actorId: req.user.id });
  res.status(204).end();
}

async function reset(req, res) {
  await incidentService.resetSystem({ actorId: req.user.id });
  res.status(204).end();
}

module.exports = { dispatch, dispatchSchema, list, nearestUnits, remove, reset, resolve };

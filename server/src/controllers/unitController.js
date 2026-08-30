const { z } = require('zod');

const ForceUnit = require('../models/ForceUnit');
const { UNIT_TYPES } = require('../models/enums');
const { publish } = require('../realtime/socket');
const { HttpError } = require('../utils/httpError');

const createUnitSchema = z.object({
  name: z.string().trim().min(1).max(30),
  type: z.enum(UNIT_TYPES),
  coordinates: z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]),
});

async function listUnits(req, res) {
  const units = await ForceUnit.find().sort({ name: 1 });
  res.json({ units });
}

async function createUnit(req, res) {
  const { name, type, coordinates } = req.body;

  try {
    const unit = await ForceUnit.create({ name, type, location: ForceUnit.toPoint(coordinates) });
    publish.unitUpdated(unit);
    res.status(201).json({ unit });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, `A unit named ${name} already exists`);
    throw err;
  }
}

module.exports = { createUnit, createUnitSchema, listUnits };

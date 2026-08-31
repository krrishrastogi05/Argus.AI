const { z } = require('zod');

const Advisory = require('../models/Advisory');
const Incident = require('../models/Incident');
const { runTask } = require('../ai/harness');
const advisoryDraft = require('../ai/tasks/advisoryDraft');
const { publish } = require('../realtime/socket');
const { objectId } = require('../middleware/validate');
const { HttpError } = require('../utils/httpError');

const draftSchema = z.object({ incidentId: objectId });

const publishSchema = z.object({
  message: z.string().trim().min(1).max(advisoryDraft.MAX_LENGTH),
  incidentId: objectId.optional(),
});

async function listAdvisories(req, res) {
  const advisories = await Advisory.find().sort({ createdAt: -1 }).limit(50);
  res.json({ advisories });
}

// The AI writes a draft only. An operator must approve it.
async function draftAdvisory(req, res) {
  const incident = await Incident.findById(req.body.incidentId);
  if (!incident) throw new HttpError(404, 'Incident not found');

  const { output, meta } = await runTask(advisoryDraft, { incident });
  res.json({ text: output, source: meta.source });
}

async function publishAdvisory(req, res) {
  const advisory = await Advisory.create({
    message: req.body.message,
    relatedIncidentId: req.body.incidentId,
  });

  publish.advisoryPublished(advisory);
  res.status(201).json({ advisory });
}

module.exports = { draftAdvisory, draftSchema, listAdvisories, publishAdvisory, publishSchema };

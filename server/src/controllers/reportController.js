const { z } = require('zod');

const Incident = require('../models/Incident');
const { REPORT_CHANNELS } = require('../models/enums');
const { runTask } = require('../ai/harness');
const incidentAnalysis = require('../ai/tasks/incidentAnalysis');
const { publish } = require('../realtime/socket');

// ~7MB file once base64-encoded; matches the express.json body limit.
const MAX_MEDIA_BASE64_LENGTH = 9_500_000;

const createReportSchema = z
  .object({
    channel: z.enum(REPORT_CHANNELS),
    text: z.string().trim().max(2000).default(''),
    media: z
      .object({
        data: z.base64().max(MAX_MEDIA_BASE64_LENGTH),
        mimeType: z.string().regex(/^(image|audio|video)\/[\w.+-]+$/, 'must be an image, audio or video type'),
      })
      .optional(),
    clientRequestId: z.uuid(),
  })
  .refine((report) => report.text || report.media, { message: 'Add a description or attach media' });

async function createReport(req, res) {
  const { channel, text, media, clientRequestId } = req.body;
  const reporter = req.user.id;

  // Idempotency: a retried submission returns the original instead of a duplicate incident.
  const existing = await Incident.findOne({ reporter, clientRequestId });
  if (existing) return res.json({ report: existing.toCitizenView(), duplicate: true });

  // The server runs the analysis and builds the incident itself; clients can't
  // submit pre-made "AI results" (old flow: client called /analyze then /incident).
  const { output, meta } = await runTask(incidentAnalysis, { text, media });
  const description = channel === 'HELPLINE' ? `[VOICE CALL] ${output.description}` : output.description;

  try {
    const incident = await Incident.create({
      ...output,
      description,
      reporter,
      channel,
      clientRequestId,
      analysis: meta,
    });

    publish.incidentCreated(incident);
    return res.status(201).json({ report: incident.toCitizenView() });
  } catch (err) {
    // Two concurrent retries can both pass the findOne above; the unique index
    // lets exactly one insert win and the loser returns the winner's record.
    if (err.code !== 11000) throw err;
    const original = await Incident.findOne({ reporter, clientRequestId });
    return res.json({ report: original.toCitizenView(), duplicate: true });
  }
}

async function listMyReports(req, res) {
  const reports = await Incident.find({ reporter: req.user.id }).sort({ createdAt: -1 }).limit(50);
  res.json({ reports: reports.map((report) => report.toCitizenView()) });
}

module.exports = { createReport, createReportSchema, listMyReports };

const { OutputValidationError } = require('../harness');

const MAX_LENGTH = 280;

function buildRequest({ incident }, feedback) {
  const prompt = [
    'You are ARGUS AI drafting an official public-safety advisory for citizens.',
    `Incident: ${incident.type} (severity ${incident.severity}/10)`,
    `Location: ${incident.location.address}`,
    `Summary: ${incident.description}`,
    `Write one calm, urgent advisory under ${MAX_LENGTH} characters. Plain text only: no quotes, hashtags or markdown.`,
    feedback && `Your previous draft was rejected (${feedback}). Fix it.`,
  ]
    .filter(Boolean)
    .join('\n');

  return { prompt, json: false };
}

function parse(raw) {
  const text = String(raw).trim().replace(/^["']|["']$/g, '');
  if (!text) throw new OutputValidationError('advisory was empty');
  if (text.length > MAX_LENGTH) {
    throw new OutputValidationError(`advisory was ${text.length} characters, limit is ${MAX_LENGTH}`);
  }
  return text;
}

function fallback({ incident }) {
  const where = incident.location.approximate ? '' : ` near ${incident.location.address}`;
  const text = `ALERT: ${incident.type} reported${where}. Avoid the area, keep routes clear for emergency vehicles and follow official instructions.`;
  return text.slice(0, MAX_LENGTH);
}

module.exports = { name: 'advisory-draft', buildRequest, parse, fallback, MAX_LENGTH };

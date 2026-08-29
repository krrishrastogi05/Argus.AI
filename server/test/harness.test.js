process.env.JWT_SECRET ??= 'test-secret';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { runTask } = require('../src/ai/harness');
const incidentAnalysis = require('../src/ai/tasks/incidentAnalysis');
const advisoryDraft = require('../src/ai/tasks/advisoryDraft');

const VALID = JSON.stringify({
  type: 'Fire',
  severity: 9,
  description: 'Warehouse fire with heavy smoke',
  location: { address: 'Okhla Phase 2', coordinates: [28.53, 77.27] },
  breakdown: { evidence_source: 'image', visual_clues: ['smoke plume'] },
  action_plan: 'Send two fire engines',
});

// A fake provider that replays scripted responses: strings are returned, Errors are thrown.
function scripted(...responses) {
  const requests = [];
  return {
    name: 'fake',
    requests,
    isConfigured: () => true,
    async generate(request) {
      requests.push(request);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

const fast = { backoffBaseMs: 1, timeoutMs: 200 };
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

test('returns validated model output on the first try', async () => {
  const provider = scripted(VALID);
  const { output, meta } = await runTask(incidentAnalysis, { text: 'fire!' }, { provider, ...fast });

  assert.equal(meta.source, 'model');
  assert.equal(meta.attempts, 1);
  assert.equal(output.severity, 9);
  assert.deepEqual(output.location.coordinates, [28.53, 77.27]);
  assert.equal(output.location.approximate, false);
  assert.deepEqual(output.breakdown.acoustics, []); // nested default applied
});

test('repairs invalid output by feeding the validation error back to the model', async () => {
  const provider = scripted('not json at all', VALID);
  const { meta } = await runTask(incidentAnalysis, { text: 'fire!' }, { provider, ...fast });

  assert.equal(meta.source, 'model');
  assert.equal(meta.attempts, 2);
  assert.match(provider.requests[1].prompt, /previous answer was rejected \(response was not valid JSON\)/);
});

test('retries transient provider errors (429/5xx)', async () => {
  const provider = scripted(httpError(503), httpError(429), VALID);
  const { meta } = await runTask(incidentAnalysis, { text: 'fire!' }, { provider, ...fast });

  assert.equal(meta.source, 'model');
  assert.equal(meta.attempts, 3);
});

test('does not retry permanent errors and falls back immediately', async () => {
  const provider = scripted(httpError(400), VALID);
  const { output, meta } = await runTask(incidentAnalysis, { text: 'building on fire' }, { provider, ...fast });

  assert.equal(meta.source, 'fallback');
  assert.equal(meta.attempts, 1);
  assert.equal(output.type, 'Fire');
});

test('times out a hung model call and falls back', async () => {
  const provider = { ...scripted(), generate: () => new Promise(() => {}) };
  const { meta } = await runTask(incidentAnalysis, { text: 'help' }, { provider, maxAttempts: 1, timeoutMs: 20 });

  assert.equal(meta.source, 'fallback');
  assert.match(meta.error, /did not respond within 20ms/);
});

test('falls back without calling the model when the provider is not configured', async () => {
  const provider = { ...scripted(VALID), isConfigured: () => false };
  const { output, meta } = await runTask(incidentAnalysis, { text: 'man collapsed, not breathing' }, { provider, ...fast });

  assert.equal(meta.attempts, 0);
  assert.equal(output.type, 'Medical Emergency');
  assert.equal(output.location.approximate, true); // never pretends to know the location
});

test('rejects schema violations such as out-of-range severity', async () => {
  const bad = JSON.stringify({ ...JSON.parse(VALID), severity: 42 });
  const provider = scripted(bad, bad, bad);
  const { meta } = await runTask(incidentAnalysis, { text: 'x' }, { provider, ...fast });

  assert.equal(meta.source, 'fallback');
  assert.match(meta.error, /severity/);
});

test('advisory drafts over the length limit are repaired', async () => {
  const incident = { type: 'Fire', severity: 8, description: 'x', location: { address: 'CP' } };
  const provider = scripted('A'.repeat(400), '"Avoid Connaught Place."');
  const { output, meta } = await runTask(advisoryDraft, { incident }, { provider, ...fast });

  assert.equal(meta.attempts, 2);
  assert.equal(output, 'Avoid Connaught Place.');
});

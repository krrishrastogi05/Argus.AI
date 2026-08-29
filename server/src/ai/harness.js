// A small harness around LLM calls. The model is treated like any other
// unreliable network dependency:
//
//   1. timeout      every call is aborted after `timeoutMs`
//   2. retry        transient failures (timeouts, 429, 5xx, network) retry with backoff + jitter
//   3. validate     output is parsed against the task's schema, never trusted as-is
//   4. repair       if validation fails, the next attempt tells the model what was wrong
//   5. fallback     when attempts run out, a deterministic rule-based answer is returned
//
// A task is a plain object: { name, buildRequest(input, feedback), parse(raw), fallback(input) }.
// A provider is: { name, isConfigured(), generate(request, { signal }) -> Promise<string> }.

const { env } = require('../config/env');
const geminiProvider = require('./geminiProvider');

class OutputValidationError extends Error {}

class TimeoutError extends Error {
  constructor(ms) {
    super(`model did not respond within ${ms}ms`);
  }
}

function isRetryable(err) {
  if (err instanceof TimeoutError || err instanceof OutputValidationError) return true;
  if (typeof err.status === 'number') return err.status === 429 || err.status >= 500;
  return true; // no HTTP status: network-level failure
}

function withTimeout(run, ms) {
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(ms));
    }, ms);
  });
  return Promise.race([run(controller.signal), timeout]).finally(() => clearTimeout(timer));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTask(task, input, options = {}) {
  const {
    provider = geminiProvider,
    maxAttempts = 3,
    timeoutMs = env.aiTimeoutMs,
    backoffBaseMs = 500,
  } = options;

  const startedAt = Date.now();
  let attempts = 0;
  let feedback = null;
  let lastError = new Error(`${provider.name} is not configured`);

  // Recorded on the incident, so operators (and metrics) can see how each answer was produced.
  const meta = (source, extra = {}) => ({
    task: task.name,
    source,
    provider: provider.name,
    attempts,
    latencyMs: Date.now() - startedAt,
    ...extra,
  });

  while (attempts < maxAttempts && provider.isConfigured()) {
    attempts += 1;
    try {
      const request = task.buildRequest(input, feedback);
      const raw = await withTimeout((signal) => provider.generate(request, { signal }), timeoutMs);
      return { output: task.parse(raw), meta: meta('model') };
    } catch (err) {
      lastError = err;
      if (err instanceof OutputValidationError) feedback = err.message;
      if (!isRetryable(err)) break;
      if (attempts < maxAttempts) {
        await sleep(backoffBaseMs * 2 ** (attempts - 1) + Math.random() * backoffBaseMs);
      }
    }
  }

  console.warn(`[ai:${task.name}] using fallback after ${attempts} attempt(s): ${lastError.message}`);
  return { output: task.fallback(input), meta: meta('fallback', { error: lastError.message }) };
}

module.exports = { OutputValidationError, TimeoutError, runTask };

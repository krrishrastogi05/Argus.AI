// Do not trust the model. Each call gets:
//   timeout, retry with backoff (timeouts, 429, 5xx, network only),
//   schema validation, a repair prompt with the error, and a rule-based fallback.
//
// task:     { name, buildRequest(input, feedback), parse(raw), fallback(input) }
// provider: { name, isConfigured(), generate(request, { signal }) -> Promise<string> }

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
  return true; // no status: network error
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

  // Kept on the incident, so operators see how the answer was made.
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

const { ipKeyGenerator, rateLimit } = require('express-rate-limit');

// Signed-in traffic is limited per account (fair behind shared NATs/offices);
// anonymous traffic falls back to per-IP.
// Trade-off: in-memory store, counts are per instance. Swap in rate-limit-redis when running >1 instance.
const keyByUserOrIp = (req) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip));

function limiter(windowMinutes, max, message) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    keyGenerator: keyByUserOrIp,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

const apiLimiter = limiter(15, 300, 'Too many requests. Please try again shortly.');

// Brute-force protection on login/register.
const authLimiter = limiter(15, 20, 'Too many sign-in attempts. Please wait 15 minutes.');

// AI calls are expensive and can trigger provider quota exhaustion, so they get a tighter budget.
const aiLimiter = limiter(30, 10, 'Too many AI requests. Please wait 30 minutes.');

module.exports = { aiLimiter, apiLimiter, authLimiter };

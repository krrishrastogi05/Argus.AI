const { ipKeyGenerator, rateLimit } = require('express-rate-limit');

// Per user when signed in (one office can share one IP), else per IP.
// ponytail: in-memory counts are per instance. Use rate-limit-redis for more than one instance.
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

// Stops password guessing.
const authLimiter = limiter(15, 20, 'Too many sign-in attempts. Please wait 15 minutes.');

// AI calls cost money and use provider quota.
const aiLimiter = limiter(30, 10, 'Too many AI requests. Please wait 30 minutes.');

module.exports = { aiLimiter, apiLimiter, authLimiter };

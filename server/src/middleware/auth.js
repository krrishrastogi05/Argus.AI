const jwt = require('jsonwebtoken');

const { env } = require('../config/env');
const { HttpError } = require('../utils/httpError');

// Stateless auth: the token carries id + role, so any server instance can
// verify a request without a shared session store.
function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, name: user.name }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

function verifyToken(token) {
  const payload = jwt.verify(token, env.jwtSecret);
  return { id: payload.sub, role: payload.role, name: payload.name };
}

function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Authentication required'));
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch {
    return next(new HttpError(401, 'Session expired or invalid'));
  }
}

// RBAC gate. Must run after requireAuth.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have access to this resource'));
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole, signToken, verifyToken };

const { z } = require('zod');

const User = require('../models/User');
const { ROLES } = require('../models/enums');
const { signToken } = require('../middleware/auth');
const { HttpError } = require('../utils/httpError');

const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.email(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

function session(user) {
  return { token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } };
}

// Public sign-up always creates a citizen. Admins are provisioned by the seed script.
async function register(req, res) {
  const { name, email, password } = req.body;

  try {
    const user = await User.create({
      name,
      email,
      passwordHash: await User.hashPassword(password),
      role: ROLES.CITIZEN,
    });
    res.status(201).json(session(user));
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'An account with this email already exists');
    throw err;
  }
}

async function login(req, res) {
  const user = await User.findOne({ email: req.body.email.toLowerCase() }).select('+passwordHash');

  // Same message for unknown email and wrong password: don't leak which emails exist.
  if (!user || !(await user.verifyPassword(req.body.password))) {
    throw new HttpError(401, 'Invalid email or password');
  }

  res.json(session(user));
}

async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}

module.exports = { login, loginSchema, me, register, registerSchema };

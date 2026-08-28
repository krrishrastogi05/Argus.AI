const crypto = require('crypto');
const { promisify } = require('util');
const mongoose = require('mongoose');

const { ROLES } = require('./enums');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // "salt:hash", both hex. Never selected unless explicitly asked for.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.CITIZEN },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

// scrypt is memory-hard and ships with Node, so no native bcrypt dependency.
UserSchema.statics.hashPassword = async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return `${salt}:${hash.toString('hex')}`;
};

UserSchema.methods.verifyPassword = async function verifyPassword(password) {
  const [salt, storedHex] = this.passwordHash.split(':');
  const hash = await scrypt(password, salt, KEY_LENGTH);
  return crypto.timingSafeEqual(hash, Buffer.from(storedHex, 'hex'));
};

module.exports = mongoose.model('User', UserSchema);

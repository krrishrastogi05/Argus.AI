require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3001,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/argus?replicaSet=rs0',

  // Comma-separated list of allowed browser origins for REST and WebSocket.
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim()),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',

  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS) || 15000,

  // Map fallback when the AI cannot place an incident (New Delhi).
  defaultCoordinates: [28.6139, 77.209],
};

module.exports = { env };

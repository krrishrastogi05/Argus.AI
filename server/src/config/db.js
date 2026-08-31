const mongoose = require('mongoose');

const { env } = require('./env');

// Transactions need a replica set. Locally: mongod --replSet rs0, then rs.initiate() one time.
async function connectDatabase(uri = env.mongoUri) {
  await mongoose.connect(uri);
  console.log('MongoDB connected');
}

module.exports = { connectDatabase };

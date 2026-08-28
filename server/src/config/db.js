const mongoose = require('mongoose');

const { env } = require('./env');

// Transactions need a replica set (Atlas always is one). Locally, start mongod
// with --replSet rs0 and run rs.initiate() once.
async function connectDatabase(uri = env.mongoUri) {
  await mongoose.connect(uri);
  console.log('MongoDB connected');
}

module.exports = { connectDatabase };

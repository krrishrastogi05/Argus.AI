const http = require('http');
const mongoose = require('mongoose');

const { app } = require('./src/app');
const { connectDatabase } = require('./src/config/db');
const { env } = require('./src/config/env');
const { attachRealtime } = require('./src/realtime/socket');

async function start() {
  // Without the database, every request fails. Stop here.
  await connectDatabase();

  const server = http.createServer(app);
  const io = attachRealtime(server, { origins: env.clientOrigins });

  server.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });

  // Deploys send SIGTERM. Stop new work first, then close the pool.
  process.on('SIGTERM', () => {
    io.close();
    server.close(() => mongoose.disconnect().then(() => process.exit(0)));
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

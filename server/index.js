const http = require('http');
const mongoose = require('mongoose');

const { app } = require('./src/app');
const { connectDatabase } = require('./src/config/db');
const { env } = require('./src/config/env');
const { attachRealtime } = require('./src/realtime/socket');

async function start() {
  // Fail fast: a server that boots without its database only produces 500s.
  await connectDatabase();

  const server = http.createServer(app);
  const io = attachRealtime(server, { origins: env.clientOrigins });

  server.listen(env.port, () => {
    console.log(`Server running on port ${env.port}`);
  });

  // Render/Docker send SIGTERM on deploy: stop accepting work, then close the pool.
  process.on('SIGTERM', () => {
    io.close();
    server.close(() => mongoose.disconnect().then(() => process.exit(0)));
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

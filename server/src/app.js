const cors = require('cors');
const express = require('express');

const { env } = require('./config/env');
const { apiLimiter } = require('./middleware/rateLimiters');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

// Render sits behind a reverse proxy; without this, req.ip (what the rate
// limiters key on) doesn't resolve per-visitor and the limits become global.
app.set('trust proxy', 1);

app.use(cors({ origin: env.clientOrigins }));
// Media arrives base64-encoded (~1.33x the file size); 10mb covers an ~7MB upload.
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.use('/api', apiLimiter, apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app };

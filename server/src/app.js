const cors = require('cors');
const express = require('express');

const { env } = require('./config/env');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

// Render uses a proxy. Without this, all visitors get the proxy IP.
app.set('trust proxy', 1);

app.use(cors({ origin: env.clientOrigins }));
// Base64 adds ~33%, so 10mb holds a ~7MB file.
app.use(express.json({ limit: '10mb' }));

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app };

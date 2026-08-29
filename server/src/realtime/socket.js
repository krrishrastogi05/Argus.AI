const { Server } = require('socket.io');

const { verifyToken } = require('../middleware/auth');
const { ROLES } = require('../models/enums');

// Rooms decide who hears what:
//   admins       every command-centre operator (incident + unit traffic)
//   user:<id>    one citizen's own devices (status of *their* reports)
const ROOMS = {
  admins: 'admins',
  user: (userId) => `user:${userId}`,
};

let io = null;

function attachRealtime(httpServer, { origins }) {
  io = new Server(httpServer, { cors: { origin: origins } });

  // Scaling out: with more than one server instance, add @socket.io/redis-adapter
  // here (io.adapter(createAdapter(pub, sub))) so room broadcasts reach sockets
  // connected to other instances. Nothing else in this file changes.

  // The handshake must carry a valid JWT; unauthenticated sockets never connect.
  // Trade-off: the token is checked once per connection, not per event.
  io.use((socket, next) => {
    try {
      socket.data.user = verifyToken(socket.handshake.auth?.token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.data.user;
    socket.join(ROOMS.user(id));
    if (role === ROLES.ADMIN) socket.join(ROOMS.admins);
  });

  return io;
}

const toAdmins = (event, payload) => io?.to(ROOMS.admins).emit(event, payload);
const toUser = (userId, event, payload) => io?.to(ROOMS.user(String(userId))).emit(event, payload);
const toEveryone = (event, payload) => io?.emit(event, payload);

// Every event the server sends, in one place. Payloads are the single document
// that changed (a delta), never a whole collection. Clients that miss events
// (e.g. during a reconnect) re-fetch a REST snapshot on `connect`.
const publish = {
  incidentCreated: (incident) => toAdmins('incident:created', incident),
  incidentUpdated: (incident) => toAdmins('incident:updated', incident),
  incidentRemoved: (incidentId) => toAdmins('incident:removed', { id: String(incidentId) }),
  unitUpdated: (unit) => toAdmins('unit:updated', unit),
  reportUpdated: (userId, report) => toUser(userId, 'report:updated', report),
  reportRemoved: (userId, reportId) => toUser(userId, 'report:removed', { id: String(reportId) }),
  advisoryPublished: (advisory) => toEveryone('advisory:published', advisory),
  systemReset: () => toEveryone('system:reset'),
};

module.exports = { attachRealtime, publish };

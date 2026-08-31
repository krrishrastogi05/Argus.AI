const { Server } = require('socket.io');

const { verifyToken } = require('../middleware/auth');
const { ROLES } = require('../models/enums');

// admins: all operators. user:<id>: the devices of one user.
const ROOMS = {
  admins: 'admins',
  user: (userId) => `user:${userId}`,
};

let io = null;

function attachRealtime(httpServer, { origins }) {
  io = new Server(httpServer, { cors: { origin: origins } });

  // ponytail: one instance only. For more, add @socket.io/redis-adapter here.

  // ponytail: the token is checked at connect only, not on each event.
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

// All server events. Each one sends only the changed document.
// Clients get a full snapshot again on reconnect.
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

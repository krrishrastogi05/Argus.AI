// All status and type strings that go into the database.

const ROLES = Object.freeze({
  CITIZEN: 'citizen',
  ADMIN: 'admin',
});

const INCIDENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  DISPATCHED: 'DISPATCHED',
  RESOLVED: 'RESOLVED',
});

const UNIT_STATUS = Object.freeze({
  IDLE: 'IDLE',
  BUSY: 'BUSY',
});

const UNIT_TYPES = Object.freeze(['POLICE', 'FIRE', 'MEDICAL']);

const REPORT_CHANNELS = Object.freeze(['SOCIAL', 'HELPLINE']);

module.exports = { INCIDENT_STATUS, REPORT_CHANNELS, ROLES, UNIT_STATUS, UNIT_TYPES };

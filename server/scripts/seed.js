// Makes the accounts, demo units and indexes. You can run it again safely.
//   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD     required, the command-centre login
//   SEED_CITIZEN_EMAIL / SEED_CITIZEN_PASSWORD optional demo citizen
const mongoose = require('mongoose');

const { connectDatabase } = require('../src/config/db');
require('../src/models/Advisory'); // registered so syncIndexes covers it
require('../src/models/Incident');
const ForceUnit = require('../src/models/ForceUnit');
const User = require('../src/models/User');
const { ROLES } = require('../src/models/enums');

const DEMO_UNITS = [
  { name: 'PCR-101', type: 'POLICE', coordinates: [28.6315, 77.2167] },
  { name: 'PCR-102', type: 'POLICE', coordinates: [28.5672, 77.2100] },
  { name: 'ENG-101', type: 'FIRE', coordinates: [28.6448, 77.2167] },
  { name: 'ENG-102', type: 'FIRE', coordinates: [28.5494, 77.2001] },
  { name: 'MED-101', type: 'MEDICAL', coordinates: [28.5672, 77.2410] },
  { name: 'MED-102', type: 'MEDICAL', coordinates: [28.6692, 77.2290] },
];

async function upsertUser({ name, email, password, role }) {
  await User.updateOne(
    { email: email.toLowerCase() },
    { $set: { name, role, passwordHash: await User.hashPassword(password) } },
    { upsert: true },
  );
  console.log(`  ${role.padEnd(7)} ${email}`);
}

async function seed() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_CITIZEN_EMAIL, SEED_CITIZEN_PASSWORD } = process.env;
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD');
  }

  await connectDatabase();

  // Build all indexes before the first request.
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));

  console.log('Users:');
  await upsertUser({ name: 'Command Centre', email: SEED_ADMIN_EMAIL, password: SEED_ADMIN_PASSWORD, role: ROLES.ADMIN });
  if (SEED_CITIZEN_EMAIL && SEED_CITIZEN_PASSWORD) {
    await upsertUser({ name: 'Demo Citizen', email: SEED_CITIZEN_EMAIL, password: SEED_CITIZEN_PASSWORD, role: ROLES.CITIZEN });
  }

  const ops = DEMO_UNITS.map(({ name, type, coordinates }) => ({
    updateOne: {
      filter: { name },
      update: { $setOnInsert: { name, type, location: ForceUnit.toPoint(coordinates) } },
      upsert: true,
    },
  }));
  const result = await ForceUnit.bulkWrite(ops);
  console.log(`Units: ${result.upsertedCount} created, ${DEMO_UNITS.length - result.upsertedCount} already present`);
}

seed()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

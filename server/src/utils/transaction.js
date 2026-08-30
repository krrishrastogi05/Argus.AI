const mongoose = require('mongoose');

// Runs `work(session)` as one ACID transaction: every write passed `session`
// commits together or not at all.
//
// withTransaction retries the whole callback on transient errors (e.g. a write
// conflict with a concurrent transaction), so `work` must only touch the
// database. Side effects like socket broadcasts belong *after* this resolves,
// otherwise clients could see a change that was later rolled back.
async function inTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { inTransaction };

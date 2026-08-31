const mongoose = require('mongoose');

// All writes that use `session` commit together, or none commit.
// withTransaction can run `work` again after a write conflict. Do not send
// socket events inside `work`; send them after the commit.
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

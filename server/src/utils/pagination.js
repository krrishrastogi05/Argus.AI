const { HttpError } = require('./httpError');

// Cursor pagination on (createdAt, _id), newest first.
// skip(N) reads and discards N rows, and new rows move the pages.
// A cursor continues after one exact row, with one index seek.

function encodeCursor(doc) {
  return Buffer.from(`${doc.createdAt.toISOString()}|${doc._id}`).toString('base64url');
}

function afterCursor(cursor) {
  if (!cursor) return {};

  const [iso, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const createdAt = new Date(iso);
  if (!id || Number.isNaN(createdAt.getTime())) throw new HttpError(400, 'Invalid cursor');

  return {
    $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: id } }],
  };
}

const NEWEST_FIRST = { createdAt: -1, _id: -1 };

module.exports = { NEWEST_FIRST, afterCursor, encodeCursor };

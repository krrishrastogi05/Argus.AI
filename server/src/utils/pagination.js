const { HttpError } = require('./httpError');

// Keyset ("cursor") pagination over (createdAt desc, _id desc).
//
// OFFSET pagination (skip N) makes the database walk and discard N documents,
// so page 1000 is slow, and rows shift when new incidents arrive mid-scroll.
// A cursor says "continue after this exact row": every page is one index seek,
// and inserts at the head never cause duplicates or gaps.

function encodeCursor(doc) {
  return Buffer.from(`${doc.createdAt.toISOString()}|${doc._id}`).toString('base64url');
}

// Returns the filter that selects rows strictly after the cursor row.
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

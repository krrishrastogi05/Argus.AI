const { z } = require('zod');

const { HttpError } = require('../utils/httpError');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a valid id');

// Validates and normalises req.body against a zod schema. Unknown keys are
// stripped, so clients can't smuggle fields like `role` or `status` through.
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue.path.join('.') || 'body';
      return next(new HttpError(400, `${field}: ${issue.message}`));
    }

    req.body = result.data;
    return next();
  };
}

module.exports = { objectId, validateBody };

// An error that maps directly to an HTTP response. Anything else that reaches
// the error handler is treated as an unexpected 500.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { HttpError };

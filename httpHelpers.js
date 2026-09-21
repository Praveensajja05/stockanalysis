// httpHelpers.js — tiny shared helpers used by both server.js and auth.js
// (kept in one place so the wrapper/error logic isn't duplicated per file).

// Wrap an async route so any thrown/rejected error goes to the central error
// handler instead of crashing the process.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Build an Error that carries an HTTP status, so the error handler can respond
// with the right code (400/401/403/404/...) instead of a blanket 500.
const httpError = (message, status) => {
  const e = new Error(message);
  e.status = status;
  return e;
};

module.exports = { asyncHandler, httpError };

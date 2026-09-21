// auth.js — registration, login, and the JWT-check middleware.
// Requires: npm install bcryptjs jsonwebtoken
// .env needs: JWT_SECRET=<a long random string>

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db/pool.js');
const { asyncHandler, httpError } = require('./httpHelpers.js');

const router = express.Router();
const SALT_ROUNDS = 10;

// The token carries only non-sensitive identifiers, never the password/hash.
function signToken(user) {
  return jwt.sign(
    { user_id: user.user_id, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// POST /auth/register
router.post('/auth/register', asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    throw httpError('username, email and password are required', 400);
  }

  // INTERVIEW: we store a bcrypt HASH, never the plain password. bcrypt salts
  // each hash (so two users with the same password get different hashes) and is
  // deliberately slow, which is what makes brute-forcing the stored hashes hard.
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  let result;
  try {
    result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING user_id, username, email',
      [username, email, password_hash]
    );
  } catch (err) {
    // 23505 = Postgres unique_violation (email or username already exists)
    if (err.code === '23505') throw httpError('username or email already taken', 409);
    throw err;
  }

  const user = result.rows[0];
  res.status(201).json({ user, token: signToken(user) });
}));

// POST /auth/login
router.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw httpError('email and password are required', 400);

  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];

  // INTERVIEW: same generic error whether the email is unknown OR the password
  // is wrong — so an attacker can't use the response to discover which emails
  // are registered (user enumeration).
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw httpError('invalid email or password', 401);
  }

  res.json({
    user: { user_id: user.user_id, username: user.username, email: user.email },
    token: signToken(user),
  });
}));

// Middleware: require a valid "Authorization: Bearer <token>" header.
// On success it attaches the decoded payload to req.user so downstream routes
// know who is calling without trusting anything in the request body.
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(httpError('missing auth token', 401));
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(httpError('invalid or expired token', 401));
  }
}

module.exports = { router, authenticate };

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

const router = express.Router();

function makeToken(user) {
  return jwt.sign(
    { id: user.id, uptime_user_id: user.uptime_user_id },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// POST /auth/register
router.post('/register', async (req, res) => {
  const { uptime_user_id, full_name, email, password } = req.body;
  if (!uptime_user_id || !password) {
    return res.status(400).json({ error: 'uptime_user_id and password are required' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      `INSERT INTO users (uptime_user_id, full_name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, uptime_user_id, full_name, email, next_jump_number, created_at`,
      [uptime_user_id, full_name || null, email || null, hash]
    );
    const user = rows[0];
    res.status(201).json({ user, token: makeToken(user) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'User already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { uptime_user_id, password } = req.body;
  if (!uptime_user_id || !password) {
    return res.status(400).json({ error: 'uptime_user_id and password are required' });
  }
  try {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE uptime_user_id = $1',
      [uptime_user_id]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const { password_hash, ...safe } = user;
    res.json({ user: safe, token: makeToken(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

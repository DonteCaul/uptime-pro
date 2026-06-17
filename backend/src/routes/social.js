const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET /social/leaderboard?period=day|month|year|all
router.get('/leaderboard', requireAuth, async (req, res) => {
  const period = req.query.period || 'all';
  const periodFilter = {
    day:   `AND j.jumped_at >= CURRENT_DATE`,
    month: `AND j.jumped_at >= DATE_TRUNC('month', NOW())`,
    year:  `AND j.jumped_at >= DATE_TRUNC('year', NOW())`,
    all:   '',
  }[period] || '';

  try {
    const { rows: jumps } = await db.query(
      `SELECT u.id, u.full_name, u.avatar_path, COUNT(j.id)::int AS jump_count
       FROM users u
       JOIN jumps j ON j.user_id = u.id
       WHERE u.is_public = true AND j.discipline_id IS DISTINCT FROM 'Rode the plane down' ${periodFilter}
       GROUP BY u.id, u.full_name, u.avatar_path
       ORDER BY jump_count DESC
       LIMIT 20`,
      []
    );

    // Most DZs visited (distinct GPS cells rounded to 1dp = ~11km grid)
    const { rows: dzRows } = await db.query(
      `SELECT u.id, u.full_name, u.avatar_path,
              COUNT(DISTINCT ROUND(j.dz_lat::numeric,1)::text || ',' || ROUND(j.dz_lon::numeric,1)::text)::int AS dz_count
       FROM users u
       JOIN jumps j ON j.user_id = u.id
       WHERE u.is_public = true AND j.dz_lat IS NOT NULL AND j.dz_lon IS NOT NULL
       GROUP BY u.id, u.full_name, u.avatar_path
       ORDER BY dz_count DESC
       LIMIT 20`,
      []
    );

    // Most jumps by discipline
    const { rows: discRows } = await db.query(
      `SELECT u.id, u.full_name, u.avatar_path,
              j.discipline_id,
              COUNT(j.id)::int AS jump_count
       FROM users u
       JOIN jumps j ON j.user_id = u.id
       WHERE u.is_public = true AND j.discipline_id IS NOT NULL AND j.discipline_id IS DISTINCT FROM 'Rode the plane down'
       GROUP BY u.id, u.full_name, u.avatar_path, j.discipline_id
       ORDER BY jump_count DESC
       LIMIT 50`,
      []
    );

    // Home DZs of public users
    const { rows: homeDzRows } = await db.query(
      `SELECT id, full_name, avatar_path, home_dz, home_dz_lat, home_dz_lon
       FROM users
       WHERE is_public = true AND home_dz_lat IS NOT NULL AND home_dz_lon IS NOT NULL`,
      []
    );

    res.json({ jumps, dzs: dzRows, disciplines: discRows, homeDzs: homeDzRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /social/home-dzs — public user home DZ locations (no auth required for map embed later)
router.get('/home-dzs', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, full_name, home_dz, home_dz_lat, home_dz_lon
       FROM users WHERE is_public = true AND home_dz_lat IS NOT NULL`,
      []
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

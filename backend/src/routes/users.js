const express = require('express');
const bcrypt  = require('bcryptjs');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.env.UPLOAD_DIR || './uploads', 'avatars');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${req.user.id}${ext}`);
  },
});
const uploadAvatar = multer({ storage: avatarStorage, limits: { fileSize: 5 * 1024 * 1024 } });

const PROFILE_FIELDS = [
  'full_name','email','next_jump_number',
  'bio','home_dz','home_dz_lat','home_dz_lon',
  'uspa_license','uspa_member_number','burble_name','ratings',
  'canopy_size','wing_load','rig_type','canopy_type',
  'reserve_repack_date','is_public',
];

// GET /users/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, uptime_user_id, full_name, email, next_jump_number,
              bio, home_dz, home_dz_lat, home_dz_lon, avatar_path,
              uspa_license, uspa_member_number, burble_name, ratings,
              canopy_size, wing_load, rig_type, canopy_type,
              reserve_repack_date, is_public, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /users/me
router.patch('/me', requireAuth, async (req, res) => {
  const { password, ...rest } = req.body;
  try {
    let hash;
    if (password) hash = await bcrypt.hash(password, 12);

    const { rows } = await db.query(
      `UPDATE users SET
        full_name            = COALESCE($1,  full_name),
        email                = COALESCE($2,  email),
        password_hash        = COALESCE($3,  password_hash),
        next_jump_number     = COALESCE($4,  next_jump_number),
        bio                  = COALESCE($5,  bio),
        home_dz              = COALESCE($6,  home_dz),
        home_dz_lat          = COALESCE($7,  home_dz_lat),
        home_dz_lon          = COALESCE($8,  home_dz_lon),
        uspa_license         = COALESCE($9,  uspa_license),
        uspa_member_number   = COALESCE($10, uspa_member_number),
        burble_name          = COALESCE($11, burble_name),
        ratings              = COALESCE($12, ratings),
        canopy_size          = COALESCE($13, canopy_size),
        wing_load            = COALESCE($14, wing_load),
        rig_type             = COALESCE($15, rig_type),
        canopy_type          = COALESCE($16, canopy_type),
        reserve_repack_date  = COALESCE($17, reserve_repack_date),
        is_public            = COALESCE($18, is_public),
        updated_at           = NOW()
       WHERE id = $19
       RETURNING id, uptime_user_id, full_name, email, next_jump_number,
                 bio, home_dz, home_dz_lat, home_dz_lon, avatar_path,
                 uspa_license, uspa_member_number, burble_name, ratings,
                 canopy_size, wing_load, rig_type, canopy_type,
                 reserve_repack_date, is_public, updated_at`,
      [
        rest.full_name ?? null, rest.email ?? null, hash ?? null,
        rest.next_jump_number ?? null,
        rest.bio ?? null, rest.home_dz ?? null,
        rest.home_dz_lat ?? null, rest.home_dz_lon ?? null,
        rest.uspa_license ?? null, rest.uspa_member_number ?? null,
        rest.burble_name ?? null, rest.ratings ?? null,
        rest.canopy_size ?? null, rest.wing_load ?? null,
        rest.rig_type ?? null, rest.canopy_type ?? null,
        rest.reserve_repack_date ?? null,
        rest.is_public ?? null,
        req.user.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /users/me/avatar
router.post('/me/avatar', requireAuth, uploadAvatar.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const avatarPath = `/uploads/avatars/${req.file.filename}`;
  try {
    await db.query('UPDATE users SET avatar_path = $1 WHERE id = $2', [avatarPath, req.user.id]);
    res.json({ avatar_path: avatarPath });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /users/me/stats
router.get('/me/stats', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `WITH base AS (
         SELECT
           id,
           jumped_at,
           exit_altitude_m,
           max_freefall_speed_ms,
           freefall_duration_s,
           discipline_id
         FROM jumps
         WHERE user_id = $1
       ),
       agg AS (
         SELECT
           COUNT(*)                                                                        AS total_jumps,
           COUNT(*) FILTER (WHERE jumped_at IS NOT NULL)                                  AS jumps_with_data,
           MAX(exit_altitude_m)       FILTER (WHERE discipline_id IS DISTINCT FROM 'Rode the plane down') AS highest_exit_m,
           MAX(max_freefall_speed_ms) FILTER (WHERE discipline_id IS DISTINCT FROM 'Rode the plane down') AS fastest_freefall_ms,
           SUM(freefall_duration_s)   FILTER (WHERE discipline_id IS DISTINCT FROM 'Rode the plane down') AS total_freefall_s,
           MIN(jumped_at)                                                                 AS first_jump_at,
           MAX(jumped_at)                                                                 AS last_jump_at
         FROM base
       ),
       highest_exit AS (
         SELECT id
         FROM base
         WHERE discipline_id IS DISTINCT FROM 'Rode the plane down'
         ORDER BY exit_altitude_m DESC NULLS LAST
         LIMIT 1
       ),
       fastest_freefall AS (
         SELECT id
         FROM base
         WHERE discipline_id IS DISTINCT FROM 'Rode the plane down'
         ORDER BY max_freefall_speed_ms DESC NULLS LAST
         LIMIT 1
       )
       SELECT
         agg.*,
         highest_exit.id   AS highest_exit_jump_id,
         fastest_freefall.id AS fastest_freefall_jump_id
       FROM agg
       LEFT JOIN highest_exit   ON true
       LEFT JOIN fastest_freefall ON true`,
      [req.user.id]
    );
    res.set('Cache-Control', 'private, max-age=60');
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

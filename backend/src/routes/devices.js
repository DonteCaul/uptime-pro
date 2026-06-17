const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// GET /devices — list devices associated with this user
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT d.id, d.device_id, d.device_type, d.hardware_serial,
              d.firmware_version, d.last_seen_at, d.created_at,
              COUNT(j.id) AS jump_count
       FROM devices d
       LEFT JOIN jumps j ON j.device_id = d.id AND j.user_id = $1
       WHERE d.current_user_id = $1
       GROUP BY d.id
       ORDER BY d.last_seen_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /devices — register or update a device
router.post('/', requireAuth, async (req, res) => {
  const { device_id, device_type, hardware_serial, firmware_version, timezone_offset } = req.body;
  if (!device_id) return res.status(400).json({ error: 'device_id is required' });
  try {
    const { rows } = await db.query(
      `INSERT INTO devices (device_id, device_type, hardware_serial, firmware_version,
                            timezone_offset, current_user_id, last_seen_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (device_id) DO UPDATE SET
         device_type      = COALESCE($2, devices.device_type),
         hardware_serial  = COALESCE($3, devices.hardware_serial),
         firmware_version = COALESCE($4, devices.firmware_version),
         timezone_offset  = COALESCE($5, devices.timezone_offset),
         current_user_id  = $6,
         last_seen_at     = NOW()
       RETURNING *`,
      [device_id, device_type, hardware_serial, firmware_version, timezone_offset, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /devices/:deviceId/jumps — all jumps from a specific device
router.get('/:deviceId/jumps', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT j.id, j.filename, j.jumped_at, j.exit_altitude_m,
              j.freefall_duration_s, j.max_freefall_speed_ms, j.jump_number
       FROM jumps j
       JOIN devices d ON d.id = j.device_id
       WHERE d.device_id = $1 AND j.user_id = $2
       ORDER BY j.jumped_at DESC`,
      [req.params.deviceId, req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

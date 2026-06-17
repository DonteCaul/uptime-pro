const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const requireAuth = require('../middleware/auth');
const { parseJumpCSV } = require('../utils/csvParser');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(process.env.UPLOAD_DIR || './uploads', String(req.user.id));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.originalname.endsWith('.csv')) {
      return cb(new Error('Only .csv files are accepted'));
    }
    cb(null, true);
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// POST /jumps/upload — upload one or more jump CSV files
router.post('/upload', requireAuth, upload.array('files[]', 50), async (req, res) => {
  if (!req.files || !req.files.length) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const results = [];
  const client = await db.pool.connect();

  try {
    for (const file of req.files) {
      try {
        await client.query('BEGIN');

        const buffer = fs.readFileSync(file.path);
        const { meta, rows } = parseJumpCSV(buffer);

        // Extract device_id, action type, and jump timestamp from filename:
        // action_<deviceId>_<date>_<time>-<actionTypeId>.csv
        const match = file.originalname.match(/action_(\d+)_(\d{8})_(\d{4})-(\d+)/);
        const deviceId     = match ? parseInt(match[1]) : null;
        const actionTypeId = match ? parseInt(match[4]) : null;

        // Map Dekunu action type IDs to discipline strings
        const ACTION_TYPE_DISCIPLINE = {
          240: 'Belly / RW',   // standard skydive
          300: 'BASE',
        };
        const discipline = actionTypeId ? (ACTION_TYPE_DISCIPLINE[actionTypeId] || null) : null;

        // Upsert device record
        let dbDeviceId = null;
        if (deviceId) {
          const dev = await client.query(
            `INSERT INTO devices (device_id, last_seen_at, current_user_id)
             VALUES ($1, NOW(), $2)
             ON CONFLICT (device_id) DO UPDATE SET last_seen_at = NOW(), current_user_id = $2
             RETURNING id`,
            [deviceId, req.user.id]
          );
          dbDeviceId = dev.rows[0].id;
        }

        // Check for duplicate (same user + filename)
        const existing = await client.query(
          'SELECT id FROM jumps WHERE user_id = $1 AND filename = $2',
          [req.user.id, file.originalname]
        );
        if (existing.rows.length) {
          await client.query('ROLLBACK');
          results.push({ file: file.originalname, status: 'duplicate', jump_id: existing.rows[0].id });
          continue;
        }

        const { rows: jumpRows } = await client.query(
          `INSERT INTO jumps
             (user_id, device_id, filename, jumped_at, exit_altitude_m, deployment_altitude_m,
              freefall_duration_s, max_freefall_speed_ms, canopy_duration_s,
              exit_lat, exit_lon, landing_lat, landing_lon, dz_lat, dz_lon,
              raw_file_path, row_count, action_type_id, discipline_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           RETURNING id`,
          [
            req.user.id, dbDeviceId, file.originalname,
            meta.jumped_at, meta.exit_altitude_m, meta.deployment_altitude_m,
            meta.freefall_duration_s, meta.max_freefall_speed_ms, meta.canopy_duration_s,
            meta.exit_lat, meta.exit_lon, meta.landing_lat, meta.landing_lon,
            meta.dz_lat, meta.dz_lon,
            file.path, meta.row_count, actionTypeId, discipline,
          ]
        );
        const jumpId = jumpRows[0].id;

        // Bulk insert sensor rows in batches of 200 to stay under pg's 65535 param limit
        if (rows.length) {
          const cols = Object.keys(rows[0]);
          const BATCH = 200;
          for (let start = 0; start < rows.length; start += BATCH) {
            const batch = rows.slice(start, start + BATCH);
            const values = [];
            const placeholders = batch.map((row, i) => {
              const base = i * (cols.length + 1);
              cols.forEach((col) => values.push(row[col] ?? null));
              values.push(jumpId);
              return `(${Array.from({ length: cols.length + 1 }, (_, j) => `$${base + j + 1}`).join(',')})`;
            });
            await client.query(
              `INSERT INTO jump_data_points (${cols.join(',')}, jump_id) VALUES ${placeholders.join(',')}`,
              values
            );
          }
        }

        await client.query('COMMIT');
        results.push({ file: file.originalname, status: 'created', jump_id: jumpId, ...meta });
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Failed to process ${file.originalname}:`, err.message);
        results.push({ file: file.originalname, status: 'error', error: err.message });
      }
    }

    res.status(207).json({ uploaded: results.filter((r) => r.status === 'created').length, results });
  } finally {
    client.release();
  }
});

// GET /jumps — list jumps with pagination
router.get('/', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 1000);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const { rows } = await db.query(
      `SELECT id, filename, jumped_at, exit_altitude_m, deployment_altitude_m,
              freefall_duration_s, max_freefall_speed_ms, canopy_duration_s,
              exit_lat, exit_lon, landing_lat, landing_lon, dz_lat, dz_lon, action_type_id,
              discipline_id, jump_number, notes, row_count, created_at
       FROM jumps WHERE user_id = $1
       ORDER BY jumped_at DESC NULLS LAST, created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    const total = await db.query('SELECT COUNT(*) FROM jumps WHERE user_id = $1', [req.user.id]);
    res.json({ total: parseInt(total.rows[0].count), limit, offset, jumps: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /jumps/:id — single jump with metadata + prev/next IDs
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT j.*,
        LAG(j.id)  OVER (ORDER BY j.jumped_at DESC NULLS LAST, j.created_at DESC) AS next_id,
        LEAD(j.id) OVER (ORDER BY j.jumped_at DESC NULLS LAST, j.created_at DESC) AS prev_id
       FROM jumps j
       WHERE j.user_id = $1`,
      [req.user.id]
    );
    const row = rows.find(r => String(r.id) === String(req.params.id));
    if (!row) return res.status(404).json({ error: 'Jump not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /jumps/:id/track — full sensor data for replaying/mapping
router.get('/:id/track', requireAuth, async (req, res) => {
  try {
    const jump = await db.query(
      'SELECT id FROM jumps WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!jump.rows[0]) return res.status(404).json({ error: 'Jump not found' });

    const { rows } = await db.query(
      `SELECT sample_ms, device_mode, gps_lat, gps_lon, gps_altitude_m, altitude_m,
              altitude_above_ground_m, ground_level_m, inst_vert_speed_ms, gps_speed_knot,
              gps_angle_deg, compass_angle, accel_x, accel_y, accel_z,
              temperature_c, batt_perc
       FROM jump_data_points WHERE jump_id = $1 ORDER BY sample_ms`,
      [req.params.id]
    );
    res.json({ jump_id: req.params.id, points: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /jumps/:id — update notes, discipline, jump number
router.patch('/:id', requireAuth, async (req, res) => {
  const { notes, discipline_id, action_type_id, jump_number } = req.body;
  try {
    const { rows } = await db.query(
      `UPDATE jumps SET
         notes          = COALESCE($1, notes),
         discipline_id  = COALESCE($2, discipline_id),
         action_type_id = COALESCE($3, action_type_id),
         jump_number    = COALESCE($4, jump_number)
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [notes, discipline_id, action_type_id, jump_number, req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Jump not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /jumps/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'DELETE FROM jumps WHERE id = $1 AND user_id = $2 RETURNING id, raw_file_path',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Jump not found' });
    // Optionally remove uploaded file
    if (rows[0].raw_file_path && fs.existsSync(rows[0].raw_file_path)) {
      fs.unlinkSync(rows[0].raw_file_path);
    }
    res.json({ deleted: rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

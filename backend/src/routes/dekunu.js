/**
 * Dekunu Device Compatibility Layer
 *
 * Emulates api.dekunu.cloud/v1/ so physical Dekunu devices can sync to this server.
 * To use: point api.dekunu.cloud to this server via DNS (router/hosts file).
 *
 * Enable/disable with DEKUNU_COMPAT=true|false in .env
 *
 * Endpoints reverse-engineered from device syslogs:
 *   GET  /v1/getSecurityToken2/:userId/:hwCode/:hwSerial
 *   GET  /v1/getUserProfile/:token
 *   GET  /v1/actionTypes/:token
 *   GET  /v1/getJumpLogStatus/:userId/:filename/:token
 *   GET  /v1/getDzWeather/:dzId/:token
 *   POST /v1/addDeviceStatus/:flag/:deviceId
 *   POST /v1/checkDeviceStatus/:token
 *   POST /v1/addJumpLog/:flag/:deviceId/:token  (multipart CSV)
 *   POST /v1/uploadFile/:filename/:flag/:token  (multipart JSON summary)
 */

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const db       = require('../db');
const { parseJumpCSV } = require('../utils/csvParser');

const router = express.Router();

// ── Middleware: guard the whole v1 router behind the feature flag ─────────────
router.use((req, res, next) => {
  if (!global.dekunuCompatEnabled) {
    return res.status(404).json({ error: 'Not found' });
  }
  console.log(`[DEKUNU] ${req.method} ${req.originalUrl}`);
  next();
});

// ── JWT helpers ───────────────────────────────────────────────────────────────
const SECRET = () => process.env.JWT_SECRET;

function makeDekunuToken(userId, deviceId) {
  return jwt.sign(
    { userId, deviceId },
    SECRET(),
    { expiresIn: '7d' }
  );
}

function verifyDekunuToken(token) {
  try {
    return jwt.verify(token, SECRET());
  } catch {
    return null;
  }
}

// ── Multer: store uploads in a temp dir, process then move ───────────────────
const tmpStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/_dekunu_tmp');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname || `upload_${Date.now()}`),
});
const upload = multer({ storage: tmpStorage, limits: { fileSize: 100 * 1024 * 1024 } });

// ── Helper: resolve dekunuUserId → internal user ──────────────────────────────
async function findUserByDekunuId(dekunuUserId) {
  const { rows } = await db.query(
    'SELECT * FROM users WHERE uptime_user_id = $1',
    [parseInt(dekunuUserId)]
  );
  return rows[0] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/getSecurityToken2/:userId/:hwCode/:hwSerial
//   userId   = Dekunu user ID (e.g. 469)
//   hwCode   = hardware code (ignored — we don't validate it)
//   hwSerial = chip serial bytes (ignored — we don't validate it)
//
// Returns: {"message":"Success","token":"<JWT>"}
// ─────────────────────────────────────────────────────────────────────────────
router.get('/getSecurityToken2/:userId/:hwCode/:hwSerial', async (req, res) => {
  const { userId, hwSerial } = req.params;
  try {
    const user = await findUserByDekunuId(userId);
    if (!user) {
      console.warn(`[DEKUNU] getSecurityToken2: unknown user ${userId}`);
      // Return a token anyway — device will store it and use it for uploads.
      // This lets devices whose owner hasn't registered yet still get a token.
      const token = makeDekunuToken(parseInt(userId), 0);
      return res.json({ message: 'Success', token });
    }

    // Upsert device record using hwSerial as a fingerprint
    const deviceSerial = hwSerial || 'unknown';
    const dev = await db.query(
      `INSERT INTO devices (device_id, last_seen_at, current_user_id)
       VALUES ($1, NOW(), $2)
       ON CONFLICT (device_id) DO UPDATE SET last_seen_at = NOW(), current_user_id = $2
       RETURNING id`,
      [deviceSerial.replace(/,/g, '-'), user.id]
    );

    const token = makeDekunuToken(user.uptime_user_id, dev.rows[0].id);
    res.json({ message: 'Success', token });
  } catch (err) {
    console.error('[DEKUNU] getSecurityToken2 error:', err.message);
    res.status(500).json({ message: 'Error', error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/getUserProfile/:token
// Returns the userProfile JSON the device stores locally
// ─────────────────────────────────────────────────────────────────────────────
router.get('/getUserProfile/:token', async (req, res) => {
  const payload = verifyDekunuToken(req.params.token);
  if (!payload) return res.status(401).json({ message: 'Invalid token' });

  try {
    const user = await findUserByDekunuId(payload.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const stats = await db.query(
      `SELECT COUNT(*) AS total,
              SUM(freefall_duration_s) AS total_freefall_s,
              MAX(max_freefall_speed_ms) AS fastest_ms,
              MAX(jumped_at) AS last_jump
       FROM jumps WHERE user_id = $1`,
      [user.id]
    );
    const s = stats.rows[0];

    res.json({
      dekunuUserId:    user.uptime_user_id,
      fullname:        user.full_name || '',
      nickname:        user.full_name || '',
      email:           user.email || '',
      token:           req.params.token,
      jumpStats: {
        totalJumpCount:      parseInt(s.total) || 0,
        totalFreefallSecs:   Math.round(parseFloat(s.total_freefall_s) || 0),
        fastestVertical:     s.fastest_ms ? (parseFloat(s.fastest_ms) * 3.6).toFixed(1) : '0',
        lastDeviceJumpDate:  s.last_jump || new Date().toISOString(),
      },
      syncStatus: {
        allJumpsSynced: true,
        jumpLogsNotSynced: 0,
      },
      fileStatus: {
        formatVer:   2,
        profileVer:  1,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[DEKUNU] getUserProfile error:', err.message);
    res.status(500).json({ message: 'Error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/actionTypes/:token
// Device fetches action type definitions — return the known set
// ─────────────────────────────────────────────────────────────────────────────
router.get('/actionTypes/:token', (req, res) => {
  const payload = verifyDekunuToken(req.params.token);
  if (!payload) return res.status(401).json({ message: 'Invalid token' });

  res.json({
    actionTypes: [
      { id: 240, name: 'Skydive',    description: 'Standard skydive' },
      { id: 300, name: 'BASE',       description: 'BASE jump' },
      { id: 310, name: 'Wingsuit BASE', description: 'Wingsuit BASE jump' },
    ],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/getJumpLogStatus/:userId/:filename/:token
// Device checks if a log file already exists on the server before uploading
// ─────────────────────────────────────────────────────────────────────────────
router.get('/getJumpLogStatus/:userId/:filename/:token', async (req, res) => {
  const payload = verifyDekunuToken(req.params.token);
  if (!payload) return res.status(401).json({ message: 'Invalid token' });

  try {
    const user = await findUserByDekunuId(req.params.userId);
    if (!user) return res.json({ jumpLogOnServer: false });

    const { rows } = await db.query(
      'SELECT id FROM jumps WHERE user_id = $1 AND filename = $2',
      [user.id, req.params.filename]
    );
    res.json({ jumpLogOnServer: rows.length > 0 });
  } catch (err) {
    console.error('[DEKUNU] getJumpLogStatus error:', err.message);
    res.json({ jumpLogOnServer: false });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /v1/getDzWeather/:dzId/:token
// Return a minimal weather stub — the device will display it
// ─────────────────────────────────────────────────────────────────────────────
router.get('/getDzWeather/:dzId/:token', (req, res) => {
  res.json({ success: true, weather: null });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/addDeviceStatus/:flag/:deviceId
// Periodic heartbeat from device — just acknowledge
// ─────────────────────────────────────────────────────────────────────────────
router.post('/addDeviceStatus/:flag/:deviceId', (req, res) => {
  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/checkDeviceStatus/:token
// Device checks if firmware updates are needed — tell it everything is current
// ─────────────────────────────────────────────────────────────────────────────
router.post('/checkDeviceStatus/:token', (req, res) => {
  const payload = verifyDekunuToken(req.params.token);
  if (!payload) return res.status(401).json({ message: 'Invalid token' });

  res.json({
    firmwareUpdateRequired:    false,
    espFirmwareUpdateRequired: false,
    bootloaderUpdateRequired:  false,
    resPackUpdateRequired:     false,
    serialNumMatch:            true,
    isMilitaryDevice:          false,
    latestSysConfigVer:        '1.0.0',
    latestQuotesVer:           '1.0.0',
    latestPlaneAlertsVer:      '1.0.0',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/addJumpLog/:flag/:deviceId/:token  (multipart, field: jumplogcsv)
// Query params: filename, gzip, actionTypeId, disciplineTypeId, userJumpNum, etc.
//
// The device sends the CSV gzip-compressed. We decompress, parse, and insert.
// Returns: {"success":true,"message":"Log received for user X. Checksum match success.","checksum":"<sha1>"}
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/addJumpLog/:flag/:deviceId/:token',
  upload.single('jumplogcsv'),
  async (req, res) => {
    const payload = verifyDekunuToken(req.params.token);
    if (!payload) return res.status(401).json({ message: 'Invalid token' });

    const filename = req.query.filename;
    if (!filename || !req.file) {
      return res.status(400).json({ success: false, message: 'Missing file or filename' });
    }

    try {
      const user = await findUserByDekunuId(payload.userId);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      // Read uploaded bytes (may be gzip-compressed)
      let buffer = fs.readFileSync(req.file.path);
      if (req.query.gzip === 'true') {
        const zlib = require('zlib');
        buffer = zlib.gunzipSync(buffer);
      }

      // SHA1 checksum for the response (matches what the real server sent)
      const checksum = crypto.createHash('sha1').update(buffer).digest('hex');

      // Check for duplicate
      const existing = await db.query(
        'SELECT id FROM jumps WHERE user_id = $1 AND filename = $2',
        [user.id, filename]
      );
      if (existing.rows.length) {
        fs.unlinkSync(req.file.path);
        return res.json({
          success: true,
          message: `Log received for user ${payload.userId}. Checksum match success.`,
          checksum,
        });
      }

      // Parse CSV and insert
      const { meta, rows } = parseJumpCSV(buffer);

      const match = filename.match(/action_(\d+)_(\d{8})_(\d{4})-(\d+)/);
      const actionTypeId = match ? parseInt(match[4]) : null;
      const ACTION_TYPE_DISCIPLINE = { 240: 'Belly / RW', 300: 'BASE' };
      const discipline = actionTypeId ? (ACTION_TYPE_DISCIPLINE[actionTypeId] || null) : null;

      // Resolve device db id
      let dbDeviceId = null;
      const devRow = await db.query(
        'SELECT id FROM devices WHERE current_user_id = $1 ORDER BY last_seen_at DESC LIMIT 1',
        [user.id]
      );
      if (devRow.rows.length) dbDeviceId = devRow.rows[0].id;

      // Save file to permanent uploads dir
      const destDir = path.join(__dirname, '../../uploads', String(user.id));
      fs.mkdirSync(destDir, { recursive: true });
      const destPath = path.join(destDir, filename);
      fs.writeFileSync(destPath, buffer);
      fs.unlinkSync(req.file.path);

      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: jumpRows } = await client.query(
          `INSERT INTO jumps
             (user_id, device_id, filename, jumped_at, exit_altitude_m, deployment_altitude_m,
              freefall_duration_s, max_freefall_speed_ms, canopy_duration_s,
              exit_lat, exit_lon, landing_lat, landing_lon, dz_lat, dz_lon,
              raw_file_path, row_count, action_type_id, discipline_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           RETURNING id`,
          [
            user.id, dbDeviceId, filename,
            meta.jumped_at, meta.exit_altitude_m, meta.deployment_altitude_m,
            meta.freefall_duration_s, meta.max_freefall_speed_ms, meta.canopy_duration_s,
            meta.exit_lat, meta.exit_lon, meta.landing_lat, meta.landing_lon,
            meta.dz_lat, meta.dz_lon,
            destPath, meta.row_count, actionTypeId, discipline,
          ]
        );
        const jumpId = jumpRows[0].id;

        if (rows.length) {
          const cols = Object.keys(rows[0]);
          const BATCH = 200;
          for (let start = 0; start < rows.length; start += BATCH) {
            const batch = rows.slice(start, start + BATCH);
            const values = [];
            const placeholders = batch.map((row, i) => {
              const base = i * (cols.length + 1);
              cols.forEach(col => values.push(row[col] ?? null));
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
        console.log(`[DEKUNU] Jump saved: ${filename} → jump #${jumpId} for user ${user.id}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      res.json({
        success: true,
        message: `Log received for user ${payload.userId}. Checksum match success.`,
        checksum,
      });
    } catch (err) {
      console.error('[DEKUNU] addJumpLog error:', err.message);
      if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /v1/uploadFile/:filename/:flag/:token  (multipart, field: jumpsumjson)
// Stage 2: device uploads the JSON summary file
// Returns: {"success":true,"actionId":<number>}
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/uploadFile/:filename/:flag/:token',
  upload.single('jumpsumjson'),
  async (req, res) => {
    const payload = verifyDekunuToken(req.params.token);
    if (!payload) return res.status(401).json({ message: 'Invalid token' });

    try {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      // Look up the jump ID to return as actionId
      const user = await findUserByDekunuId(payload.userId);
      const csvFilename = req.params.filename.replace('.json', '.csv');
      let actionId = Math.floor(Math.random() * 9000000) + 1000000;

      if (user) {
        const { rows } = await db.query(
          'SELECT id FROM jumps WHERE user_id = $1 AND filename = $2',
          [user.id, csvFilename]
        );
        if (rows.length) actionId = rows[0].id;
      }

      console.log(`[DEKUNU] uploadFile (summary): ${req.params.filename} → actionId ${actionId}`);
      res.json({ success: true, actionId });
    } catch (err) {
      console.error('[DEKUNU] uploadFile error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Catch-all: log any unhandled v1 requests so we can identify missing endpoints
// ─────────────────────────────────────────────────────────────────────────────
router.all('*', (req, res) => {
  console.warn(`[DEKUNU] Unhandled: ${req.method} ${req.originalUrl}`);
  res.json({ success: true, message: 'ok' });
});

module.exports = router;

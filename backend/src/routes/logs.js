const express = require('express');
const multer = require('multer');
const db = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// POST /logs/upload — upload syslog or esp32 log files
router.post('/upload', requireAuth, upload.array('files[]', 50), async (req, res) => {
  if (!req.files || !req.files.length) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const { device_id } = req.body;
  let dbDeviceId = null;

  if (device_id) {
    const dev = await db.query('SELECT id FROM devices WHERE device_id = $1', [device_id]);
    dbDeviceId = dev.rows[0]?.id || null;
  }

  const results = [];
  for (const file of req.files) {
    // Parse filename: syslog.N.txt or syslog_esp32.N.txt
    const match = file.originalname.match(/^(syslog(?:_esp32)?)(?:\.(\d+))?\.txt(?:\.last)?$/);
    const source = match ? match[1] : 'syslog';
    const logNum = match && match[2] ? parseInt(match[2]) : null;

    await db.query(
      `INSERT INTO system_logs (device_id, user_id, log_source, log_number, content)
       VALUES ($1, $2, $3, $4, $5)`,
      [dbDeviceId, req.user.id, source, logNum, file.buffer.toString('utf8')]
    );
    results.push({ file: file.originalname, source, log_number: logNum });
  }

  res.status(201).json({ uploaded: results.length, results });
});

// GET /logs — list system logs for this user
router.get('/', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const { rows } = await db.query(
      `SELECT id, device_id, log_source, log_number, uploaded_at,
              LEFT(content, 200) AS content_preview
       FROM system_logs WHERE user_id = $1
       ORDER BY uploaded_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /logs/:id — full log content
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM system_logs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Log not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

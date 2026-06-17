const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');

const authRoutes   = require('./routes/auth');
const userRoutes   = require('./routes/users');
const jumpRoutes   = require('./routes/jumps');
const deviceRoutes = require('./routes/devices');
const logRoutes    = require('./routes/logs');
const socialRoutes = require('./routes/social');
const placesRoutes = require('./routes/places');
const dekunuRoutes = require('./routes/dekunu');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

app.use('/uploads/avatars', express.static(path.join(__dirname, '../uploads/avatars')));
app.use('/auth',    authRoutes);
app.use('/users',   userRoutes);
app.use('/jumps',   jumpRoutes);
app.use('/devices', deviceRoutes);
app.use('/logs',    logRoutes);
app.use('/social',  socialRoutes);
app.use('/places',  placesRoutes);

// Dekunu device compatibility layer — toggle via UI or DEKUNU_COMPAT=true in .env
// Runtime state lives here so the UI can flip it without a restart
global.dekunuCompatEnabled = process.env.DEKUNU_COMPAT === 'true';
app.use('/v1', dekunuRoutes);

const requireAuth = require('./middleware/auth');
app.get('/admin/dekunu-compat', requireAuth, (req, res) => {
  res.json({ enabled: global.dekunuCompatEnabled });
});
app.post('/admin/dekunu-compat', requireAuth, (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be boolean' });
  global.dekunuCompatEnabled = enabled;
  console.log(`[DEKUNU] Compat layer ${enabled ? 'ENABLED' : 'DISABLED'} by user ${req.user.id}`);
  res.json({ enabled: global.dekunuCompatEnabled });
});

console.log(`Dekunu compat layer: ${global.dekunuCompatEnabled ? 'ENABLED' : 'DISABLED'}`);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`UpTime.Pro backend running on port ${PORT}`));

module.exports = app;

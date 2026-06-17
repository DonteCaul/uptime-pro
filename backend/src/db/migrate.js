require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./index');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await db.query(sql);
    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    console.error('DATABASE_URL set:', !!process.env.DATABASE_URL);
    // Don't exit — let the app start so we can read logs via the API
  } finally {
    await db.pool.end();
  }
}

migrate();

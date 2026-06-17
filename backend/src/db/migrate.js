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
    console.error('DATABASE_URL:', process.env.DATABASE_URL ? 'set' : 'NOT SET');
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

migrate();

const fs = require('fs');
const path = require('path');
const { getPool } = require('./db');

async function initializeDatabase() {
  try {
    const pool = await getPool();
    const initSQL = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');

    // Join all non-comment lines and split by semicolons to get individual statements
    const cleaned = initSQL
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('--'))
      .join(' ');

    const statements = cleaned
      .split(';')
      .map(s => s.trim())
      .filter(s => s);

    for (const stmt of statements) {
      if (!stmt) continue;
      try {
        await pool.request().query(stmt);
      } catch (err) {
        const msg = err.message || '';
        const isExpected =
          msg.includes('already an object') ||
          msg.includes('already exists') ||
          msg.includes('duplicate key') ||
          msg.includes('Cannot insert duplicate') ||
          msg.includes('Violation of UNIQUE') ||
          msg.includes('There is already an object');
        if (!isExpected) {
          console.warn('DB Init warning:', msg.substring(0, 200));
        }
      }
    }

    console.log('✅ Database initialized successfully');
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
    throw err;
  }
}

module.exports = { initializeDatabase };

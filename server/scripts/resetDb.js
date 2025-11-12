const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'aaachat';

(async () => {
  try {
    console.log(`[resetDb] Connecting to ${DB_HOST}:${DB_PORT} db=${DB_NAME} ...`);
    const conn = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME, multipleStatements: true });
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    await conn.query('TRUNCATE TABLE chat_messages');
    await conn.query('TRUNCATE TABLE profiles');
    await conn.query('TRUNCATE TABLE api_keys');
    await conn.query('TRUNCATE TABLE plans');
    await conn.query('TRUNCATE TABLE users');
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
    await conn.end();
    console.log('[resetDb] Done: tables truncated.');
    process.exit(0);
  } catch (err) {
    console.error('[resetDb] Failed:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
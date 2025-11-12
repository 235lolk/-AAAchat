#!/usr/bin/env node
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
    console.log(`[migrate] Connecting to ${DB_HOST}:${DB_PORT} db=${DB_NAME} ...`);
    const conn = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });

    async function safeAlter(sql) {
      try { await conn.query(sql); } catch (e) { console.log('[migrate] skip:', e.code || e.message); }
    }

    // 为 api_keys 表增加共享标记与配置 JSON（TEXT）
    await safeAlter("ALTER TABLE api_keys ADD COLUMN is_shared TINYINT(1) NOT NULL DEFAULT 0");
    await safeAlter("ALTER TABLE api_keys ADD COLUMN config_json TEXT NULL");
    await safeAlter("ALTER TABLE api_keys ADD INDEX idx_api_keys_provider_shared (provider, is_shared, created_at)");

    await conn.end();
    console.log('[migrate] Shared keys columns migrated.');
    process.exit(0);
  } catch (err) {
    console.error('[migrate] Failed:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
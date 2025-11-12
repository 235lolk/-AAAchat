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
    const conn = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME, multipleStatements: true });

    const sql = `
      CREATE TABLE IF NOT EXISTS conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(100) NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_conversations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS conversation_id INT NULL;
      ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS role ENUM('user','assistant') DEFAULT 'user';
      ALTER TABLE chat_messages
        ADD CONSTRAINT IF NOT EXISTS fk_chat_messages_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
    `;

    // mysql2 does not support IF NOT EXISTS in ALTER in all versions.
    // So we will attempt resilient alters.
    async function safeAlter(query) {
      try { await conn.query(query); } catch (e) { console.log('[migrate] skip:', e.code || e.message); }
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        title VARCHAR(100) NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_conversations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await safeAlter('ALTER TABLE chat_messages ADD COLUMN conversation_id INT NULL');
    await safeAlter("ALTER TABLE chat_messages ADD COLUMN role ENUM('user','assistant') DEFAULT 'user'");
    await safeAlter('ALTER TABLE chat_messages ADD CONSTRAINT fk_chat_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE');

    await conn.end();
    console.log('[migrate] Conversations schema migrated.');
    process.exit(0);
  } catch (err) {
    console.error('[migrate] Failed:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
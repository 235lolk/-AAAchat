const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'aaachat';

/**
 * 数据库迁移：为 users 表新增账户字段并填充、设为唯一。
 * 变更内容：
 * - 增加列 account VARCHAR(100)
 * - 为已有用户填充值：lower(email前缀)+'_'+id
 * - 将 account 改为 NOT NULL 并添加唯一索引
 * 安全性：使用参数化查询；对已存在索引/列处理做容错。
 */
(async () => {
  let conn;
  try {
    console.log(`[migrate_accounts] Connecting to ${DB_HOST}:${DB_PORT} db=${DB_NAME} ...`);
    conn = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });

    // 1) 检查并新增 account 列
    const [cols] = await conn.query("SHOW COLUMNS FROM users LIKE 'account'");
    if (cols.length === 0) {
      await conn.query('ALTER TABLE users ADD COLUMN account VARCHAR(100) NULL');
      console.log('[migrate_accounts] Added column users.account');
    } else {
      console.log('[migrate_accounts] Column users.account already exists');
    }

    // 2) 为空账户填充：lower(email前缀)+'_'+id
    await conn.query("UPDATE users SET account = CONCAT(LOWER(SUBSTRING_INDEX(email,'@',1)), '_', id) WHERE account IS NULL");
    console.log('[migrate_accounts] Populated account for existing users');

    // 3) 将列设为 NOT NULL
    await conn.query('ALTER TABLE users MODIFY account VARCHAR(100) NOT NULL');
    console.log('[migrate_accounts] Modified users.account to NOT NULL');

    // 4) 添加唯一索引
    try {
      await conn.query('ALTER TABLE users ADD UNIQUE KEY uq_users_account (account)');
      console.log('[migrate_accounts] Added unique index uq_users_account');
    } catch (e) {
      console.log('[migrate_accounts] Unique index already exists or cannot be added:', e && e.message ? e.message : e);
    }

    console.log('✅ migrate_accounts completed');
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ migrate_accounts failed:', err && err.stack ? err.stack : err);
    if (conn) await conn.end();
    process.exit(1);
  }
})();
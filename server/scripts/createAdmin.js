const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'aaachat';

// 管理员账户配置（本迭代改为账户+密码，不再依赖邮箱判断）
const ADMIN_ACCOUNT = 'Admin0126';
const ADMIN_PASSWORD = 'Gty@0126';
// 仍需邮箱字段以满足表结构非空约束（可任意占位）
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_NAME = 'Admin0126';

(async () => {
  try {
    console.log(`[createAdmin] Connecting to ${DB_HOST}:${DB_PORT} db=${DB_NAME} ...`);
    const conn = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });

    // 确保存在 account 字段
    const [cols] = await conn.query("SHOW COLUMNS FROM users LIKE 'account'");
    if (cols.length === 0) {
      await conn.query('ALTER TABLE users ADD COLUMN account VARCHAR(100) NULL');
      console.log('[createAdmin] Added column users.account');
    }

    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

    // 优先按账户查找
    const [byAccount] = await conn.query('SELECT id FROM users WHERE account = ?', [ADMIN_ACCOUNT]);
    let userId;
    if (byAccount.length > 0) {
      userId = byAccount[0].id;
      await conn.query('UPDATE users SET password_hash = ?, name = ?, role = ?, email = COALESCE(email, ?) WHERE id = ?', [hash, ADMIN_NAME, 'admin', ADMIN_EMAIL, userId]);
      console.log(`[createAdmin] Updated existing admin user by account #${userId}.`);
    } else {
      // 回退：若旧环境曾按邮箱创建过管理员，迁移账户字段
      const [byEmail] = await conn.query('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);
      if (byEmail.length > 0) {
        userId = byEmail[0].id;
        await conn.query('UPDATE users SET account = ?, password_hash = ?, name = ?, role = ? WHERE id = ?', [ADMIN_ACCOUNT, hash, ADMIN_NAME, 'admin', userId]);
        console.log(`[createAdmin] Migrated admin by email to account #${userId}.`);
      } else {
        const [result] = await conn.query('INSERT INTO users (email, account, password_hash, name, role) VALUES (?, ?, ?, ?, ?)', [ADMIN_EMAIL, ADMIN_ACCOUNT, hash, ADMIN_NAME, 'admin']);
        userId = result.insertId;
        console.log(`[createAdmin] Created admin user #${userId}.`);
      }
    }

    const [pRows] = await conn.query('SELECT user_id FROM profiles WHERE user_id = ?', [userId]);
    if (pRows.length === 0) {
      await conn.query('INSERT INTO profiles (user_id, bio, avatar_url) VALUES (?, ?, ?)', [userId, '', '']);
      console.log('[createAdmin] Created profile for admin.');
    }

    // 设置 account 非空并唯一（若列原为 NULL），避免重复账户
    const [cols2] = await conn.query("SHOW COLUMNS FROM users LIKE 'account'");
    if (cols2.length > 0 && cols2[0].Null === 'YES') {
      await conn.query('UPDATE users SET account = CONCAT("user_", id) WHERE account IS NULL');
      await conn.query('ALTER TABLE users MODIFY account VARCHAR(100) NOT NULL');
      try {
        await conn.query('ALTER TABLE users ADD UNIQUE KEY uq_users_account (account)');
      } catch (e) {
        // 忽略唯一键已存在错误
      }
    }
    await conn.end();
    console.log('[createAdmin] Done.');
    process.exit(0);
  } catch (err) {
    console.error('[createAdmin] Failed:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
})();
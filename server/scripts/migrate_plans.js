/**
 * 数据库迁移：创建 plans 表用于存储用户的规划计划
 *
 * 表结构（MySQL）：
 * - id INT PK AI
 * - user_id INT NOT NULL（外键指向 users.id）
 * - goal VARCHAR(255) NOT NULL（目标摘要）
 * - constraints TEXT NULL（约束条件）
 * - steps_count INT NULL（建议步骤数）
 * - deadline DATE NULL（整体截止日期）
 * - plan_json LONGTEXT NOT NULL（计划详情 JSON）
 * - visibility ENUM('private','public') NOT NULL DEFAULT 'private'（可见性）
 * - created_at DATETIME DEFAULT CURRENT_TIMESTAMP
 * - updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
 *
 * 使用说明（Windows 11 / 容器环境）：
 * - 在容器内执行：`docker exec assistantbot-app node scripts/migrate_plans.js`
 * - 在本机执行：确保 `server\\.env` 配置正确后，`node server\\scripts\\migrate_plans.js`
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool } = require('../db');

async function ensurePlansTable() {
  // 中文注释：先创建枚举类型和表（MySQL 中 ENUM 可直接在字段定义）
  const createSql = `
    CREATE TABLE IF NOT EXISTS plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      goal VARCHAR(255) NOT NULL,
      constraints TEXT NULL,
      steps_count INT NULL,
      deadline DATE NULL,
      plan_json LONGTEXT NOT NULL,
      visibility ENUM('private','public') NOT NULL DEFAULT 'private',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_plans_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
  await pool.query(createSql);
}

async function main() {
  try {
    console.log('[migrate_plans] Connecting to db:%s db=%s ...', process.env.DB_PORT || '3306', process.env.DB_NAME || 'aaachat');
    await ensurePlansTable();
    console.log('✅ migrate_plans completed');
    process.exit(0);
  } catch (err) {
    console.error('❌ migrate_plans failed:', err);
    process.exit(1);
  }
}

main();
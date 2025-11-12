// 注册/登录测试并校验数据库更新
const path = require('path');
const fs = require('fs');
const mysql = require('../server/node_modules/mysql2/promise');

// 尝试加载 server/.env 以使用实际数据库配置
try {
  const dotenv = require('../server/node_modules/dotenv');
  dotenv.config({ path: path.join(__dirname, '../server/.env') });
  console.log('[ENV] 已尝试加载 server/.env');
} catch {}

const BASE = 'http://localhost:3000/api';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'aaachat';
const DB_PORT = Number(process.env.DB_PORT || '3306');

async function ensureDbReady() {
  try {
    const pool = mysql.createPool({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });
    await pool.query('SELECT 1 FROM users LIMIT 1');
    await pool.end();
    console.log('[DB] 已存在业务表');
  } catch (e) {
    console.log('[DB] 初始化数据库 schema 与 seed...');
    try {
      const schema = fs.readFileSync(path.join(__dirname, '../docs/schema.sql'), 'utf8');
      const seed = fs.readFileSync(path.join(__dirname, '../docs/seed.sql'), 'utf8');
      const conn = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, multipleStatements: true });
      await conn.query(schema);
      await conn.query(seed);
      await conn.end();
      console.log('[DB] 初始化完成');
    } catch (initErr) {
      console.warn('[DB] 初始化失败，继续执行接口测试。原因：', initErr && initErr.message ? initErr.message : initErr);
    }
  }
}

async function httpJson(url, options = {}) {
  const headers = options.headers || {};
  headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return text ? JSON.parse(text) : {};
}

(async () => {
  await ensureDbReady();

  const email = `test_${Date.now()}@example.com`;
  const password = 'Test@123';
  const name = 'Tester';
  console.log('[TEST] 开始注册: ', email);

  // 注册
  const regData = await httpJson(`${BASE}/auth/register`, {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
  if (!regData.success) throw new Error('注册返回缺少 success 字段');
  console.log('[TEST] 注册成功');

  // 登录
  console.log('[TEST] 开始登录');
  const loginData = await httpJson(`${BASE}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!loginData.token) throw new Error('登录未返回 token');
  console.log('[TEST] 登录成功，token 长度：', loginData.token.length);

  // 会话查询
  const meData = await httpJson(`${BASE}/auth/me`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${loginData.token}` },
  });
  if (!meData.user || meData.user.email !== email) throw new Error('会话用户与登录邮箱不一致');
  console.log('[TEST] /auth/me 返回用户正确');

  // 数据库校验
  try {
    const pool = mysql.createPool({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME });
    const [users] = await pool.query('SELECT id, email, role FROM users WHERE email = ?', [email]);
    if (users.length !== 1) throw new Error('数据库校验失败：未找到刚注册的用户');
    const userId = users[0].id;
    const [profiles] = await pool.query('SELECT user_id FROM profiles WHERE user_id = ?', [userId]);
    if (profiles.length !== 1) throw new Error('数据库校验失败：未创建对应的 profile');
    console.log(`[DB] 用户 #${userId} 已创建，角色=${users[0].role}，profile 存在`);
    await pool.end();
  } catch (dbErr) {
    throw new Error('无法连接或查询数据库，请检查 DB_HOST/DB_USER/DB_PASSWORD/DB_NAME 设置。原始错误： ' + (dbErr && dbErr.message ? dbErr.message : dbErr));
  }

  console.log('✅ 所有测试通过：注册、登录、数据库更新校验');
  process.exit(0);
})().catch(err => {
  console.error('❌ 测试失败：', err && err.stack ? err.stack : err);
  process.exit(1);
});
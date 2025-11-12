const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

// 注册接口维持兼容：仍支持邮箱注册（下个迭代可改为账户注册）
router.post('/register', async (req, res) => {
  /**
   * 注册用户（去邮箱化）
   * 参数：account, password, name, [email]
   * 返回：{ success: true }
   * 说明：
   * - 必填改为“账户+密码”，邮箱改为可选。
   * - 为满足数据库 `users.email NOT NULL UNIQUE` 约束，若未提供邮箱，则自动生成占位邮箱：`<account>@noemail.local`。
   * - 账户需唯一且满足字符约束（字母/数字/下划线，3-100 长度）。
   */
  const { account, password, name, email } = req.body;
  // 基本校验：账户与密码必填
  if (!account || !password) return res.status(400).json({ error: 'Account and password required' });

  // 账户格式校验（安全与可读性）：仅允许字母/数字/下划线，长度 3-100
  const accountTrim = String(account).trim();
  if (!/^\w{3,100}$/.test(accountTrim)) {
    return res.status(400).json({ error: 'Invalid account format' });
  }

  // 可选邮箱格式校验（若提供）
  let emailToUse = typeof email === 'string' && email.trim() ? email.trim() : `${accountTrim}@noemail.local`;
  if (email && !/^.+@.+\..+$/.test(emailToUse)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    // 账户唯一性检查
    const [accRows] = await pool.query('SELECT id FROM users WHERE account = ?', [accountTrim]);
    if (accRows.length > 0) return res.status(409).json({ error: 'Account already exists' });

    // 若提供邮箱则检查唯一性（防止违反 UNIQUE 约束）
    if (email && emailToUse) {
      const [mailRows] = await pool.query('SELECT id FROM users WHERE email = ?', [emailToUse]);
      if (mailRows.length > 0) return res.status(409).json({ error: 'Email already registered' });
    }

    // 密码哈希（bcrypt 10轮）
    const hash = bcrypt.hashSync(password, 10);

    // 插入用户：邮箱（可能为占位）、账户、密码哈希、名称、角色
    const [result] = await pool.query(
      'INSERT INTO users (email, account, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
      [emailToUse, accountTrim, hash, name || '', 'user']
    );

    const userId = result.insertId;
    // 创建 profile 记录
    await pool.query('INSERT INTO profiles (user_id, bio, avatar_url) VALUES (?, ?, ?)', [userId, '', '']);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    // 统一错误返回，避免泄露数据库内部错误细节
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  /**
   * 使用“账户+密码”登录
   * 参数：account, password
   * 返回：{ token, csrf, user: { id, account, role, name } }
   * 说明：不再依赖邮箱字段；JWT 中也携带 account，便于前端仅基于角色控制 Admin 可见性。
   */
  const { account, password } = req.body;
  if (!account || !password) return res.status(400).json({ error: 'Account and password required' });
  try {
    const [rows] = await pool.query('SELECT id, account, email, password_hash, name, role FROM users WHERE account = ?', [account]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const csrf = crypto.randomBytes(16).toString('hex');
    const token = jwt.sign({ id: user.id, account: user.account, role: user.role, name: user.name, csrf }, process.env.JWT_SECRET || 'supersecret', { expiresIn: '2h' });
    res.json({ token, csrf, user: { id: user.id, account: user.account, role: user.role, name: user.name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  /**
   * 返回当前用户基本信息
   * 字段：id, account, name, role（保留 email 以兼容旧页面显示但前端逻辑不再依赖）
   */
  try {
    const [rows] = await pool.query('SELECT id, account, email, name, role FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { authRouter: router };
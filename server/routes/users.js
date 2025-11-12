const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate, requireAdmin, requireCsrf } = require('../middleware/auth');

// 列出所有用户（管理员）
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, email, name, role, created_at FROM users ORDER BY id');
    res.json({ users: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 获取单个用户
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, email, name, role FROM users WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 更新用户（管理员）
router.put('/:id', authenticate, requireAdmin, requireCsrf, async (req, res) => {
  const { name, role } = req.body;
  const cleanName = typeof name === 'string' ? name.replace(/[<>]/g, '') : null;
  try {
    await pool.query('UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role) WHERE id = ?', [cleanName, role || null, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 删除用户（管理员）
router.delete('/:id', authenticate, requireAdmin, requireCsrf, async (req, res) => {
  try {
    await pool.query('DELETE FROM chat_messages WHERE user_id = ?', [req.params.id]);
    await pool.query('DELETE FROM profiles WHERE user_id = ?', [req.params.id]);
    await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { usersRouter: router };
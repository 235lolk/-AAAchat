const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate, requireCsrf } = require('../middleware/auth');

// 获取当前用户的个人资料
router.get('/me', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT user_id, bio, avatar_url FROM profiles WHERE user_id = ?', [req.user.id]);
    res.json({ profile: rows[0] || { user_id: req.user.id, bio: '', avatar_url: '' } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 更新当前用户的个人资料
router.put('/me', authenticate, requireCsrf, async (req, res) => {
  const { bio, avatar_url } = req.body;
  // 基础 XSS 过滤：移除尖括号，避免存储恶意标签
  const cleanBio = typeof bio === 'string' ? bio.replace(/[<>]/g, '') : '';
  const cleanAvatar = typeof avatar_url === 'string' ? avatar_url.trim() : '';
  try {
    await pool.query('UPDATE profiles SET bio = ?, avatar_url = ? WHERE user_id = ?', [cleanBio, cleanAvatar, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { profilesRouter: router };
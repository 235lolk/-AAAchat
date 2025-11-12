const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate, requireCsrf } = require('../middleware/auth');

// 获取当前用户的 API Keys 列表（不返回明文 key）
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, provider, label, is_shared, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ keys: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 新增 API Key（支持多个）
router.post('/', authenticate, requireCsrf, async (req, res) => {
  let { provider, label, api_key, is_shared, config } = req.body;
  provider = (provider || 'deepseek').trim().toLowerCase();
  label = typeof label === 'string' ? label.replace(/[<>]/g, '').slice(0, 100) : '';
  const shared = (is_shared === true || is_shared === 1 || is_shared === '1') ? 1 : 0;
  let configJson = null;
  if (config && typeof config === 'object') {
    try { configJson = JSON.stringify(config); } catch { configJson = null; }
  } else if (typeof config === 'string') {
    configJson = config;
  }
  if (!api_key || typeof api_key !== 'string') {
    return res.status(400).json({ error: 'api_key required' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO api_keys (user_id, provider, label, api_key, is_shared, config_json) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, provider, label, api_key, shared, configJson]
    );
    res.json({ id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 列出共享池中的密钥（不返回明文 key）
router.get('/shared', authenticate, async (req, res) => {
  try {
    const provider = (req.query.provider || '').trim().toLowerCase();
    const args = [];
    let sql = 'SELECT id, provider, label, created_at, config_json FROM api_keys WHERE is_shared = 1';
    if (provider) { sql += ' AND provider = ?'; args.push(provider); }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await pool.query(sql, args);
    res.json({ keys: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 删除某个 API Key（仅本人）
router.delete('/:id', authenticate, requireCsrf, async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await pool.query('SELECT user_id FROM api_keys WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('DELETE FROM api_keys WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 设置/取消共享（可同时更新配置）
router.patch('/:id/share', authenticate, requireCsrf, async (req, res) => {
  const id = req.params.id;
  let { is_shared, config } = req.body;
  const shared = (is_shared === true || is_shared === 1 || is_shared === '1') ? 1 : 0;
  let configJson = null;
  if (config && typeof config === 'object') {
    try { configJson = JSON.stringify(config); } catch { configJson = null; }
  } else if (typeof config === 'string') {
    configJson = config;
  }
  try {
    const [rows] = await pool.query('SELECT user_id FROM api_keys WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    await pool.query('UPDATE api_keys SET is_shared = ?, config_json = COALESCE(?, config_json) WHERE id = ?', [shared, configJson, id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { keysRouter: router };
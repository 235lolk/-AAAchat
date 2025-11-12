const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { authenticate, requireCsrf } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const uploadDir = path.join(__dirname, '..', 'uploads');
try { fs.mkdirSync(uploadDir, { recursive: true }); } catch {}
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const safe = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `uid-${req.user.id}-${Date.now()}-${Math.random().toString(36).slice(2)}-${safe}`);
  }
});
const uploader = multer({ storage });

// 选择 API Key（支持用户与共享池）
async function chooseApiKey(req, provider, { source, key_id, shared_key_id } = {}) {
  provider = (provider || 'deepseek').toLowerCase();
  if (source === 'shared') {
    if (shared_key_id) {
      const [rows] = await pool.query('SELECT api_key, config_json FROM api_keys WHERE id = ? AND is_shared = 1 AND provider = ?', [shared_key_id, provider]);
      if (rows.length === 0) throw new Error('Shared key not found');
      return rows[0];
    }
    const [rows] = await pool.query('SELECT api_key, config_json FROM api_keys WHERE is_shared = 1 AND provider = ? ORDER BY created_at DESC LIMIT 1', [provider]);
    if (rows.length === 0) throw new Error('No shared key available');
    return rows[0];
  }
  if (key_id) {
    const [rows] = await pool.query('SELECT api_key, config_json FROM api_keys WHERE id = ? AND user_id = ? AND provider = ?', [key_id, req.user.id, provider]);
    if (rows.length === 0) throw new Error('API key not found');
    return rows[0];
  }
  const [rows] = await pool.query('SELECT api_key, config_json FROM api_keys WHERE user_id = ? AND provider = ? ORDER BY created_at DESC LIMIT 1', [req.user.id, provider]);
  if (rows.length === 0) throw new Error('No API key. Please add in profile.');
  return rows[0];
}
// 聊天历史（占位）
router.get('/history', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, user_id, content, created_at FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json({ messages: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 发送消息（占位）
router.post('/message', authenticate, requireCsrf, async (req, res) => {
  const { content } = req.body;
  const cleanContent = typeof content === 'string' ? content.replace(/[<>]/g, '') : '';
  try {
    const [result] = await pool.query(
      'INSERT INTO chat_messages (user_id, content, created_at) VALUES (?, ?, NOW())',
      [req.user.id, cleanContent]
    );
    res.json({ id: result.insertId, content: cleanContent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 使用用户保存的 DeepSeek API Key 代理对话
router.post('/deepseek', authenticate, requireCsrf, async (req, res) => {
  const { messages, key_id, model, params = {}, use_shared, shared_key_id } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' });
  }
  // 选择用户的 key 或共享 key
  try {
    const apiRow = await chooseApiKey(req, 'deepseek', { source: use_shared ? 'shared' : 'user', key_id, shared_key_id });
    let cfg = {};
    if (apiRow && apiRow.config_json) { try { cfg = JSON.parse(apiRow.config_json); } catch {} }
    const endpoint = (cfg.base_url) || (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/chat/completions');
    const payload = { model: model || cfg.model || 'deepseek-chat', messages, stream: false };
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiRow.api_key}`
      },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(502).json({ error: 'Upstream error', detail: text });
    }
    const data = await resp.json();
    const reply = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    res.json({ reply: reply || '', raw: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 会话列表：当前用户的所有会话
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC',
      [req.user.id]
    );
    res.json({ conversations: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 新建会话
router.post('/conversations', authenticate, requireCsrf, async (req, res) => {
  let { title } = req.body || {};
  title = typeof title === 'string' ? title.trim().slice(0, 100) : '';
  try {
    const [result] = await pool.query('INSERT INTO conversations (user_id, title) VALUES (?, ?)', [req.user.id, title || '新建对话']);
    res.json({ id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 重命名会话
router.put('/conversations/:id', authenticate, requireCsrf, async (req, res) => {
  const convId = req.params.id;
  let { title } = req.body || {};
  title = typeof title === 'string' ? title.trim().slice(0, 100).replace(/[<>]/g, '') : '';
  if (!title) return res.status(400).json({ error: 'title required' });
  try {
    const [conv] = await pool.query('SELECT id, user_id FROM conversations WHERE id = ?', [convId]);
    if (conv.length === 0 || conv[0].user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
    await pool.query('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [title, convId]);
    res.json({ id: Number(convId), title });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 删除会话（及其消息）
router.delete('/conversations/:id', authenticate, requireCsrf, async (req, res) => {
  const convId = req.params.id;
  try {
    const [conv] = await pool.query('SELECT id, user_id FROM conversations WHERE id = ?', [convId]);
    if (conv.length === 0 || conv[0].user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
    await pool.query('DELETE FROM chat_messages WHERE conversation_id = ?', [convId]);
    await pool.query('DELETE FROM conversations WHERE id = ?', [convId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 会话消息列表
router.get('/conversations/:id/messages', authenticate, async (req, res) => {
  const convId = req.params.id;
  try {
    const [conv] = await pool.query('SELECT id, user_id FROM conversations WHERE id = ?', [convId]);
    if (conv.length === 0 || conv[0].user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
    const [msgs] = await pool.query('SELECT id, role, content, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY id', [convId]);
    res.json({ messages: msgs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 发送并保存到会话，同时代理到 DeepSeek
router.post('/conversations/:id/send', authenticate, requireCsrf, async (req, res) => {
  const convId = req.params.id;
  const { content, model, params = {}, images = [] } = req.body || {};
  const clean = typeof content === 'string' ? content.replace(/[<>]/g, '') : '';
  if (!clean) return res.status(400).json({ error: 'content required' });
  try {
    const [conv] = await pool.query('SELECT id, user_id, title FROM conversations WHERE id = ?', [convId]);
    if (conv.length === 0 || conv[0].user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });

    // 先记录用户消息（在文本末尾附带图片 URL 提示，便于历史回放）
    const displayContent = clean + (Array.isArray(images) && images.length ? ` [附图: ${images.join(', ')}]` : '');
    await pool.query(
      'INSERT INTO chat_messages (user_id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, NOW())',
      [req.user.id, convId, 'user', displayContent]
    );

    // 聚合历史消息以构造对话上下文，并为最新一条 user 消息合并图片为多模态内容
    const [rows] = await pool.query('SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY id', [convId]);
    let messagesUpstream = rows.map(r => ({ role: r.role, content: r.content }));
    if (params && params.send_images === true && (process.env.DEEPSEEK_ENABLE_VISION === '1' || process.env.DEEPSEEK_ENABLE_VISION === 'true') && Array.isArray(images) && images.length > 0 && messagesUpstream.length > 0) {
      const detailOpt = (params.image_quality && params.image_quality !== 'auto') ? { detail: params.image_quality } : {};
      const toDataUrlImage = async (u) => {
        // 已是 data URL 或公网 URL 直接使用
        if (/^data:image\//i.test(u) || /^https?:\/\//i.test(u)) {
          return { type: 'image_url', image_url: { url: u, ...detailOpt } };
        }
        // 本地上传：/uploads/<filename> 转换为 data URL 以便上游模型在服务端可用
        const name = path.basename(u);
        const filePath = path.join(uploadDir, name);
        try {
          const buf = await fs.promises.readFile(filePath);
          const ext = (name.split('.').pop() || '').toLowerCase();
          const mime = ext === 'png' ? 'image/png'
            : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
            : ext === 'webp' ? 'image/webp'
            : ext === 'gif' ? 'image/gif'
            : 'application/octet-stream';
          const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
          return { type: 'image_url', image_url: { url: dataUrl, ...detailOpt } };
        } catch (e) {
          console.warn('read upload image failed:', e.message);
          return null;
        }
      };
      const modelImages = (await Promise.all(images.map(toDataUrlImage))).filter(Boolean);
      messagesUpstream[messagesUpstream.length - 1] = {
        role: 'user',
        content: [
          { type: 'text', text: clean },
          ...modelImages
        ]
      };
    }

    // 上下文长度（近似按字符计），从最新开始回收，控制总长度不超过阈值
    const maxCtx = params && params.context_length ? Number(params.context_length) : null;
    if (maxCtx && Number.isFinite(maxCtx) && maxCtx > 0) {
      let total = 0; const keep = [];
      for (let i = messagesUpstream.length - 1; i >= 0; i--) {
        const m = messagesUpstream[i];
        const len = typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length;
        if (total + len > maxCtx && keep.length) break;
        total += len;
        keep.push(m);
      }
      messagesUpstream = keep.reverse();
    }

    // 选取 API Key（最新的 deepseek）
    const provider = (params && params.provider) ? String(params.provider).toLowerCase() : 'deepseek';
    let apiRow;
    try {
      apiRow = await chooseApiKey(req, provider, {
        source: (params && params.use_shared) ? 'shared' : 'user',
        key_id: params && params.key_id,
        shared_key_id: params && params.shared_key_id
      });
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Key selection failed' });
    }
    let cfg = {};
    if (apiRow && apiRow.config_json) { try { cfg = JSON.parse(apiRow.config_json); } catch {} }
    const endpoint = (cfg.base_url) || (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/chat/completions');
    const payload = { model: model || cfg.model || 'deepseek-chat', messages: messagesUpstream, stream: !!params.stream };
    if (params.temperature !== undefined) payload.temperature = Number(params.temperature);
    if (params.top_p !== undefined) payload.top_p = Number(params.top_p);
    if (params.max_tokens !== undefined) payload.max_tokens = Number(params.max_tokens);
    if (params.n !== undefined) payload.n = Number(params.n);
    if (params.frequency_penalty !== undefined) payload.frequency_penalty = Number(params.frequency_penalty);
    if (params.presence_penalty !== undefined) payload.presence_penalty = Number(params.presence_penalty);
    if (typeof params.effort_level === 'string' && params.effort_level) payload.reasoning_effort = params.effort_level;

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiRow.api_key}` },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(502).json({ error: 'Upstream error', detail: text });
    }

    const upstreamType = resp.headers.get('content-type') || '';

    // 当请求启用 stream 时，以 SSE 方式向前端逐段推送；否则走一次性 JSON。
    if (payload.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }

    // 客户端关闭（终止回复）检测
    let clientClosed = false;
    req.on('close', () => { clientClosed = true; });

    let finalText = '';

    if (payload.stream && upstreamType.includes('text/event-stream')) {
      // 上游为 SSE：逐块读取并解析 data: 行，实时向前端转发
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        // 若客户端已关闭，则取消读取并终止循环
        if (clientClosed) { try { await reader.cancel(); } catch {} break; }
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop();
        for (const fr of frames) {
          const dataLines = fr.split('\n').filter(l => l.startsWith('data:'));
          for (const line of dataLines) {
            const d = line.slice(5).trim();
            if (!d || d === '[DONE]') continue;
            let obj; try { obj = JSON.parse(d); } catch { obj = null; }
            const token = obj && obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content;
            if (token) {
              finalText += token;
              // 客户端关闭时不再写出
              if (!clientClosed) res.write(`data: ${JSON.stringify({ delta: token })}\n\n`);
            }
          }
        }
      }
    } else {
      // 上游为 JSON：一次性拿到文本后，本地按字符切片以 SSE 推送，实现逐字打印效果
      const data = await resp.json();
      const choices = Array.isArray(data && data.choices) ? data.choices.map(c => (c && c.message && c.message.content) || '') : [];
      finalText = choices[0] || '';
      if (payload.stream) {
        for (const ch of finalText.split('')) {
          if (clientClosed) break;
          res.write(`data: ${JSON.stringify({ delta: ch })}\n\n`);
        }
      } else {
        // 非流式直接返回
        // 记录助手消息（n>1 时保存多条）并更新会话时间
        for (const ch of choices.length ? choices : [finalText]) {
          await pool.query('INSERT INTO chat_messages (user_id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, NOW())', [req.user.id, convId, 'assistant', ch]);
        }
        await pool.query('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [convId]);
        return res.json({ reply: finalText, choices, raw: data });
      }
    }

    // 保存到数据库（流式统一保存首条）并更新会话时间（若客户端未终止）
    if (!clientClosed) {
      await pool.query('INSERT INTO chat_messages (user_id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, NOW())', [req.user.id, convId, 'assistant', finalText]);
      await pool.query('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [convId]);
    }

    if (payload.stream) {
      if (!clientClosed) {
        res.write('event: done\ndata: {}\n\n');
        return res.end();
      }
      // 客户端已关闭：不再写出 / 不保存，直接结束执行
      return;
    }

    // 兜底：非流式（理论上不会进入此分支）
    if (!clientClosed) {
      return res.json({ reply: finalText, choices: [finalText] });
    }
    // 若非流式但客户端关闭（极少发生），直接结束
    return;
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 上传文件：返回相对可访问 URL（/uploads/...），供前端作为图片附件使用
router.post('/uploads', authenticate, requireCsrf, uploader.array('files', 12), async (req, res) => {
  try {
    const files = (req.files || []).map(f => ({ name: f.originalname, url: `/uploads/${path.basename(f.filename)}` }));
    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 列出当前用户历史上传文件
router.get('/uploads', authenticate, async (req, res) => {
  try {
    const all = fs.readdirSync(uploadDir).filter(n => n.startsWith(`uid-${req.user.id}-`));
    const files = all.map(n => ({ name: n.replace(/^uid-\d+-\d+-[a-z0-9]+-/, ''), url: `/uploads/${n}` }));
    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});
module.exports = { chatRouter: router };
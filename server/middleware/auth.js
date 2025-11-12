const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'supersecret');
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
};

// 校验 CSRF：要求请求头 x-csrf-token 与 JWT 中的 csrf 一致
const requireCsrf = (req, res, next) => {
  const header = req.headers['x-csrf-token'];
  if (!req.user || !req.user.csrf) {
    return res.status(403).json({ error: 'Missing CSRF context' });
  }
  if (!header || header !== req.user.csrf) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  next();
};

module.exports = { authenticate, requireAdmin, requireCsrf };
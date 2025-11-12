import { request, getToken, clearToken } from './api.js';

/**
 * 确保用户已登录。
 * 逻辑：
 * - 无本地 token：跳转登录页；
 * - 请求 /auth/me（带 10 秒超时）：成功返回用户，失败清理 token 并跳转登录页。
 * 返回：已登录用户对象或 null。
 */
async function ensureAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = 'index.html';
    return null;
  }
  try {
    // 为鉴权请求增加超时，避免接口阻塞导致页面停留在顶层 await
    const { user } = await request('/auth/me', {}, 10000);
    return user;
  } catch (e) {
    clearToken();
    window.location.href = 'index.html';
    return null;
  }
}

/**
 * 确保当前用户是管理员。
 * 返回：管理员用户对象或 null（自动将非管理员跳转到首页）。
 * 说明：不再依赖邮箱，仅基于角色判定。
 */
async function ensureAdmin() {
  const user = await ensureAuth();
  if (!user) return null;
  if (user.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return null;
  }
  return user;
}

export { ensureAuth, ensureAdmin };
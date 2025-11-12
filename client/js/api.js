const API_BASE = '/api';

/**
 * 获取当前存储的 JWT 令牌。
 * 返回值：字符串或 null
 */
function getToken() { return localStorage.getItem('token'); }
/**
 * 设置 JWT 令牌到本地存储。
 * 参数：token 字符串
 */
function setToken(token) { localStorage.setItem('token', token); }
/**
 * 清除本地存储中的 JWT 令牌。
 */
function clearToken() { localStorage.removeItem('token'); }

/**
 * 获取 CSRF Token（与后端 JWT 中的 csrf 对应）。
 * 返回值：字符串或 null
 */
function getCsrfToken() { return localStorage.getItem('csrf_token'); }
/**
 * 设置 CSRF Token 到本地存储。
 * 参数：token 字符串
 */
function setCsrfToken(token) { localStorage.setItem('csrf_token', token); }
/**
 * 清除 CSRF Token。
 */
function clearCsrfToken() { localStorage.removeItem('csrf_token'); }

/**
 * 发起 JSON 请求，带可选超时。
 * 参数：
 * - path：接口路径（自动加前缀 `/api`）
 * - options：fetch 选项，可包含 headers、method、body、signal 等
 * - timeoutMs：超时毫秒，>0 时启用 AbortController 取消请求（Windows 11 下无需额外配置）
 * 返回：解析后的 JSON 对象；非 2xx 抛出错误（包含后端文本）。
 */
async function request(path, options = {}, timeoutMs = 0) {
  const headers = options.headers || {};
  headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // 非 GET 请求自动携带 CSRF Token
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  // 若调用方已传入 signal，则优先使用；否则按 timeoutMs 创建控制器
  let controller = null;
  let timer = null;
  const useSignal = options.signal || (timeoutMs > 0 ? (controller = new AbortController(), controller.signal) : undefined);
  if (controller) {
    // 到时取消请求，避免前端“卡住”
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }
  try {
    const res = await fetch(API_BASE + path, { ...options, headers, signal: useSignal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || 'Request failed');
    }
    return res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 发送表单（用于文件上传）；不设置 Content-Type，由浏览器按 multipart/form-data 处理。
 * 参数：
 * - path：接口路径
 * - formData：FormData 对象
 * - method：HTTP 方法，默认 POST
 * 返回：解析后的 JSON；非 2xx 抛错。
 */
async function requestForm(path, formData, method = 'POST') {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const csrf = getCsrfToken();
  if (csrf) headers['X-CSRF-Token'] = csrf;
  const res = await fetch(API_BASE + path, { method, body: formData, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Request failed');
  }
  return res.json();
}

export { request, requestForm, getToken, setToken, clearToken, getCsrfToken, setCsrfToken, clearCsrfToken };
/**
 * 统一导航注入脚本（Windows 路径示例：E:\AAAchat\client\js\header.js）
 * 功能：加载公共 header 片段、绑定登出、控制 Admin 显示、标记当前页面 active。
 * 依赖：./auth.js 提供 ensureAuth；./common.js 提供 logout。
 */
import { ensureAuth } from './auth.js';
import { logout } from './common.js';

/**
 * 注入统一导航到页面中的 #header-root 容器。
 * - 动态加载片段：partials/header.html
 * - 绑定登出事件
 * - 根据当前用户显示 Admin
 * - 根据当前路径为对应链接添加 active
 */
export async function injectHeader() {
  const root = document.getElementById('header-root');
  if (!root) {
    // 若页面未提供容器则不执行，避免报错
    return;
  }

  // 加载公共 header 片段并插入 DOM
  const resp = await fetch('partials/header.html', { cache: 'no-store' });
  const html = await resp.text();
  root.innerHTML = html;

  // 绑定登出按钮
  const logoutBtn = root.querySelector('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }

  /**
   * 鉴权与 Admin 显示控制：
   * - 为避免在登录页触发鉴权重定向（ensureAuth 会跳转到 index.html），仅在非登录页执行鉴权；
   * - Admin 菜单默认隐藏，仅当用户角色为 admin 时显示。
   */
  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isLoginPage = file === 'index.html' || file === '';
  let user = null;
  if (!isLoginPage) {
    try {
      user = await ensureAuth();
    } catch (e) {
      // 登录态不可用时，不影响导航渲染；Admin 继续保持隐藏
    }
  }
  const adminNavItem = root.querySelector('#adminNavItem');
  if (user && user.role === 'admin') {
    adminNavItem?.classList.remove('d-none');
  } else {
    adminNavItem?.classList.add('d-none');
  }

  /**
   * 导航高亮：更健壮的匹配策略
   * - 规范化当前文件名（去扩展名、转小写）
   * - 优先使用 data-route 与当前路由名匹配
   * - 回退到 href 文件名匹配
   * - 对登录页（index.html）不高亮任何菜单，避免误导
   */
  const name = file.endsWith('.html') ? file.slice(0, -5) : file;
  const links = root.querySelectorAll('a.nav-link');
  // 清理现有 active，避免重复高亮
  links.forEach(a => {
    a.classList.remove('active');
    a.removeAttribute('aria-current');
  });
  if (name === '' || name === 'index') {
    return; // 登录页不高亮导航
  }
  let matched = false;
  links.forEach(a => {
    const route = (a.getAttribute('data-route') || '').toLowerCase();
    if (route && route === name) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
      matched = true;
    }
  });
  if (!matched) {
    links.forEach(a => {
      const hrefFile = (a.getAttribute('href') || '').split('/').pop().toLowerCase();
      const hrefName = hrefFile.endsWith('.html') ? hrefFile.slice(0, -5) : hrefFile;
      if (hrefName === name) {
        a.classList.add('active');
        a.setAttribute('aria-current', 'page');
      }
    });
  }
}
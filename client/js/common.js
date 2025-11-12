import { clearToken, clearCsrfToken } from './api.js';

function logout() {
  clearToken();
  clearCsrfToken();
  window.location.href = 'index.html';
}

export { logout };
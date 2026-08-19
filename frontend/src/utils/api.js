import axios from 'axios';

const api = axios.create({
  baseURL: '/api'
});

/* Derive the admin URL key from the current path (/<key>/admin).
 * The URL the admin is actually on is the source of truth. */
const getPathAdminKey = () => {
  const segs = window.location.pathname.split('/').filter(Boolean);
  return segs.length >= 2 && segs[1] === 'admin' ? segs[0] : null;
};

const isAdminRoute = (url) =>
  (url || '').startsWith('/admin/') || (url || '').includes('/admin/');

api.interceptors.request.use((config) => {
  const adminToken   = localStorage.getItem('adminToken');
  const studentToken = localStorage.getItem('studentToken');

  // Prefer the key from the current admin URL path over any stale
  // value cached in localStorage (keeps in sync with .env ADMIN_URL_KEY).
  const pathKey = getPathAdminKey();
  let urlKey = localStorage.getItem('adminUrlKey');

  if (pathKey) {
    urlKey = pathKey;
    localStorage.setItem('adminUrlKey', pathKey);
  }

  // ── Token selection: route-aware, never mix admin/student ──────────────
  // Student routes: anything under /api/student/*
  // Admin routes: anything under /api/admin/*
  const url = config.url || '';
  const isStudentRoute = url.startsWith('/student/') || url.includes('/student/');

  if (isStudentRoute && studentToken) {
    // Student route → always use student token regardless of admin token presence
    config.headers['Authorization'] = `Bearer ${studentToken}`;
  } else if (isAdminRoute(url) && adminToken) {
    // Admin route → use admin token
    config.headers['Authorization'] = `Bearer ${adminToken}`;
  } else if (adminToken) {
    // Fallback for unrecognised routes: prefer admin if logged in as admin
    config.headers['Authorization'] = `Bearer ${adminToken}`;
  } else if (studentToken) {
    config.headers['Authorization'] = `Bearer ${studentToken}`;
  }

  if (urlKey) {
    config.headers['x-admin-url-key'] = urlKey;
  }

  return config;
}, (error) => Promise.reject(error));

/* ── Reconcile on 403 (Invalid Admin URL Key) ─────────────────────────────
 * The .env key changed: detect the canonical key from the backend and
 * redirect the current admin session to the correct /<key>/admin URL. */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';

    if (status === 403 && isAdminRoute(url)) {
      try {
        const { data } = await api.get('/admin/config');
        const canonical = data.adminUrlKey;
        if (canonical) {
          localStorage.setItem('adminUrlKey', canonical);
          const segs = window.location.pathname.split('/').filter(Boolean);
          if (segs[1] === 'admin' && segs[0] !== canonical) {
            window.location.href = `/${canonical}/admin`;
            return new Promise(() => {}); // halt; page will reload on redirect
          }
        }
      } catch (_) {
        // Backend unreachable — fall through and reject as normal.
      }
    }

    return Promise.reject(error);
  }
);

export default api;

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
  const adminToken = localStorage.getItem('adminToken');
  const studentToken = localStorage.getItem('studentToken');
  const url = config.url || '';
  const isStudentRoute = url.startsWith('/student/') || url.includes('/student/');
  const isAdminApi = url.startsWith('/admin/') || url.includes('/admin/');
  const isAuthRequest = /\/(admin|user|student)\/auth\/(login|register)$/.test(url);

  if (!isAuthRequest) {
    if (isStudentRoute && studentToken) config.headers['Authorization'] = `Bearer ${studentToken}`;
    else if (isAdminApi && adminToken) config.headers['Authorization'] = `Bearer ${adminToken}`;
    else if (adminToken && !isStudentRoute) config.headers['Authorization'] = `Bearer ${adminToken}`;
    else if (studentToken) config.headers['Authorization'] = `Bearer ${studentToken}`;
  }

  const pathKey = getPathAdminKey();
  const urlKey = pathKey || localStorage.getItem('adminUrlKey');
  if (urlKey && isAdminApi) config.headers['x-admin-url-key'] = urlKey;
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

    // Expired/invalid admin or portal-user session: let AdminContext show the
    // "Session expired" dialog. Login requests are excluded (a wrong password
    // is also a 401 and must be shown on the login form instead).
    const isLoginCall = /\/(admin|user|student)\/auth\/(login|register)$/.test(url);
    if (status === 401 && !isLoginCall && (isAdminRoute(url) || url.includes('/user/auth/'))) {
      window.dispatchEvent(new CustomEvent('eb-admin-session-expired'));
      return Promise.reject(error);
    }

    if (status === 403 && isAdminRoute(url)) {
      const message = error.response?.data?.message || '';
      if (/Invalid Admin URL Key/i.test(message)) {
        try {
          const { data } = await api.get('/admin/config');
          const canonical = data.adminUrlKey;
          if (canonical) {
            localStorage.setItem('adminUrlKey', canonical);
            const segs = window.location.pathname.split('/').filter(Boolean);
            if (segs[1] === 'admin' && segs[0] !== canonical) {
              window.location.href = `/${canonical}/admin`;
              return new Promise(() => {});
            }
          }
        } catch (_) {}
      } else {
        window.dispatchEvent(new CustomEvent('eb-permission-denied', { detail: { message: message || "You don't have permission to perform this action." } }));
        error.permissionHandled = true; // screens use this to avoid showing a second message
      }
    }

    return Promise.reject(error);
  }
);

export default api;

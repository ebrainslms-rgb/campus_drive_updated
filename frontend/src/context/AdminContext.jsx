import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api from '../utils/api';

const AdminContext = createContext();

export const useAdminAuth = () => useContext(AdminContext);

/* ── Derive the admin URL key from the current path (/<key>/admin) ────────
 * The URL path is the single source of truth — .env ADMIN_URL_KEY on the
 * backend must match the segment in the URL the admin actually visited.
 */
export const getAdminUrlKeyFromPath = () => {
  const segs = window.location.pathname.split('/').filter(Boolean);
  if (segs.length >= 2 && segs[1] === 'admin') return segs[0];
  return null;
};

/**
 * JWTs are signed, not encrypted — the payload is plain base64url JSON.
 * Decoding it client-side just to read the "sub" (admin email) the backend
 * already put there avoids a redundant API call for something we already have.
 */
const decodeAdminEmail = (token) => {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return json.sub || null;
  } catch {
    return null;
  }
};

export const AdminProvider = ({ children }) => {
  const [adminToken, setAdminToken] = useState(localStorage.getItem('adminToken') || null);  const [adminUrlKey, setAdminUrlKey] = useState(() => {
    // Prefer the key from the URL the user is on; fall back to storage.
    const pathKey = getAdminUrlKeyFromPath();
    if (pathKey) {
      localStorage.setItem('adminUrlKey', pathKey);
      return pathKey;
    }
    return localStorage.getItem('adminUrlKey') || null;
  });
  
  // Global data state (shared across all components)
  const [colleges, setColleges] = useState([]);       // active only — for dropdowns
  const [allColleges, setAllColleges] = useState([]); // active + inactive — for management table
  const [courses, setCourses] = useState([]);
  const [exams, setExams] = useState([]);
  const [loadingColleges, setLoadingColleges] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingExams, setLoadingExams] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Handle 401 errors globally
  const handleAuthError = useCallback((error) => {
    if (error.response?.status === 401) {
      console.error('Session expired or unauthorized. Logging out...');
      setSessionExpired(true);
      logoutAdmin();
      // Redirect will be handled by the session expired modal
      return true;
    }
    return false;
  }, []);

  // Fetch colleges (active only — for dropdowns like ExamsView)
  const fetchColleges = useCallback(async () => {
    if (!adminToken || !adminUrlKey) return;
    setLoadingColleges(true);
    try {
      const [activeRes, allRes] = await Promise.all([
        api.get('/admin/colleges?all=true&isActive=true'),
        api.get('/admin/colleges?all=true'),
      ]);
      setColleges(activeRes.data.colleges || []);
      setAllColleges(allRes.data.colleges || []);
    } catch (err) {
      if (!handleAuthError(err)) {
        console.error('Error fetching colleges:', err);
      }
    } finally {
      setLoadingColleges(false);
    }
  }, [adminToken, adminUrlKey, handleAuthError]);

  // Fetch courses
  const fetchCourses = useCallback(async () => {
    if (!adminToken || !adminUrlKey) return;
    setLoadingCourses(true);
    try {
      const res = await api.get('/admin/courses');
      setCourses(Array.isArray(res.data) ? res.data : res.data.courses || []);
    } catch (err) {
      if (!handleAuthError(err)) {
        console.error('Error fetching courses:', err);
      }
    } finally {
      setLoadingCourses(false);
    }
  }, [adminToken, adminUrlKey, handleAuthError]);

  // Fetch exams
  const fetchExams = useCallback(async () => {
    if (!adminToken || !adminUrlKey) return;
    setLoadingExams(true);
    try {
      const res = await api.get('/admin/exams');
      setExams(res.data || []);
    } catch (err) {
      if (!handleAuthError(err)) {
        console.error('Error fetching exams:', err);
      }
    } finally {
      setLoadingExams(false);
    }
  }, [adminToken, adminUrlKey, handleAuthError]);

  // Keep the admin URL key in sync with the path the user is actually on
  // (e.g. browser back/forward, or a manual URL change after a .env key edit).
  useEffect(() => {
    const syncKey = () => {
      const pathKey = getAdminUrlKeyFromPath();
      if (pathKey && pathKey !== adminUrlKey) {
        setAdminUrlKey(pathKey);
        localStorage.setItem('adminUrlKey', pathKey);
      }
    };
    window.addEventListener('popstate', syncKey);
    return () => window.removeEventListener('popstate', syncKey);
  }, [adminUrlKey]);

  // Initial data load — runs once when credentials become available.
  // No polling: the Stats panel fetches its own data directly and
  // individual CRUD views call fetchColleges/fetchExams after mutations.
  useEffect(() => {
    if (adminToken && adminUrlKey) {
      fetchColleges();
      fetchCourses();
      fetchExams();
    }
  }, [adminToken, adminUrlKey, fetchColleges, fetchCourses, fetchExams]);

  const loginAdmin = (token, urlKey) => {
    setAdminToken(token);
    setAdminUrlKey(urlKey);
    localStorage.setItem('adminToken', token);
    localStorage.setItem('adminUrlKey', urlKey);
  };

  const logoutAdmin = useCallback(() => {
    setAdminToken(null);
    setAdminUrlKey(null);
    setSessionExpired(false);
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUrlKey');
    
    // Redirect to login page
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    if (pathSegments.length >= 2 && pathSegments[1] === 'admin') {
      window.location.href = `/${pathSegments[0]}/admin`;
    }
  }, []);

  return (
    <AdminContext.Provider value={{
      // Auth
      adminToken,
      adminEmail: adminToken ? decodeAdminEmail(adminToken) : null,
      adminUrlKey,
      loginAdmin,
      logoutAdmin,
      sessionExpired,
      setSessionExpired,
      // Global data
      colleges,       // active only — for dropdowns
      allColleges,    // active + inactive — for management tables
      courses,
      exams,
      loadingColleges,
      loadingCourses,
      loadingExams,
      // Refresh functions
      fetchColleges,
      fetchCourses,
      fetchExams,
    }}>
      {children}
      
      {/* Session Expired Modal */}
      {sessionExpired && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md mx-4 p-6 rounded-2xl border"
            style={{ 
              background: "rgba(15,23,42,0.95)", 
              borderColor: "rgba(248,113,113,0.3)",
              boxShadow: "0 8px 32px rgba(248,113,113,0.15)"
            }}>
            
            {/* Error Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "rgba(248,113,113,0.1)", border: "2px solid rgba(248,113,113,0.3)" }}>
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="#F87171" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>

            {/* Message */}
            <h2 className="text-xl font-bold text-white text-center mb-2">
              Session Expired
            </h2>
            <p className="text-sm text-center mb-6" style={{ color: "#F87171" }}>
              Your session has expired. Please log in again to manage system parameters.
            </p>

            {/* Action Button */}
            <button
              onClick={() => {
                setSessionExpired(false);
                logoutAdmin();
              }}
              className="w-full py-3 px-4 rounded-xl font-semibold text-white transition-all duration-200"
              style={{ 
                background: "linear-gradient(135deg, #F87171 0%, #EF4444 100%)",
                boxShadow: "0 4px 12px rgba(248,113,113,0.3)"
              }}>
              Return to Login
            </button>
          </div>
        </div>
      )}
    </AdminContext.Provider>
  );
};

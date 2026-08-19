import React, { createContext, useContext, useState, useCallback } from 'react';

const StudentAuthContext = createContext();

export const useStudentAuth = () => useContext(StudentAuthContext);

/**
 * Mirrors AdminContext's pattern: the token lives in localStorage as the
 * source of truth, so a browser refresh restores the authenticated state
 * instead of bouncing the student back to login. Route protection (see
 * ProtectedStudentRoute in App.jsx) reads studentToken from here, not from
 * any in-memory-only flag.
 */
export const StudentAuthProvider = ({ children }) => {
  const [studentToken, setStudentToken] = useState(localStorage.getItem('studentToken') || null);
  const [sessionExpired, setSessionExpired] = useState(false);

  const loginStudent = useCallback((token) => {
    localStorage.setItem('studentToken', token);
    setStudentToken(token);
  }, []);

  const logoutStudent = useCallback(() => {
    localStorage.removeItem('studentToken');
    setStudentToken(null);
    setSessionExpired(false);
  }, []);

  const handleAuthError = useCallback((error) => {
    if (error?.response?.status === 401) {
      setSessionExpired(true);
      return true;
    }
    return false;
  }, []);

  return (
    <StudentAuthContext.Provider value={{
      studentToken,
      loginStudent,
      logoutStudent,
      sessionExpired,
      setSessionExpired,
      handleAuthError,
    }}>
      {children}

      {sessionExpired && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl border bg-white p-6 text-center shadow-xl" style={{ borderColor: '#E2E8F0' }}>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="#EF4444" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-800">Session expired</h2>
            <p className="mt-1.5 text-sm text-slate-500">Please sign in again to continue.</p>
            <button
              onClick={logoutStudent}
              className="mt-5 w-full rounded-xl py-2.5 font-semibold text-white transition-colors"
              style={{ background: '#0F62FE' }}>
              Return to login
            </button>
          </div>
        </div>
      )}
    </StudentAuthContext.Provider>
  );
};

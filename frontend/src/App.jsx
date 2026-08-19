/**
 * App.jsx – EchoBrains Portal · Route table
 *
 * Every screen has a real, addressable URL. Auth state lives in
 * AdminContext / StudentAuthContext (backed by localStorage), and route
 * guards read from there — never from in-memory-only component state — so
 * a browser refresh always restores the correct page instead of bouncing
 * back to login/overview.
 */

import React, { useEffect } from "react";
import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";

import Login      from "./components/Login.jsx";
import Register   from "./components/Register.jsx";
import AdminLogin  from "./components/AdminLogin.jsx";
import AdminDashboard from "./components/dashboard/AdminDashboard.jsx";
import RulesPage  from "./components/RulesPage.jsx";
import ExamPage   from "./components/ExamPage.jsx";
import ResultPage from "./components/ResultPage.jsx";
import NotFound   from "./components/NotFound.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import ThemeToggle from "./components/shared/ThemeToggle.jsx";

import { useAdminAuth } from "./context/AdminContext";
import { useStudentAuth } from "./context/StudentAuthContext";

/* ── Route guards ──────────────────────────────────────────────────────── */

/** Only lets an authenticated student through; otherwise sends them to login. */
function ProtectedStudentRoute({ children }) {
  const { studentToken } = useStudentAuth();
  const location = useLocation();
  if (!studentToken) {
    return <Navigate to="/student/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

/**
 * Only lets an authenticated admin through, and only for the URL key their
 * token was issued under — a stale token for a different /{key}/admin
 * doesn't leak access to this one.
 */
function ProtectedAdminRoute({ children }) {
  const { adminToken, adminUrlKey } = useAdminAuth();
  const { adminKey } = useParams();
  if (!adminToken || adminUrlKey !== adminKey) {
    return <Navigate to={`/${adminKey}/admin`} replace />;
  }
  return children;
}

/** The bare /{key}/admin URL: shows the login form, or bounces straight to
 *  the dashboard if this browser already holds a valid session for this key. */
function AdminEntry() {
  const { adminToken, adminUrlKey } = useAdminAuth();
  const { adminKey } = useParams();
  if (adminToken && adminUrlKey === adminKey) {
    return <Navigate to={`/${adminKey}/admin/overview`} replace />;
  }
  return <AdminShell><AdminLogin /></AdminShell>;
}

/* ── Shared chrome for public student/admin-login screens ───────────────── */
function AdminShell({ children }) {
  useEffect(() => { document.title = "EchoBrains · Admin Portal"; }, []);
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative" style={{ background: "var(--eb-bg)" }}>
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8 select-none">
          <img src="/logo.png" alt="EchoBrains Logo" className="h-10 w-auto object-contain" draggable={false} />
          <span className="text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: "var(--eb-text-muted)" }}>
            Admin Portal
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── App root ─────────────────────────────────────────────────────────── */
export default function App() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    if (path.includes("/admin")) document.title = "EchoBrains · Admin Portal";
    else if (path.startsWith("/student/rules")) document.title = "EchoBrains · Exam Rules";
    else if (path.startsWith("/student/exam")) document.title = "EchoBrains · Secure Exam";
    else if (path.startsWith("/student/result")) document.title = "EchoBrains · Result";
    else if (path.startsWith("/student/register")) document.title = "EchoBrains · Register";
    else document.title = "EchoBrains · Student Portal";
  }, [location.pathname]);

  return (
    <ErrorBoundary>
      <Routes>
        {/* Student portal */}
        <Route path="/" element={<Navigate to="/student/login" replace />} />
        <Route path="/student/login" element={<Login />} />
        <Route path="/student/register" element={<Register />} />
        <Route path="/student/rules" element={
          <ProtectedStudentRoute><RulesPage /></ProtectedStudentRoute>
        } />
        <Route path="/student/exam" element={
          <ProtectedStudentRoute><ExamPage /></ProtectedStudentRoute>
        } />
        <Route path="/student/result" element={
          <ProtectedStudentRoute><ResultPage /></ProtectedStudentRoute>
        } />

        {/* Admin portal — :adminKey mirrors the backend's app.admin.url-key */}
        <Route path="/:adminKey/admin" element={<AdminEntry />} />
        <Route path="/:adminKey/admin/*" element={
          <ProtectedAdminRoute><AdminDashboard /></ProtectedAdminRoute>
        } />

        {/* Anything else */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ErrorBoundary>
  );
}

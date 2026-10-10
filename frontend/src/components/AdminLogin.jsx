import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import { useAdminAuth } from "../context/AdminContext";

function IconMail() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
}

function IconLock() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>;
}

function IconEye({ open }) {
  return open ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>;
}

function Field({ label, icon, error, children }) {
  return <div><label className="eb-label">{label}</label><div className="relative flex items-center"><span className="absolute left-3.5 pointer-events-none" style={{ color: "var(--eb-text-faint)" }}>{icon}</span>{children}</div>{error && <p className="eb-error">{error}</p>}</div>;
}

export default function AdminLogin() {
  const adminUrlKey = import.meta.env.VITE_ADMIN_URL_KEY || "eb-admin-2026";
  const navigate = useNavigate();
  const { loginAdmin } = useAdminAuth();
  const [mode, setMode] = useState("ADMIN");
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [success, setSuccess] = useState(false);

  const switchMode = next => {
    setMode(next);
    setForm({ email: "", password: "" });
    setErrors({});
    setApiError("");
    setShowPwd(false);
  };

  const set = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: "" }));
    setApiError("");
  };

  const validate = () => {
    const e = {};
    if (!form.email.trim()) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email address.";
    if (!form.password) e.password = "Password is required.";
    return e;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const validation = validate();
    if (Object.keys(validation).length) { setErrors(validation); return; }
    setLoading(true);
    setApiError("");
    try {
      const endpoint = mode === "ADMIN" ? "/admin/auth/login" : "/user/auth/login";
      const response = await api.post(endpoint, { email: form.email.trim(), password: form.password });
      if (!response.data?.token) throw new Error("No token returned");
      const canonicalKey = response.data.adminUrlKey || adminUrlKey;
      loginAdmin(response.data.token, canonicalKey);
      setSuccess(true);
      setTimeout(() => navigate(`/${canonicalKey}/admin/overview`), 500);
    } catch (err) {
      const status = err.response?.status;
      const serverMessage = typeof err.response?.data === "object" ? err.response?.data?.message : "";
      if (!err.response) setApiError(err.message === "No token returned" ? "Unexpected response from the server. Please try again." : "Cannot reach the server. Please check that the backend is running and try again.");
      else if (status === 502 || status === 503 || status === 504) setApiError("The server is starting up or unavailable. Please wait a moment and try again.");
      else if (status >= 500) setApiError("Server error while signing in. Please check the backend logs.");
      else if (status === 403 && /url key/i.test(serverMessage || "")) setApiError("Invalid Admin URL Key.");
      else if (status === 400 && !serverMessage) setApiError("Please enter a valid email and password.");
      else setApiError(serverMessage || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  if (success) return <div className="eb-card"><div className="flex flex-col items-center justify-center py-8"><div className="flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ background: "rgba(16,185,129,.10)", border: "2px solid rgba(16,185,129,.40)" }}><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="#10B981" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg></div><h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Login Successful!</h2><p className="text-sm mt-2" style={{ color: "var(--eb-text-muted)" }}>Opening your {mode === "ADMIN" ? "admin" : "user"} portal.</p></div></div>;

  return <div className="eb-card" style={{ borderColor: "rgba(249,115,22,.3)" }}>
    <div className="mb-5"><h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Portal Access</h2><p className="text-sm mt-1" style={{ color: "var(--eb-text-muted)" }}>Choose how you want to sign in.</p></div>
    <div className="grid grid-cols-2 gap-2 p-1 rounded-xl mb-6" style={{ background: "var(--eb-bg)" }}>
      <button type="button" onClick={() => switchMode("ADMIN")} className="py-2.5 rounded-lg text-sm font-semibold transition" style={{ background: mode === "ADMIN" ? "var(--eb-blue)" : "transparent", color: mode === "ADMIN" ? "white" : "var(--eb-text-muted)" }}>Admin Login</button>
      <button type="button" onClick={() => switchMode("USER")} className="py-2.5 rounded-lg text-sm font-semibold transition" style={{ background: mode === "USER" ? "var(--eb-blue)" : "transparent", color: mode === "USER" ? "white" : "var(--eb-text-muted)" }}>User Login</button>
    </div>
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <Field label="Email ID" icon={<IconMail />} error={errors.email}><input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder={mode === "ADMIN" ? "Enter admin email" : "Enter your email"} className="eb-input pl-10" disabled={loading} autoComplete="email" /></Field>
      <Field label="Password" icon={<IconLock />} error={errors.password}><input type={showPwd ? "text" : "password"} value={form.password} onChange={e => set("password", e.target.value)} placeholder="Enter your password" className="eb-input pl-10 pr-11" disabled={loading} autoComplete="off" /><button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3" style={{ color: showPwd ? "var(--eb-blue)" : "var(--eb-text-faint)" }} aria-label={showPwd ? "Hide password" : "Show password"}><IconEye open={showPwd} /></button></Field>
      {apiError && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.25)", color: "#DC2626" }}>{apiError}</div>}
      <button type="submit" className="eb-btn mt-2" disabled={loading}>{loading ? <><span className="spinner" /> Verifying…</> : <>Login as {mode === "ADMIN" ? "Admin" : "User"}<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg></>}</button>
    </form>
  </div>;
}

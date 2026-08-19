import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../utils/api";
import { useAdminAuth } from "../context/AdminContext";

/* ── Small reusable icon components ─────────────────────────────────────── */
function IconMail() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function IconEye({ open }) {
  return open ? (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

/* ── Field wrapper ───────────────────────────────────────────────────────── */
function Field({ label, icon, error, children }) {
  return (
    <div>
      <label className="eb-label">{label}</label>
      <div className="relative flex items-center">
        <span className="absolute left-3.5 pointer-events-none" style={{ color: "var(--eb-text-faint)" }}>
          {icon}
        </span>
        {children}
      </div>
      {error && (
        <p className="eb-error">
          <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

/* ── Component ───────────────────────────────────────────────────────────── */
export default function AdminLogin() {
  const { adminKey: adminUrlKey } = useParams();
  const navigate = useNavigate();
  const { loginAdmin } = useAdminAuth();
  const [form, setForm]       = useState({ email: "", password: "" });
  const [errors, setErrors]   = useState({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [success, setSuccess] = useState(false);

  const set = (key, val) => {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => ({ ...e, [key]: "" }));
    setApiError("");
  };

  /* ── Client-side validation ──────────────────────────────────────────── */
  const validate = () => {
    const e = {};
    if (!form.email.trim())                             e.email      = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email address.";
    if (!form.password)                                 e.password   = "Password is required.";
    return e;
  };

  /* ── Submit ──────────────────────────────────────────────────────────── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    setApiError("");
    try {
      const response = await api.post("/admin/auth/login", form, {
        headers: {
          "x-admin-url-key": adminUrlKey
        }
      });
      
      loginAdmin(response.data.token, adminUrlKey);
      setSuccess(true);
      setTimeout(() => navigate(`/${adminUrlKey}/admin/overview`), 900);
    } catch (err) {
      if (err.response && err.response.status === 403) {
        setApiError("Invalid Admin URL Key.");
      } else {
        setApiError(err.response?.data?.message || "Login failed. Please check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  if (success) {
    return (
      <div className="eb-card">
        <div className="flex flex-col items-center justify-center py-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-full mb-4"
            style={{
              background: "rgba(16, 185, 129, 0.10)",
              border: "2px solid rgba(16, 185, 129, 0.40)",
            }}>
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24"
              stroke="#10B981" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Admin Login Successful!</h2>
          <p className="text-sm mt-2" style={{ color: "var(--eb-text-muted)" }}>
            Welcome to the EchoBrains Admin Portal.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="eb-card" style={{ borderColor: "rgba(249,115,22,0.3)" }}>
      {/* Header */}
      <div className="mb-7">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Admin Access</h2>
        <p className="text-sm mt-1" style={{ color: "var(--eb-text-muted)" }}>
          Sign in to access the administrator dashboard.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">

        {/* Email */}
        <Field label="Admin Email" icon={<IconMail />} error={errors.email}>
          <input
            type="email"
            value={form.email}
            onChange={e => set("email", e.target.value)}
            placeholder="admin@echobrains.com"
            className="eb-input pl-10"
            disabled={loading}
            autoComplete="email"
          />
        </Field>

        {/* Password */}
        <Field label="Password" icon={<IconLock />} error={errors.password}>
          <input
            type={showPwd ? "text" : "password"}
            value={form.password}
            onChange={e => set("password", e.target.value)}
            placeholder="Enter your admin password"
            className="eb-input pl-10 pr-11"
            disabled={loading}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowPwd(v => !v)}
            className="absolute right-3 transition-colors duration-150"
            style={{ color: showPwd ? "var(--eb-blue)" : "var(--eb-text-faint)" }}
            tabIndex={-1}
            aria-label={showPwd ? "Hide password" : "Show password"}
          >
            <IconEye open={showPwd} />
          </button>
        </Field>

        {/* API-level error */}
        {apiError && (
          <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm"
            style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", color: "#DC2626" }}>
            <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {apiError}
          </div>
        )}

        {/* Submit */}
        <button type="submit" className="eb-btn mt-2" disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" />
              Verifying…
            </>
          ) : (
            <>
              Access Dashboard
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

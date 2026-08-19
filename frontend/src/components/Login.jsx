/**
 * Login.jsx
 * EchoBrains Student Login
 *
 * Theme: reads resolvedTheme from the shared ThemeContext (useTheme()) -
 * this is the single source of truth. Do NOT reimplement theme detection
 * here; ThemeToggle already writes to the same context, and every other
 * page in the app reads from it too. A locally-reimplemented theme state
 * here would silently desync from the actual toggle.
 *
 * College is NOT a form field at all. The login form is Email + Exam
 * Code only - once the exam code resolves via a read-only lookup
 * (GET /api/student/auth/exam-lookup), the college name and location are
 * shown as plain read-only text, never an editable input or dropdown.
 * There is no manual-fallback college selector anymore: if the code
 * doesn't resolve to a currently-loggable exam, the student sees the
 * relevant message (too early / expired / not found) and cannot submit
 * until they enter a code that does resolve.
 *
 * Backend/API: existing login API and StudentAuthContext are unchanged
 * (collegeName is still sent in the login POST body, it's just sourced
 * from the resolved lookup instead of a form field the student edits).
 */

import React, {
  useState,
  useEffect,
  useRef,
} from "react";

import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import { stateToCode } from "../utils/stateCodes";
import { useStudentAuth } from "../context/StudentAuthContext";
import { useTheme } from "../context/ThemeContext";
import ThemeToggle from "./shared/ThemeToggle.jsx";
import { authPromoHighlights } from "../content/promoContent";

/* ============================================================
   ICONS
============================================================ */

function IconMail() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
function IconKey() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8" />
      <path d="m16 5 3 3" />
      <path d="m14 7 3 3" />
    </svg>
  );
}
function IconBuilding() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21h16" />
      <path d="M6 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16" />
      <path d="M9 8h1" /><path d="M14 8h1" /><path d="M9 12h1" /><path d="M14 12h1" /><path d="M9 16h1" /><path d="M14 16h1" />
    </svg>
  );
}
function IconEye({ open }) {
  if (open) {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 3 18 18" />
      <path d="M10.6 6.2A10.7 10.7 0 0 1 12 6c6 0 9.5 6 9.5 6a17.8 17.8 0 0 1-3 3.8" />
      <path d="M6.7 6.8C4 8.6 2.5 12 2.5 12s3.5 6 9.5 6c1.4 0 2.6-.3 3.7-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h13" /><path d="m13 6 6 6-6 6" />
    </svg>
  );
}
function IconAlert() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" />
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** Inline SVG illustration - no external asset dependency, always renders
 *  (a referenced /student-illustration.png would 404 if that file was
 *  never actually added to /public, silently leaving a blank gap). */
function AuthIllustration() {
  return (
    <svg viewBox="0 0 220 160" style={{ width: "min(230px, 80%)", margin: "0 auto", display: "block" }} aria-hidden="true">
      <rect x="20" y="120" width="150" height="8" rx="4" fill="rgba(255,255,255,0.25)" />
      <rect x="70" y="95" width="60" height="26" rx="3" fill="rgba(255,255,255,0.92)" />
      <rect x="75" y="99" width="50" height="17" rx="1.5" fill="var(--login-blue-dark)" />
      <path d="M66 121 L134 121 L128 128 L72 128 Z" fill="rgba(255,255,255,0.78)" />
      <rect x="88" y="128" width="8" height="20" rx="2" fill="rgba(255,255,255,0.3)" />
      <circle cx="92" cy="80" r="14" fill="#FBCFA0" />
      <path d="M78 128 Q78 100 92 98 Q106 100 106 128 Z" fill="var(--login-orange)" />
      <rect x="82" y="108" width="20" height="16" rx="4" fill="var(--login-orange)" />
      <rect x="20" y="108" width="14" height="14" rx="2" fill="rgba(255,255,255,0.4)" />
      <path d="M27 108 Q20 96 27 88 Q34 96 27 108 Z" fill="#34D399" />
      <path d="M27 108 Q34 100 40 92" stroke="#34D399" strokeWidth="2" fill="none" />
      <circle cx="170" cy="70" r="12" fill="#FBBF24" opacity="0.9" />
      <rect x="166" y="80" width="8" height="6" rx="1.5" fill="#FBBF24" opacity="0.7" />
      <path d="M170 58 L170 52 M180 62 L185 58 M160 62 L155 58" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ============================================================
   LOCAL STYLES
============================================================ */

const loginStyles = `
.eb-login-page {
  --login-orange: #f36f21;
  --login-orange-dark: #e85d0d;
  --login-blue: #1677d2;
  --login-blue-dark: #0959a8;

  --login-bg: #f7f9fc;
  --login-surface: #ffffff;
  --login-text: #14213d;
  --login-muted: #5b6472;
  --login-border: #dfe5ec;
  --login-input: #ffffff;

  min-height: 100vh;
  background: var(--login-bg);
  color: var(--login-text);
  font-size: 15px;
}

.eb-login-page.eb-dark {
  --login-bg: #0b1220;
  --login-surface: #111a2b;
  --login-text: #f3f6fb;
  --login-muted: #b7c0d1;
  --login-border: #45597a;
  --login-input: #17233a;
}

.eb-login-shell {
  min-height: 100vh;
  display: flex;
  align-items: stretch;
}

.eb-login-layout {
  width: 100%;
  min-height: 100vh;
  display: flex;
  overflow: hidden;
  background: var(--login-surface);
}

@keyframes ebSlideInLeft {
  from { opacity: 0; transform: translateX(-28px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes ebSlideInRight {
  from { opacity: 0; transform: translateX(28px); }
  to   { opacity: 1; transform: translateX(0); }
}
.eb-slide-left  { animation: ebSlideInLeft .45s cubic-bezier(0.16, 1, 0.3, 1) both; }
.eb-slide-right { animation: ebSlideInRight .45s cubic-bezier(0.16, 1, 0.3, 1) both; }

.eb-brand-side {
  width: 46%;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 52px 55px 32px;
  background:
    radial-gradient(circle at 10% 15%, rgba(243, 111, 33, 0.13), transparent 38%),
    radial-gradient(circle at 90% 90%, rgba(22, 119, 210, 0.14), transparent 40%),
    linear-gradient(135deg, #fff7f0 0%, #fffaf7 35%, #f7fbff 68%, #eef7ff 100%);
}

.eb-dark .eb-brand-side {
  background:
    radial-gradient(circle at 10% 15%, rgba(243, 111, 33, 0.17), transparent 38%),
    radial-gradient(circle at 90% 90%, rgba(22, 119, 210, 0.20), transparent 40%),
    linear-gradient(135deg, #17151a 0%, #111827 48%, #0b1a2d 100%);
}

.eb-brand-glow { position: absolute; width: 250px; height: 250px; border-radius: 50%; background: rgba(243, 111, 33, 0.07); filter: blur(5px); top: -100px; left: -90px; pointer-events: none; }
.eb-brand-glow-blue { position: absolute; width: 280px; height: 280px; border-radius: 50%; background: rgba(22, 119, 210, 0.07); filter: blur(5px); bottom: -150px; right: -100px; pointer-events: none; }

.eb-brand-content { position: relative; z-index: 2; max-width: 430px; }
.eb-logo { width: 228px; height: auto; object-fit: contain; object-position: left center; }

.eb-brand-title { margin-top: 45px; font-size: clamp(27px, 3vw, 38px); line-height: 1.1; font-weight: 800; letter-spacing: -0.8px; color: var(--login-text); }
.eb-brand-subtitle { margin-top: 10px; font-size: 15px; line-height: 1.6; color: var(--login-muted); max-width: 300px; }

.eb-feature-list { margin-top: 34px; display: flex; flex-direction: column; gap: 20px; }
.eb-feature { display: flex; align-items: flex-start; gap: 13px; }
.eb-feature-icon { flex: 0 0 32px; width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; background: rgba(243, 111, 33, 0.10); color: var(--login-orange); }
.eb-feature:nth-child(2) .eb-feature-icon { background: rgba(22, 119, 210, 0.10); color: var(--login-blue); }
.eb-feature:nth-child(3) .eb-feature-icon { background: rgba(243, 111, 33, 0.08); color: var(--login-orange); }
.eb-feature-title { font-size: 14.5px; font-weight: 700; color: var(--login-text); }
.eb-feature-description { margin-top: 3px; font-size: 12.5px; line-height: 1.5; color: var(--login-muted); }

.eb-illustration-wrap { position: relative; z-index: 2; width: 100%; display: flex; justify-content: center; align-items: flex-end; margin-top: 20px; }
.eb-dots { display: flex; justify-content: center; align-items: center; gap: 6px; margin-top: 12px; }
.eb-dot { width: 5px; height: 5px; border-radius: 50%; background: #9aa5b5; }
.eb-dot.active { width: 6px; height: 6px; background: var(--login-orange); }

.eb-form-side { width: 54%; min-width: 0; display: flex; align-items: center; justify-content: center; position: relative; background: var(--login-surface); padding: 45px 65px; }

/* Fixed to the viewport corner - NOT relative to the two-column layout,
   which resizes/reflows between screens and was causing the toggle to
   visually jump around. */
.eb-theme-position { position: fixed; top: 20px; right: 24px; z-index: 999; }

.eb-form-container { width: 100%; max-width: 445px; }

.eb-login-heading { font-size: 29px; line-height: 1.2; font-weight: 800; letter-spacing: -0.5px; color: var(--login-text); }
.eb-login-description { margin-top: 8px; font-size: 14.5px; line-height: 1.6; color: var(--login-muted); }

.eb-login-form { margin-top: 31px; display: flex; flex-direction: column; gap: 18px; }
.eb-login-field { width: 100%; }
.eb-login-label { display: block; margin-bottom: 7px; font-size: 12.5px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: var(--login-text); }

.eb-login-input-wrap { position: relative; }
.eb-login-input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); display: flex; color: #9aa5b5; z-index: 2; }

.eb-login-input {
  width: 100%; height: 49px; border-radius: 9px; border: 1.5px solid var(--login-border); outline: none;
  background: var(--login-input); color: var(--login-text); padding: 0 43px 0 42px; font-size: 14.5px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06);
  transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
}
.eb-dark .eb-login-input { box-shadow: 0 1px 3px rgba(0,0,0,0.25); }
.eb-login-input::placeholder { color: #98a2b3; }
.eb-login-input:hover { border-color: #b9c4d2; }
.eb-login-input:focus { border-color: var(--login-blue); box-shadow: 0 0 0 3px rgba(22, 119, 210, 0.11); }
.eb-login-input:disabled { opacity: .65; cursor: not-allowed; }

.eb-login-eye { position: absolute; right: 13px; top: 50%; transform: translateY(-50%); border: none; background: transparent; padding: 4px; color: #9aa5b5; cursor: pointer; }
.eb-login-eye:hover { color: var(--login-blue); }

.eb-login-hint { margin-top: 6px; display: flex; align-items: center; gap: 5px; color: var(--login-blue); font-size: 12px; }
.eb-login-error { margin-top: 6px; display: flex; align-items: center; gap: 5px; color: #dc2626; font-size: 12.5px; }

.eb-login-api-error { display: flex; align-items: flex-start; gap: 9px; padding: 12px 13px; border-radius: 9px; background: rgba(220, 38, 38, 0.08); border: 1px solid rgba(220, 38, 38, 0.20); color: #dc2626; font-size: 13.5px; line-height: 1.5; }

/* Read-only college display block - shown once the exam code resolves.
   Deliberately NOT an input/select of any kind - plain text, nothing to
   click or edit. */
.eb-login-college-display {
  display: flex; align-items: flex-start; gap: 11px;
  padding: 13px 14px; border-radius: 9px;
  background: rgba(22, 119, 210, 0.06); border: 1px solid rgba(22, 119, 210, 0.25);
}
.eb-login-college-display-icon { flex-shrink: 0; color: var(--login-blue); margin-top: 1px; }
.eb-login-college-display-name { font-size: 14px; font-weight: 700; color: var(--login-blue); line-height: 1.3; }
.eb-login-college-display-location { font-size: 12px; color: var(--login-muted); margin-top: 2px; }

.eb-login-submit {
  width: 100%; height: 50px; margin-top: 2px; border: none; border-radius: 9px; display: flex;
  align-items: center; justify-content: center; gap: 9px; background: linear-gradient(135deg, var(--login-blue), #0b69c4);
  color: white; font-size: 14.5px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 18px rgba(22, 119, 210, 0.20);
  transition: transform .18s ease, box-shadow .18s ease, opacity .18s ease;
}
.eb-login-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 11px 22px rgba(22, 119, 210, 0.26); }
.eb-login-submit:active:not(:disabled) { transform: translateY(0); }
.eb-login-submit:disabled { opacity: .65; cursor: not-allowed; }

.eb-login-register { margin-top: 20px; text-align: center; color: var(--login-muted); font-size: 13.5px; }
.eb-login-register-link { color: var(--login-blue); font-weight: 700; cursor: pointer; margin-left: 3px; }
.eb-login-register-link:hover { text-decoration: underline; }

.eb-login-welcome { width: 100%; max-width: 420px; border-radius: 18px; border: 1px solid var(--login-border); background: var(--login-surface); padding: 42px 28px; text-align: center; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.10); }
.eb-login-welcome-icon { width: 65px; height: 65px; margin: 0 auto 17px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(22, 119, 210, 0.10); color: var(--login-blue); }
.eb-login-welcome-title { font-size: 22px; font-weight: 800; color: var(--login-text); }
.eb-login-welcome-text { margin-top: 8px; color: var(--login-muted); font-size: 13.5px; line-height: 1.6; }

.eb-login-loader { margin-top: 20px; display: flex; justify-content: center; gap: 5px; }
.eb-login-loader span { width: 7px; height: 7px; border-radius: 50%; background: var(--login-blue); animation: ebLoginBounce 1s infinite ease-in-out; }
.eb-login-loader span:nth-child(2) { animation-delay: .15s; }
.eb-login-loader span:nth-child(3) { animation-delay: .30s; }
@keyframes ebLoginBounce { 0%, 80%, 100% { transform: translateY(0); opacity: .45; } 40% { transform: translateY(-5px); opacity: 1; } }

@media (max-width: 1100px) {
  .eb-brand-side { padding: 42px 40px 24px; }
  .eb-form-side { padding: 42px 42px; }
  .eb-brand-title { font-size: 30px; }
}

@media (max-width: 900px) {
  .eb-login-layout { min-height: 100vh; flex-direction: column; }
  .eb-brand-side { width: 100%; min-height: 335px; padding: 30px 25px 18px; }
  .eb-brand-title { margin-top: 22px; font-size: 27px; }
  .eb-brand-subtitle { font-size: 14px; }
  .eb-feature-list { margin-top: 22px; gap: 12px; }
  .eb-feature-icon { width: 29px; height: 29px; flex-basis: 29px; }
  .eb-feature-title { font-size: 13px; }
  .eb-feature-description { font-size: 11px; }
  .eb-form-side { width: 100%; flex: 1; padding: 38px 22px 40px; }
  .eb-form-container { max-width: 520px; }
}

@media (max-width: 480px) {
  .eb-brand-side { min-height: 320px; padding: 27px 20px 14px; }
  .eb-logo { width: 145px; }
  .eb-brand-title { font-size: 24px; }
  .eb-feature-list { margin-top: 18px; gap: 10px; }
  .eb-feature:nth-child(n+3) { display: none; }
  .eb-form-side { padding: 34px 18px 35px; }
  .eb-login-heading { font-size: 25px; }
  .eb-theme-position { top: 14px; right: 14px; }
}
`;

/* ============================================================
   BRAND PANEL
============================================================ */

function BrandPanel() {
  return (
    <section className="eb-brand-side eb-slide-left">
      <div className="eb-brand-glow" />
      <div className="eb-brand-glow-blue" />

      <div className="eb-brand-content">
        <img src="/logo.png" alt="EchoBrains" className="eb-logo" draggable={false} />
        <h1 className="eb-brand-title">Assessment Portal</h1>
        <p className="eb-brand-subtitle">Your path to placement starts here</p>

        <div className="eb-feature-list">
          {authPromoHighlights.slice(0, 3).map((item, index) => (
            <div className="eb-feature" key={index}>
              <div className="eb-feature-icon">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
              </div>
              <div>
                <div className="eb-feature-title">{item.title}</div>
                <div className="eb-feature-description">{item.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="eb-illustration-wrap">
        <div style={{ width: "100%" }}>
          <AuthIllustration />
          <div className="eb-dots">
            <span className="eb-dot active" />
            <span className="eb-dot" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   FIELD
============================================================ */

function Field({ label, icon, error, children }) {
  return (
    <div className="eb-login-field">
      <label className="eb-login-label">{label}</label>
      <div className="eb-login-input-wrap">
        <span className="eb-login-input-icon">{icon}</span>
        {children}
      </div>
      {error && <div className="eb-login-error"><IconAlert />{error}</div>}
    </div>
  );
}

/* ============================================================
   WELCOME SCREEN
============================================================ */

function WelcomeScreen({ name }) {
  return (
    <div className="eb-login-welcome">
      <div className="eb-login-welcome-icon">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 4 4L19 6" />
        </svg>
      </div>
      <div className="eb-login-welcome-title">Welcome, {name}!</div>
      <div className="eb-login-welcome-text">
        Your login was successful.<br />Taking you to your examination dashboard...
      </div>
      <div className="eb-login-loader"><span /><span /><span /></div>
    </div>
  );
}

/* ============================================================
   MAIN LOGIN COMPONENT
============================================================ */

export default function Login() {
  const navigate = useNavigate();
  const { loginStudent } = useStudentAuth();

  // Single source of truth for theme - same context ThemeToggle writes to.
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [email, setEmail] = useState("");
  const [examCode, setExamCode] = useState("");
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [welcomeName, setWelcomeName] = useState("");

  // College is purely derived from the exam-code lookup - never a form
  // field the student can type into or select from.
  const [resolvedCollege, setResolvedCollege] = useState(null); // { collegeId, collegeName, location, state }
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupWarning, setLookupWarning] = useState(""); // "too early" / "expired" / "not found" message
  const lastLookedUpCode = useRef("");

  /* Auto-lookup once a full 7-character exam code is typed. The backend
   * returns one of three states, using the exact same window login()
   * itself enforces (for a first-time login) - so this preview can
   * never say "OK" when the actual login would reject it, or vice versa:
   *   OK        -> show college name + location (read-only).
   *   TOO_EARLY -> exam hasn't happened yet; show its scheduled date.
   *   EXPIRED   -> wrong day (after) or past the same-day login window.
   * In every non-OK case, no college info is shown at all. */
  useEffect(() => {
    const code = examCode.trim().toUpperCase();
    setErrors((prev) => ({ ...prev, examCode: "" }));
    setApiError("");

    if (code.length !== 7) {
      setResolvedCollege(null);
      setLookupWarning("");
      lastLookedUpCode.current = "";
      return;
    }

    if (code === lastLookedUpCode.current) return; // avoid refetching the same code repeatedly
    lastLookedUpCode.current = code;

    let cancelled = false;
    setLookupLoading(true);
    setLookupWarning("");
    fetch(`/api/student/auth/exam-lookup?examCode=${encodeURIComponent(code)}`)
      .then((r) => { if (!r.ok) throw new Error("not found"); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        if (data.status === "OK") {
          setResolvedCollege(data);
        } else {
          setResolvedCollege(null);
          if (data.status === "TOO_EARLY" && data.examDate) {
            const formatted = new Date(data.examDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
            setLookupWarning(`This test is scheduled for ${formatted}. Please come back and log in on that day.`);
          } else {
            setLookupWarning("This exam has expired or the code is invalid.");
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedCollege(null);
        setLookupWarning("We couldn't find an exam for this code. Please check and try again.");
      })
      .finally(() => { if (!cancelled) setLookupLoading(false); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCode]);

  const validate = () => {
    const validationErrors = {};
    if (!email.trim()) validationErrors.email = "Email address is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) validationErrors.email = "Enter a valid email address.";
    if (!examCode.trim()) validationErrors.examCode = "Exam code is required.";
    else if (examCode.trim().length !== 7) validationErrors.examCode = "Exam code must be exactly 7 characters.";
    else if (!resolvedCollege) validationErrors.examCode = "Please enter a valid, currently-active exam code.";
    return validationErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) { setErrors(validationErrors); return; }

    setLoading(true);
    setApiError("");
    try {
      const response = await api.post("/student/auth/login", {
        email: email.trim(),
        examCode: examCode.trim().toUpperCase(),
        collegeName: resolvedCollege.collegeName,
      });

      loginStudent(response.data.token);
      const name = response.data.fullName || "Student";
      setWelcomeName(name);

      setTimeout(() => {
        if (response.data.examStarted && !response.data.examSubmitted) {
          navigate("/student/exam");
        } else {
          navigate("/student/rules");
        }
      }, 1200);

    } catch (error) {
      if (error.response?.data?.isSubmitted) {
        navigate("/student/result");
        return;
      }
      setApiError(error.response?.data?.message || "Unable to sign in. Please check your details and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (welcomeName) {
    return (
      <div className={`eb-login-page ${isDark ? "eb-dark" : ""}`}>
        <style>{loginStyles}</style>
        <div className="eb-login-shell" style={{ alignItems: "center", justifyContent: "center" }}>
          <div className="eb-theme-position"><ThemeToggle /></div>
          <WelcomeScreen name={welcomeName} />
        </div>
      </div>
    );
  }

  return (
    <div className={`eb-login-page ${isDark ? "eb-dark" : ""}`}>
      <style>{loginStyles}</style>

      <div className="eb-login-shell">
        <div className="eb-login-layout">
          <BrandPanel />

          <section className="eb-form-side eb-slide-right">
            <div className="eb-theme-position"><ThemeToggle /></div>

            <div className="eb-form-container">
              <h2 className="eb-login-heading">Student Sign In</h2>
              <p className="eb-login-description">Enter your credentials to continue</p>

              <form onSubmit={handleSubmit} noValidate className="eb-login-form">
                <Field label="Email Address" icon={<IconMail />} error={errors.email}>
                  <input type="email" value={email} disabled={loading} autoComplete="email"
                    placeholder="Enter your email" className="eb-login-input"
                    onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: "" })); setApiError(""); }} />
                </Field>

                <Field label="Exam Code" icon={<IconKey />} error={errors.examCode}>
                  <input type={showCode ? "text" : "password"} value={examCode} disabled={loading}
                    maxLength={7} autoComplete="off" placeholder="Enter exam code" className="eb-login-input"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", letterSpacing: "0.12em" }}
                    onChange={(e) => setExamCode(e.target.value.toUpperCase())} />
                  <button type="button" className="eb-login-eye" onClick={() => setShowCode((p) => !p)}
                    aria-label={showCode ? "Hide exam code" : "Show exam code"}>
                    <IconEye open={showCode} />
                  </button>
                </Field>

                {/* Read-only college display - never an input, never
                    editable, only shown once a currently-loggable exam
                    code has resolved. */}
                {resolvedCollege && (
                  <div className="eb-login-college-display">
                    <span className="eb-login-college-display-icon"><IconBuilding /></span>
                    <div>
                      <div className="eb-login-college-display-name">{resolvedCollege.collegeName}</div>
                      {(resolvedCollege.location || resolvedCollege.state) && (
                        <div className="eb-login-college-display-location">
                          {resolvedCollege.location}
                          {resolvedCollege.location && resolvedCollege.state ? ", " : ""}
                          {resolvedCollege.state ? stateToCode(resolvedCollege.state) : ""}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {lookupLoading && !resolvedCollege && (
                  <p className="eb-login-hint" style={{ color: "var(--login-muted)" }}>
                    Checking exam code…
                  </p>
                )}
                {lookupWarning && (
                  <div className="eb-login-api-error">
                    <IconAlert />
                    <span>{lookupWarning}</span>
                  </div>
                )}

                {apiError && <div className="eb-login-api-error"><IconAlert /><span>{apiError}</span></div>}

                <button type="submit" disabled={loading || !resolvedCollege} className="eb-login-submit">
                  {loading ? (
                    <>
                      <span style={{ width: "16px", height: "16px", border: "2px solid rgba(255,255,255,.35)", borderTopColor: "#fff", borderRadius: "50%", animation: "ebLoginSpin .7s linear infinite" }} />
                      Signing in...
                    </>
                  ) : (
                    <>Sign In <IconArrow /></>
                  )}
                </button>
              </form>

              <div className="eb-login-register">
                New here?
                <span className="eb-login-register-link" role="button" tabIndex={0}
                  onClick={() => navigate("/student/register")}
                  onKeyDown={(e) => e.key === "Enter" && navigate("/student/register")}>
                  Create an account
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>

      <style>{`@keyframes ebLoginSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
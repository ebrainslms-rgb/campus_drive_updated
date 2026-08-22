/**
 * Register.jsx
 * EchoBrains Student Registration
 *
 * Theme: reads resolvedTheme from the shared ThemeContext (useTheme()),
 * same as Login.jsx - single source of truth, never reimplemented locally.
 *
 * Backend: existing registration/college/course APIs and validation rules
 * are unchanged.
 */

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import { stateToCode } from "../utils/stateCodes";
import { useTheme } from "../context/ThemeContext";
import ThemeToggle from "./shared/ThemeToggle.jsx";

/* ============================================================
   DYNAMIC OPTIONS - admin-managed via Profile -> Edit Registration Page
   Data. Falls back to these exact original values if the admin hasn't
   customised a given list yet, or if the request fails - registration
   must never be blocked by this fetch not working.
============================================================ */

const FALLBACK_DOMAINS = ["CSE & CSE Allied Branches", "ECE", "ISE", "AI/ML", "EEE"];
const FALLBACK_QUALIFICATIONS = ["B.E/B.Tech", "M.E/M.Tech", "MCA"];
const CURRENT_YEAR = new Date().getFullYear();
const FALLBACK_YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2].map(String);

function useDropdownOptions() {
  const [options, setOptions] = useState({
    DOMAIN: FALLBACK_DOMAINS,
    QUALIFICATION: FALLBACK_QUALIFICATIONS,
    YEAR_OF_PASSING: FALLBACK_YEARS,
  });
  useEffect(() => {
    let cancelled = false;
    api.get("/admin/dropdown-options/public")
      .then(res => {
        if (cancelled || !res.data) return;
        setOptions({
          DOMAIN: res.data.DOMAIN?.length ? res.data.DOMAIN : FALLBACK_DOMAINS,
          QUALIFICATION: res.data.QUALIFICATION?.length ? res.data.QUALIFICATION : FALLBACK_QUALIFICATIONS,
          YEAR_OF_PASSING: res.data.YEAR_OF_PASSING?.length ? res.data.YEAR_OF_PASSING : FALLBACK_YEARS,
        });
      })
      .catch(() => { /* keep fallbacks on any failure */ });
    return () => { cancelled = true; };
  }, []);
  return options;
}

/* ============================================================
   STYLES
============================================================ */

const registerStyles = `
.eb-register-page {
  --register-orange: #f36f21;
  --register-orange-dark: #e85d0d;
  --register-blue: #1677d2;
  --register-blue-dark: #0959a8;

  --register-bg: #f7f9fc;
  --register-surface: #ffffff;
  --register-text: #14213d;
  --register-muted: #5b6472;
  --register-border: #dfe5ec;
  --register-input: #ffffff;

  min-height: 100vh;
  background: var(--register-bg);
  color: var(--register-text);
  font-size: 15px;
}

.eb-register-page.eb-dark {
  --register-bg: #0b1220;
  --register-surface: #111a2b;
  --register-text: #f3f6fb;
  --register-muted: #b7c0d1;
  --register-border: #29364b;
  --register-input: #0e1727;
}

.eb-register-shell { min-height: 100vh; display: flex; align-items: stretch; }
.eb-register-layout { width: 100%; min-height: 100vh; display: flex; overflow: hidden; background: var(--register-surface); }

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

.eb-register-form-side { width: 57%; min-width: 0; display: flex; align-items: center; justify-content: center; position: relative; background: var(--register-surface); padding: 42px 58px; order: 1; }

.eb-register-brand-side {
  width: 43%; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;
  padding: 52px 55px 32px;
  background:
    radial-gradient(circle at 10% 15%, rgba(243, 111, 33, 0.13), transparent 38%),
    radial-gradient(circle at 90% 90%, rgba(22, 119, 210, 0.14), transparent 40%),
    linear-gradient(135deg, #fff7f0 0%, #fffaf7 35%, #f7fbff 68%, #eef7ff 100%);
  order: 2;
}
.eb-dark .eb-register-brand-side {
  background:
    radial-gradient(circle at 10% 15%, rgba(243, 111, 33, 0.17), transparent 38%),
    radial-gradient(circle at 90% 90%, rgba(22, 119, 210, 0.20), transparent 40%),
    linear-gradient(135deg, #17151a 0%, #111827 48%, #0b1a2d 100%);
}

.eb-register-brand-glow { position: absolute; width: 250px; height: 250px; border-radius: 50%; background: rgba(243, 111, 33, 0.07); filter: blur(5px); top: -100px; left: -90px; pointer-events: none; }
.eb-register-brand-glow-blue { position: absolute; width: 280px; height: 280px; border-radius: 50%; background: rgba(22, 119, 210, 0.07); filter: blur(5px); bottom: -150px; right: -100px; pointer-events: none; }

.eb-register-brand-content { position: relative; z-index: 2; max-width: 430px; }
.eb-register-logo { width: 228px; height: auto; object-fit: contain; object-position: left center; }
.eb-register-brand-title { margin-top: 45px; font-size: clamp(27px, 3vw, 38px); line-height: 1.1; font-weight: 800; letter-spacing: -0.8px; color: var(--register-text); }
.eb-register-brand-subtitle { margin-top: 10px; font-size: 15px; line-height: 1.6; color: var(--register-muted); max-width: 300px; }

.eb-register-feature-list { margin-top: 34px; display: flex; flex-direction: column; gap: 20px; }
.eb-register-feature { display: flex; align-items: flex-start; gap: 13px; }
.eb-register-feature-icon { flex: 0 0 32px; width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center; background: rgba(243, 111, 33, 0.10); color: var(--register-orange); }
.eb-register-feature:nth-child(2) .eb-register-feature-icon { background: rgba(22, 119, 210, 0.10); color: var(--register-blue); }
.eb-register-feature:nth-child(3) .eb-register-feature-icon { background: rgba(243, 111, 33, 0.08); color: var(--register-orange); }
.eb-register-feature-title { font-size: 14.5px; font-weight: 700; color: var(--register-text); }
.eb-register-feature-description { margin-top: 3px; font-size: 12.5px; line-height: 1.5; color: var(--register-muted); }

.eb-register-illustration-wrap { position: relative; z-index: 2; width: 100%; display: flex; justify-content: center; align-items: flex-end; margin-top: 20px; }
.eb-register-dots { display: flex; justify-content: center; align-items: center; gap: 6px; margin-top: 12px; }
.eb-register-dot { width: 5px; height: 5px; border-radius: 50%; background: #9aa5b5; }
.eb-register-dot.active { width: 6px; height: 6px; background: var(--register-orange); }

/* Fixed to the viewport corner, not the shifting two-column layout. */
.eb-register-theme { position: fixed; top: 20px; right: 24px; z-index: 999; }

.eb-register-form-container { width: 100%; max-width: 710px; }
.eb-register-heading { font-size: 28px; line-height: 1.2; font-weight: 800; letter-spacing: -0.5px; color: var(--register-text); }
.eb-register-description { margin-top: 7px; font-size: 13.5px; line-height: 1.6; color: var(--register-muted); }
.eb-register-description-star { color: var(--register-orange); font-weight: 800; }

.eb-register-section { margin-top: 24px; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; }
.eb-register-section-line { flex: 1; height: 1px; background: var(--register-border); }
.eb-register-section-title { flex-shrink: 0; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: var(--register-muted); }

.eb-register-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px 17px; }
.eb-register-full { grid-column: 1 / -1; }

.eb-register-field { width: 100%; }
.eb-register-label { display: block; margin-bottom: 6px; font-size: 12px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; color: var(--register-text); }
.eb-register-required { color: var(--register-orange); }

.eb-register-input-wrap { position: relative; width: 100%; }
.eb-register-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); display: flex; color: #9aa5b5; z-index: 2; pointer-events: none; }

.eb-register-input, .eb-register-select {
  width: 100%; height: 46px; border-radius: 8px; border: 1px solid var(--register-border); outline: none;
  background: var(--register-input); color: var(--register-text); padding: 0 38px 0 40px; font-size: 14px;
  transition: border-color .18s ease, box-shadow .18s ease;
}
.eb-register-input::placeholder { color: #98a2b3; }
.eb-register-input:hover, .eb-register-select:hover { border-color: #b9c4d2; }
.eb-register-input:focus, .eb-register-select:focus { border-color: var(--register-blue); box-shadow: 0 0 0 3px rgba(22, 119, 210, 0.10); }
.eb-register-input:disabled, .eb-register-select:disabled { opacity: .65; cursor: not-allowed; }
.eb-register-select { appearance: none; cursor: pointer; }

.eb-register-chevron { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #9aa5b5; display: flex; pointer-events: none; }
.eb-register-readonly { background: rgba(148, 163, 184, .08) !important; color: var(--register-muted) !important; cursor: not-allowed; }

.eb-register-error { margin-top: 5px; display: flex; align-items: center; gap: 5px; color: #dc2626; font-size: 12px; }

.eb-register-college-list { position: absolute; left: 0; right: 0; top: calc(100% + 5px); z-index: 80; max-height: 230px; overflow-y: auto; border: 1px solid var(--register-border); border-radius: 10px; background: var(--register-surface); box-shadow: 0 18px 35px rgba(15, 23, 42, 0.14); }
.eb-register-college-item { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; border: none; background: transparent; color: var(--register-text); padding: 11px 13px; text-align: left; cursor: pointer; }
.eb-register-college-item:hover { background: rgba(22, 119, 210, 0.07); }
.eb-register-college-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.eb-register-college-location { flex-shrink: 0; font-size: 10.5px; color: var(--register-muted); }

.eb-register-chip { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; padding: 4px 8px; border-radius: 7px; font-size: 11px; font-weight: 650; }

.eb-register-api-error { margin-top: 17px; display: flex; align-items: flex-start; gap: 8px; padding: 11px 12px; border-radius: 9px; background: rgba(220, 38, 38, 0.08); border: 1px solid rgba(220, 38, 38, 0.20); color: #dc2626; font-size: 13px; line-height: 1.5; }

.eb-register-submit {
  width: 100%; height: 47px; margin-top: 19px; border: none; border-radius: 8px; display: flex;
  align-items: center; justify-content: center; gap: 8px; background: linear-gradient(135deg, var(--register-blue), #0b69c4);
  color: white; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: 0 8px 18px rgba(22, 119, 210, 0.18);
  transition: transform .18s ease, box-shadow .18s ease, opacity .18s ease;
}
.eb-register-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 11px 22px rgba(22, 119, 210, 0.25); }
.eb-register-submit:disabled { opacity: .65; cursor: not-allowed; }

.eb-register-login-link { margin-top: 16px; text-align: center; font-size: 13px; color: var(--register-muted); }
.eb-register-login-action { margin-left: 3px; color: var(--register-blue); font-weight: 700; cursor: pointer; }
.eb-register-login-action:hover { text-decoration: underline; }

.eb-register-modal-overlay { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(15, 23, 42, .52); backdrop-filter: blur(6px); }
.eb-register-modal { width: 100%; max-width: 400px; border-radius: 17px; border: 1px solid var(--register-border); background: var(--register-surface); padding: 25px; box-shadow: 0 25px 70px rgba(15, 23, 42, .20); }
.eb-register-modal-header { display: flex; align-items: center; gap: 12px; }
.eb-register-modal-icon { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.eb-register-modal-title { font-size: 16.5px; font-weight: 750; color: var(--register-text); }
.eb-register-modal-text { margin-top: 15px; font-size: 13.5px; line-height: 1.65; color: var(--register-muted); }
.eb-register-modal-actions { display: flex; gap: 9px; margin-top: 20px; }
.eb-register-modal-button { flex: 1; height: 41px; border-radius: 8px; border: 1px solid var(--register-border); background: var(--register-surface); color: var(--register-text); font-size: 13px; font-weight: 700; cursor: pointer; }
.eb-register-modal-button.primary { border-color: var(--register-blue); background: var(--register-blue); color: white; }
.eb-register-modal-button:hover { opacity: .9; }

.eb-register-success-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
.eb-register-success { width: 100%; max-width: 420px; padding: 42px 30px; text-align: center; border-radius: 18px; border: 1px solid var(--register-border); background: var(--register-surface); box-shadow: 0 20px 60px rgba(15, 23, 42, .10); }
.eb-register-success-icon { width: 65px; height: 65px; margin: 0 auto 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(22, 119, 210, .10); color: var(--register-blue); }
.eb-register-success-title { font-size: 21px; font-weight: 800; color: var(--register-text); }
.eb-register-success-text { margin-top: 8px; font-size: 13.5px; line-height: 1.6; color: var(--register-muted); }

@media (max-width: 1150px) {
  .eb-register-form-side { padding: 40px 38px; }
  .eb-register-brand-side { padding: 42px 40px 24px; }
}

@media (max-width: 980px) {
  .eb-register-layout { flex-direction: column; }
  .eb-register-form-side { width: 100%; order: 1; padding: 38px 35px; }
  .eb-register-brand-side { width: 100%; order: 2; min-height: 335px; }
  .eb-register-form-container { max-width: 720px; }
}

@media (max-width: 640px) {
  .eb-register-layout { min-height: 100vh; }
  .eb-register-form-side { padding: 32px 18px 35px; }
  .eb-register-heading { font-size: 25px; }
  .eb-register-grid { grid-template-columns: 1fr; gap: 14px; }
  .eb-register-full { grid-column: auto; }
  .eb-register-brand-side { min-height: 310px; padding: 28px 20px 15px; }
  .eb-register-logo { width: 145px; }
  .eb-register-brand-title { margin-top: 22px; font-size: 25px; }
  .eb-register-brand-subtitle { font-size: 13px; }
  .eb-register-feature-list { margin-top: 20px; gap: 11px; }
  .eb-register-feature:nth-child(n + 3) { display: none; }
  .eb-register-theme { top: 14px; right: 14px; }
  .eb-register-modal { padding: 21px; }
}
`;

/* ============================================================
   ICONS
============================================================ */

function IconUser() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>); }
function IconMail() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>); }
function IconPhone() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.7 19.7 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.4 1.9.6 2.9.7A2 2 0 0 1 22 16.9Z" /></svg>); }
function IconBuilding() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21h16" /><path d="M6 21V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16" /><path d="M9 8h1" /><path d="M14 8h1" /><path d="M9 12h1" /><path d="M14 12h1" /><path d="M9 16h1" /><path d="M14 16h1" /></svg>); }
function IconCalendar() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4" /><path d="M8 3v4" /><path d="M3 10h18" /></svg>); }
function IconBranch() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M9 7V4" /><path d="M15 7V4" /><path d="M9 20v-3" /><path d="M15 20v-3" /><path d="M7 9H4" /><path d="M7 15H4" /><path d="M20 9h-3" /><path d="M20 15h-3" /></svg>); }
function IconGraduate() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M7 11.5v5c3 2 7 2 10 0v-5" /><path d="M21 10v5" /></svg>); }
function IconPercent() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m7 17 10-10" /><circle cx="7" cy="7" r="2" /><circle cx="17" cy="17" r="2" /></svg>); }
function IconBook() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /></svg>); }
function IconChevron() { return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>); }
function IconArrow() { return (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></svg>); }
function IconAlert() { return (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>); }

/** Inline SVG illustration - no external asset dependency. */
function AuthIllustration() {
  return (
    <svg viewBox="0 0 220 160" style={{ width: "min(230px, 80%)", margin: "0 auto", display: "block" }} aria-hidden="true">
      <rect x="20" y="120" width="150" height="8" rx="4" fill="rgba(255,255,255,0.25)" />
      <rect x="70" y="95" width="60" height="26" rx="3" fill="rgba(255,255,255,0.92)" />
      <rect x="75" y="99" width="50" height="17" rx="1.5" fill="var(--register-blue-dark)" />
      <path d="M66 121 L134 121 L128 128 L72 128 Z" fill="rgba(255,255,255,0.78)" />
      <rect x="88" y="128" width="8" height="20" rx="2" fill="rgba(255,255,255,0.3)" />
      <circle cx="92" cy="80" r="14" fill="#FBCFA0" />
      <path d="M78 128 Q78 100 92 98 Q106 100 106 128 Z" fill="var(--register-orange)" />
      <rect x="82" y="108" width="20" height="16" rx="4" fill="var(--register-orange)" />
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
   COURSES / COLLEGES
============================================================ */

function useCourses() {
  const [courses, setCourses] = useState([]);
  useEffect(() => {
    let mounted = true;
    fetch("/api/admin/courses/public?isActive=true")
      .then((r) => r.json())
      .then((data) => { if (mounted) setCourses(Array.isArray(data) ? data : []); })
      .catch(() => { if (mounted) setCourses([]); });
    return () => { mounted = false; };
  }, []);
  return courses;
}

function useColleges() {
  const [colleges, setColleges] = useState([]);
  useEffect(() => {
    let mounted = true;
    fetch("/api/admin/colleges/public")
      .then((r) => r.json())
      .then((data) => { if (mounted) setColleges(Array.isArray(data?.colleges) ? data.colleges : []); })
      .catch(() => { if (mounted) setColleges([]); });
    return () => { mounted = false; };
  }, []);
  return colleges;
}

/* ============================================================
   FIELD / SECTION / DROPDOWN
============================================================ */

function Field({ label, icon, error, required = true, children }) {
  return (
    <div className="eb-register-field">
      <label className="eb-register-label">
        {label}
        {required && <span className="eb-register-required"> *</span>}
      </label>
      <div className="eb-register-input-wrap">
        <span className="eb-register-icon">{icon}</span>
        {children}
      </div>
      {error && <div className="eb-register-error"><IconAlert />{error}</div>}
    </div>
  );
}

function Section({ children }) {
  return (
    <div className="eb-register-section">
      <div className="eb-register-section-line" />
      <span className="eb-register-section-title">{children}</span>
      <div className="eb-register-section-line" />
    </div>
  );
}

function DropField({ label, icon, error, value, onChange, disabled, placeholder, options }) {
  return (
    <Field label={label} icon={icon} error={error}>
      <select value={value} onChange={onChange} disabled={disabled} className="eb-register-select">
        <option value="" disabled>{placeholder}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      <span className="eb-register-chevron"><IconChevron /></span>
    </Field>
  );
}

/* ============================================================
   COLLEGE AUTOCOMPLETE
============================================================ */

function CollegeAutocomplete({ colleges, value, onChange, onSelect, error, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const wrapperRef = useRef(null);

  useEffect(() => { setQuery(value || ""); }, [value]);

  const suggestions = useMemo(() => {
    const search = query.trim().toLowerCase();
    const list = search ? colleges.filter((c) => String(c.name || "").toLowerCase().includes(search)) : colleges;
    return list.slice(0, 8);
  }, [query, colleges]);

  useEffect(() => {
    function handleOutsideClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div className="eb-register-field" ref={wrapperRef}>
      <label className="eb-register-label">College Name<span className="eb-register-required"> *</span></label>
      <div className="eb-register-input-wrap">
        <span className="eb-register-icon"><IconBuilding /></span>
        <input
          type="text" value={query} disabled={disabled} autoComplete="off"
          placeholder="Select your college" className="eb-register-input"
          onChange={(e) => { const v = e.target.value; setQuery(v); setOpen(true); onChange(v); }}
          onFocus={() => setOpen(true)}
        />
        <span className="eb-register-chevron"><IconChevron /></span>
        {open && suggestions.length > 0 && (
          <div className="eb-register-college-list">
            {suggestions.map((college) => (
              <button key={college.id} type="button" className="eb-register-college-item"
                onMouseDown={(e) => { e.preventDefault(); setQuery(college.name); setOpen(false); onSelect(college); }}>
                <span className="eb-register-college-name">{college.name}</span>
                <span className="eb-register-college-location">
                  {college.location || ""}{college.state ? `, ${stateToCode(college.state)}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <div className="eb-register-error"><IconAlert />{error}</div>}
    </div>
  );
}

/* ============================================================
   BRAND PANEL
============================================================ */

function useSiteContent() {
  const FALLBACK = {
    BRAND_TITLE: "Assessment Portal",
    BRAND_SUBTITLE: "Your path to placement starts here",
    FEATURE_1_TITLE: "Java Full Stack Training",
    FEATURE_1_DESC: "Industry-aligned curriculum covering Core Java, Spring Boot, React and MySQL.",
    FEATURE_2_TITLE: "Campus Placement Drives",
    FEATURE_2_DESC: "Regular examination drives conducted across partner engineering colleges.",
    FEATURE_3_TITLE: "Hands-on Assessment",
    FEATURE_3_DESC: "Structured aptitude, logical, frontend and programming evaluation.",
  };
  const [content, setContent] = useState(FALLBACK);
  useEffect(() => {
    let cancelled = false;
    api.get("/admin/site-content/public")
      .then(res => { if (!cancelled && res.data) setContent({ ...FALLBACK, ...res.data }); })
      .catch(() => { /* keep fallback on any failure */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return content;
}

function BrandPanel() {
  const content = useSiteContent();
  const features = [
    { title: content.FEATURE_1_TITLE, description: content.FEATURE_1_DESC },
    { title: content.FEATURE_2_TITLE, description: content.FEATURE_2_DESC },
    { title: content.FEATURE_3_TITLE, description: content.FEATURE_3_DESC },
  ];
  return (
    <section className="eb-register-brand-side eb-slide-right">
      <div className="eb-register-brand-glow" />
      <div className="eb-register-brand-glow-blue" />

      <div className="eb-register-brand-content">
        <img src="/logo.png" alt="EchoBrains" className="eb-register-logo" draggable={false} />
        <h1 className="eb-register-brand-title">{content.BRAND_TITLE}</h1>
        <p className="eb-register-brand-subtitle">{content.BRAND_SUBTITLE}</p>

        <div className="eb-register-feature-list">
          {features.map((item, index) => (
            <div className="eb-register-feature" key={index}>
              <div className="eb-register-feature-icon">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
              </div>
              <div>
                <div className="eb-register-feature-title">{item.title}</div>
                <div className="eb-register-feature-description">{item.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="eb-register-illustration-wrap">
        <div style={{ width: "100%" }}>
          <AuthIllustration />
          <div className="eb-register-dots">
            <span className="eb-register-dot active" />
            <span className="eb-register-dot" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   MAIN COMPONENT
============================================================ */

export default function Register() {
  const navigate = useNavigate();
  const activeCourses = useCourses();
  const colleges = useColleges();
  const dropdownOptions = useDropdownOptions();
  const yearOptions = [...dropdownOptions.YEAR_OF_PASSING, "Other"];
  const domainOptions = [...dropdownOptions.DOMAIN, "Other"];
  const qualificationOptions = [...dropdownOptions.QUALIFICATION, "Other"];

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [form, setForm] = useState({
    name: "", email: "", phone: "", collegeName: "",
    district: "", state: "", dateOfBirth: "",
    domain: "", qualification: "", aggregate: "",
    yearOfPassing: "", course: "", selectedInCampusDrive: "",
  });

  const [selectedCollege, setSelectedCollege] = useState(null);
  const [customYear, setCustomYear] = useState(""); // used only when yearOfPassing === "Other"
  const [customDomain, setCustomDomain] = useState(""); // used only when domain === "Other"
  const [customQualification, setCustomQualification] = useState(""); // used only when qualification === "Other"
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [showMismatchModal, setShowMismatchModal] = useState(false);
  const [registered, setRegistered] = useState(false);

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
    setApiError("");
  };

  const handleCollegeSelect = (college) => {
    setSelectedCollege(college);
    set("collegeName", college.name);
    set("district", college.location || "");
    set("state", college.state || "");
  };

  const handleCollegeText = (value) => {
    set("collegeName", value);
    const match = colleges.find((c) => String(c.name || "").toLowerCase() === value.trim().toLowerCase());
    if (match) {
      setSelectedCollege(match);
      set("district", match.location || "");
      set("state", match.state || "");
    } else {
      setSelectedCollege(null);
      set("district", "");
      set("state", "");
    }
  };

  const validate = () => {
    const validationErrors = {};
    if (!form.name.trim()) validationErrors.name = "Full name is required.";
    if (!form.email.trim()) validationErrors.email = "Email ID is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) validationErrors.email = "Enter a valid email address.";
    if (!form.phone.trim()) validationErrors.phone = "Phone number is required.";
    else if (!/^\d{10}$/.test(form.phone.trim())) validationErrors.phone = "Phone number must be exactly 10 digits.";
    if (!form.dateOfBirth) validationErrors.dateOfBirth = "Date of birth is required.";
    else {
      const dob = new Date(form.dateOfBirth);
      const today = new Date();
      const minimumAgeDate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
      if (dob > minimumAgeDate) validationErrors.dateOfBirth = "You must be at least 18 years old.";
    }
    if (!form.collegeName.trim()) validationErrors.collegeName = "College name is required.";
    if (!form.district.trim()) validationErrors.district = "Please select a valid college from the list.";
    if (!form.state.trim()) validationErrors.state = "Please select a valid college from the list.";
    if (!form.domain) validationErrors.domain = "Please select your domain / branch.";
    else if (form.domain === "Other" && !customDomain.trim()) validationErrors.domain = "Please enter your domain / branch.";
    if (!form.qualification) validationErrors.qualification = "Please select your qualification.";
    else if (form.qualification === "Other" && !customQualification.trim()) validationErrors.qualification = "Please enter your qualification.";
    if (form.aggregate === "") validationErrors.aggregate = "Aggregate percentage is required.";
    else if (isNaN(form.aggregate) || Number(form.aggregate) < 0 || Number(form.aggregate) > 100) validationErrors.aggregate = "Enter a value between 0 and 100.";
    if (!form.yearOfPassing) validationErrors.yearOfPassing = "Please select year of passing.";
    else if (form.yearOfPassing === "Other") {
      const typed = parseInt(customYear, 10);
      if (!customYear.trim() || isNaN(typed)) validationErrors.yearOfPassing = "Please enter a valid year.";
      else if (typed < CURRENT_YEAR - 1) validationErrors.yearOfPassing = `Year of passing cannot be earlier than ${CURRENT_YEAR - 1}.`;
    }
    if (!form.course) validationErrors.course = "Please select a course.";
    if (!form.selectedInCampusDrive) validationErrors.selectedInCampusDrive = "Please specify whether you are selected in another campus drive.";
    return validationErrors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setShowIncompleteModal(true);
      return;
    }

    setLoading(true);
    setApiError("");
    try {
      await api.post("/student/auth/register", {
        fullName: form.name.trim(),
        email: form.email.trim(),
        dob: form.dateOfBirth,
        phoneNumber: form.phone.trim(),
        collegeName: form.collegeName.trim(),
        location: form.district.trim(),
        state: form.state.trim(),
        branch: form.domain === "Other" ? customDomain.trim() : form.domain,
        highestQualification: form.qualification === "Other" ? customQualification.trim() : form.qualification,
        aggregateMarks: parseFloat(form.aggregate),
        yearOfPassing: parseInt(form.yearOfPassing === "Other" ? customYear : form.yearOfPassing, 10),
        courseName: form.course,
        selectedInCampusDrive: form.selectedInCampusDrive,
      });

      setRegistered(true);
      setTimeout(() => navigate("/student/login"), 2200);

    } catch (error) {
      const message = error.response?.data?.message || "Registration failed. Please try again.";
      setApiError(message);
      setShowMismatchModal(true);
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <div className={`eb-register-page ${isDark ? "eb-dark" : ""}`}>
        <style>{registerStyles}</style>
        <div className="eb-register-success-page">
          <div className="eb-register-theme"><ThemeToggle /></div>
          <div className="eb-register-success">
            <div className="eb-register-success-icon">
              <svg width="31" height="31" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 4 4L19 6" />
              </svg>
            </div>
            <div className="eb-register-success-title">Registration Complete</div>
            <div className="eb-register-success-text">
              Your account has been created successfully.<br />Taking you to the login page...
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isDuplicate = /already\s+(exists|registered)/i.test(apiError || "");

  return (
    <div className={`eb-register-page ${isDark ? "eb-dark" : ""}`}>
      <style>{registerStyles}</style>

      <div className="eb-register-shell">
        <div className="eb-register-layout">

          <section className="eb-register-form-side eb-slide-left">
            <div className="eb-register-theme"><ThemeToggle /></div>

            <div className="eb-register-form-container">
              <h2 className="eb-register-heading">Create Your Account</h2>
              <p className="eb-register-description">
                All fields marked<span className="eb-register-description-star"> *</span> are required.
              </p>

              <form onSubmit={handleSubmit} noValidate autoComplete="off">
                <Section>Personal Details</Section>

                <div className="eb-register-grid">
                  <Field label="Full Name" icon={<IconUser />} error={errors.name}>
                    <input type="text" value={form.name} disabled={loading} autoComplete="name"
                      placeholder="Enter your full name" className="eb-register-input"
                      onChange={(e) => set("name", e.target.value)} />
                  </Field>

                  <Field label="Email ID" icon={<IconMail />} error={errors.email}>
                    <input type="email" value={form.email} disabled={loading} autoComplete="email"
                      placeholder="Enter your email" className="eb-register-input"
                      onChange={(e) => set("email", e.target.value)} />
                  </Field>

                  <Field label="Phone Number" icon={<IconPhone />} error={errors.phone}>
                    <input type="tel" value={form.phone} disabled={loading} autoComplete="tel" maxLength={10}
                      placeholder="Enter phone number" className="eb-register-input"
                      onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))} />
                  </Field>

                  <Field label="Date of Birth" icon={<IconCalendar />} error={errors.dateOfBirth}>
                    <input type="date" value={form.dateOfBirth} disabled={loading} className="eb-register-input"
                      onChange={(e) => set("dateOfBirth", e.target.value)} />
                  </Field>
                </div>

                <Section>Academic Details</Section>

                <div className="eb-register-grid">
                  <div className="eb-register-full">
                    <CollegeAutocomplete
                      colleges={colleges} value={form.collegeName} disabled={loading} error={errors.collegeName}
                      onChange={handleCollegeText} onSelect={handleCollegeSelect}
                    />
                  </div>

                  {selectedCollege && (
                    <Field label="District" icon={<IconBuilding />} error={errors.district}>
                      <input type="text" value={form.district} readOnly disabled={loading}
                        className="eb-register-input eb-register-readonly" title="Auto-filled from selected college" />
                    </Field>
                  )}

                  {selectedCollege && (
                    <Field label="State" icon={<IconBuilding />} error={errors.state}>
                      <input type="text" value={form.state} readOnly disabled={loading}
                        className="eb-register-input eb-register-readonly" title="Auto-filled from selected college" />
                    </Field>
                  )}

                  <DropField label="Domain / Branch" icon={<IconBranch />} error={errors.domain}
                    value={form.domain} onChange={(e) => { set("domain", e.target.value); if (e.target.value !== "Other") setCustomDomain(""); }}
                    disabled={loading} placeholder="Select branch" options={domainOptions} />

                  {form.domain === "Other" && (
                    <Field label="Enter Domain / Branch" icon={<IconBranch />} error={null}>
                      <input type="text" value={customDomain} disabled={loading}
                        placeholder="e.g. Mechanical Engineering"
                        className="eb-register-input"
                        onChange={(e) => { setCustomDomain(e.target.value); setErrors((p) => ({ ...p, domain: "" })); }} />
                    </Field>
                  )}

                  <DropField label="Highest Qualification" icon={<IconGraduate />} error={errors.qualification}
                    value={form.qualification} onChange={(e) => { set("qualification", e.target.value); if (e.target.value !== "Other") setCustomQualification(""); }}
                    disabled={loading} placeholder="Select qualification" options={qualificationOptions} />

                  {form.qualification === "Other" && (
                    <Field label="Enter Qualification" icon={<IconGraduate />} error={null}>
                      <input type="text" value={customQualification} disabled={loading}
                        placeholder="e.g. Diploma"
                        className="eb-register-input"
                        onChange={(e) => { setCustomQualification(e.target.value); setErrors((p) => ({ ...p, qualification: "" })); }} />
                    </Field>
                  )}

                  <Field label="Aggregate %" icon={<IconPercent />} error={errors.aggregate}>
                    <input type="number" min="0" max="100" step="0.01" value={form.aggregate} disabled={loading}
                      placeholder="e.g. 78.60" className="eb-register-input"
                      onChange={(e) => set("aggregate", e.target.value)} />
                  </Field>

                  <DropField label="Year of Passing" icon={<IconCalendar />} error={errors.yearOfPassing}
                    value={form.yearOfPassing} onChange={(e) => { set("yearOfPassing", e.target.value); if (e.target.value !== "Other") setCustomYear(""); }}
                    disabled={loading} placeholder="Select year" options={yearOptions} />

                  {form.yearOfPassing === "Other" && (
                    <Field label="Enter Year" icon={<IconCalendar />} error={null}>
                      <input type="number" value={customYear} disabled={loading}
                        min={CURRENT_YEAR - 1} placeholder={`e.g. ${CURRENT_YEAR - 1} or later`}
                        className="eb-register-input"
                        onChange={(e) => { setCustomYear(e.target.value); setErrors((p) => ({ ...p, yearOfPassing: "" })); }} />
                    </Field>
                  )}

                  <div className="eb-register-full">
                    <Field label="Course" icon={<IconBook />} error={errors.course}>
                      <select value={form.course} onChange={(e) => set("course", e.target.value)}
                        disabled={loading} className="eb-register-select">
                        <option value="" disabled>Select your course</option>
                        {activeCourses.map((course) => <option key={course.id} value={course.name}>{course.name}</option>)}
                      </select>
                      <span className="eb-register-chevron"><IconChevron /></span>
                    </Field>
                  </div>

                  <div className="eb-register-full">
                    <DropField label="Selected in any other campus drive" icon={<IconBranch />}
                      error={errors.selectedInCampusDrive} value={form.selectedInCampusDrive}
                      onChange={(e) => set("selectedInCampusDrive", e.target.value)}
                      disabled={loading} placeholder="Select option" options={["Yes", "No"]} />
                  </div>
                </div>

                {apiError && <div className="eb-register-api-error"><IconAlert /><span>{apiError}</span></div>}

                <button type="submit" disabled={loading} className="eb-register-submit">
                  {loading ? (
                    <>
                      <span style={{ width: "15px", height: "15px", border: "2px solid rgba(255,255,255,.35)", borderTopColor: "#fff", borderRadius: "50%", animation: "ebRegisterSpin .7s linear infinite" }} />
                      Registering...
                    </>
                  ) : (
                    <>Register <IconArrow /></>
                  )}
                </button>
              </form>

              <div className="eb-register-login-link">
                Already have an account?
                <span className="eb-register-login-action" role="button" tabIndex={0}
                  onClick={() => navigate("/student/login")}
                  onKeyDown={(e) => e.key === "Enter" && navigate("/student/login")}>
                  Sign In
                </span>
              </div>
            </div>
          </section>

          <BrandPanel />
        </div>
      </div>

      {showIncompleteModal && (
        <div className="eb-register-modal-overlay">
          <div className="eb-register-modal">
            <div className="eb-register-modal-header">
              <div className="eb-register-modal-icon" style={{ background: "rgba(245,158,11,.11)", color: "#d97706" }}>
                <IconAlert />
              </div>
              <div className="eb-register-modal-title">Incomplete Fields</div>
            </div>
            <div className="eb-register-modal-text">Please fill in all mandatory fields before moving forward.</div>
            <div className="eb-register-modal-actions">
              <button type="button" className="eb-register-modal-button primary" onClick={() => setShowIncompleteModal(false)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {showMismatchModal && (
        <div className="eb-register-modal-overlay">
          <div className="eb-register-modal">
            <div className="eb-register-modal-header">
              <div className="eb-register-modal-icon" style={{ background: "rgba(220,38,38,.09)", color: "#dc2626" }}>
                <IconAlert />
              </div>
              <div className="eb-register-modal-title">Registration Unsuccessful</div>
            </div>
            <div className="eb-register-modal-text">
              {apiError || "The entered information could not be verified. Please check your details and try again."}
              {isDuplicate && " Please use another email address or sign in with your existing account."}
            </div>
            <div className="eb-register-modal-actions">
              <button type="button" className="eb-register-modal-button" onClick={() => setShowMismatchModal(false)}>Try Again</button>
              {isDuplicate && (
                <button type="button" className="eb-register-modal-button primary" onClick={() => navigate("/student/login")}>Go to Login</button>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes ebRegisterSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

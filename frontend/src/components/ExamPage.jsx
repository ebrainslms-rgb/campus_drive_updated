/**
 * ExamPage.jsx – Core exam engine
 *
 * Timer model (server-synchronised) — UNCHANGED:
 *  • On load: backend returns slotEndTime (absolute ISO) + serverNow.
 *  • Client computes clockDrift = Date.now() - serverNow (ms) once at load.
 *  • Every second: remainingMs = slotEndTime - (Date.now() - clockDrift)
 *  • slotEndTime is persisted to localStorage so a crash/refresh picks it up
 *    without re-fetching, keeping the timer honest across reconnects.
 *  • On window focus/visibility: re-sync via GET /student/exam/time-status.
 *  • When remainingMs ≤ 0 → 10 s warning overlay → auto-submit.
 *
 * Anti-cheat — UNCHANGED in trigger conditions, ONE REAL BUG FIXED:
 *  • Fullscreen modal gateway before the exam starts.
 *  • Tab-switch / window-blur / fullscreen-exit → immediate auto-submit.
 *  • BUG FIX: the fullscreen-exit handler (onFsChange) never checked
 *    fsTransitionRef.current, unlike the blur/tab-switch handler which
 *    always did. That meant a fullscreenchange event firing during the
 *    legitimate ENTRY transition (browser-dependent timing, can exceed
 *    the old 800ms guard on slower systems) could trigger a false
 *    auto-submit right as the student starts. Fixed by adding the same
 *    guard check onFsChange already should have had, and widening the
 *    transition window from 800ms to 1500ms for safety margin. This is
 *    the ONLY behavioral change to the anti-cheat engine in this pass -
 *    every trigger condition (real violations) still fires exactly as
 *    before; only this one false-positive path is closed.
 *
 * Navigation — 5 questions per page, with a left category sidebar
 * (dynamically built from whatever question.type values are actually
 * present in the loaded questions - not a hardcoded list of exactly 4,
 * so a future backend category would show up with no frontend change;
 * see the inspection report for why true arbitrary-name categories like
 * "Java"/"SQL" would need a backend change this pass doesn't make).
 * Free navigation, skip-and-return via the per-category question strip.
 * Manual submit only becomes visible in the final 5 minutes (computed
 * from remainingMs, never a hardcoded duration) - auto-submit at zero
 * remains the only submission path outside that window.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import ThemeToggle from "./shared/ThemeToggle.jsx";

/* ─── Constants ─────────────────────────────────────────────────────────── */
const FALLBACK_SECONDS      = 60 * 60;
const Qs_PER_PAGE           = 10; // was 5 - halves page-navigation frequency, and now aligns each 10-question section (Aptitude/Logical) to exactly one page
const WARN_SECONDS          = 10;
const LS_SLOT_END_KEY       = "examSlotEndTime";
const FALLBACK_MANUAL_SUBMIT_WINDOW_MS = 5 * 60 * 1000; // used only until the admin-configured value loads
const FS_TRANSITION_MS      = 1500; // widened from 800ms - guard window for fullscreen entry

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function pad(n) { return String(n).padStart(2, "0"); }
function fmtMs(ms) {
  if (ms <= 0) return "00:00:00";
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Known-value display styling. Not an exhaustive whitelist - any
 * question.type value NOT in this map still renders (see
 * styleForCategory below), just with an auto-generated color instead of
 * a hand-picked one. This is what makes the sidebar "dynamic within the
 * existing enum" rather than hardcoded to exactly these four.
 */
const KNOWN_SECTION_STYLE = {
  aptitude:    { color: "#818CF8", bg: "rgba(129,140,248,0.14)", label: "Aptitude" },
  logical:     { color: "#10B981", bg: "rgba(52,211,153,0.14)",  label: "Logical & Verbal" },
  programming: { color: "#EA580C", bg: "rgba(249,115,22,0.14)",  label: "Programming" },
  frontend:    { color: "#0891B2", bg: "rgba(6,182,212,0.14)",   label: "Front-End" },
};
const FALLBACK_COLORS = ["#A855F7", "#EC4899", "#84CC16", "#F59E0B", "#3B82F6"];

function styleForCategory(key, fallbackIndex) {
  if (KNOWN_SECTION_STYLE[key]) return KNOWN_SECTION_STYLE[key];
  const color = FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];
  const label = key ? key.charAt(0).toUpperCase() + key.slice(1).toLowerCase() : "Other";
  return { color, bg: `${color}24`, label };
}

/* ─── Icons ──────────────────────────────────────────────────────────────── */
const Icons = {
  Clock: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>),
  Shield: () => (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>),
  Fullscreen: () => (<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>),
  Lock: () => (<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>),
  Warning: () => (<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>),
  Info: () => (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>),
};

/* ─── Loading screen ─────────────────────────────────────────────────────── */
function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative" style={{ background: "var(--eb-bg)" }}>
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <span className="spinner w-10 h-10 border-4 mb-4" />
      <p className="text-sm" style={{ color: "var(--eb-text-muted)" }}>Loading your exam…</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   FULLSCREEN GATEWAY MODAL — UNCHANGED behavior, theme-aware styling only.
───────────────────────────────────────────────────────────────────────── */
function FullscreenGateway({ onEnter }) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setPhase(1), 1800);
    return () => clearTimeout(t);
  }, []);

  const steps = [
    "Verifying student credentials…",
    "Loading encrypted question bank…",
    "Initialising secure environment…",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "var(--eb-bg)" }}>
      <div className="absolute top-4 right-4 z-20"><ThemeToggle /></div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[180, 260, 340].map((size, i) => (
          <div key={size} className="absolute rounded-full border animate-ping"
            style={{ width: size, height: size, borderColor: "rgba(249,115,22,0.08)", animationDuration: `${2.2 + i * 0.6}s`, animationDelay: `${i * 0.3}s` }} />
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center text-center px-8 max-w-md w-full space-y-8">
        <div className="flex items-center justify-center w-20 h-20 rounded-full"
          style={{ background: "rgba(249,115,22,0.1)", border: "2px solid rgba(249,115,22,0.35)", color: "var(--eb-orange)" }}>
          <Icons.Lock />
          <span className="sr-only">Secure</span>
        </div>

        <div className="space-y-2 w-full">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm transition-all duration-500"
              style={{ background: "var(--eb-surface-muted)", border: "1px solid var(--eb-border)", opacity: phase >= 1 ? 1 : i === 0 ? 1 : 0.4 }}>
              <span className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center"
                style={{ background: phase >= 1 ? "rgba(52,211,153,0.2)" : "rgba(249,115,22,0.2)", border: `1px solid ${phase >= 1 ? "#34D399" : "#F97316"}` }}>
                {phase >= 1
                  ? <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  : <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#F97316" }} />}
              </span>
              <span style={{ color: phase >= 1 ? "var(--eb-text)" : "var(--eb-text-muted)" }}>{step}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-bold" style={{ color: "var(--eb-text)" }}>
            {phase === 0 ? "Entering secure exam environment…" : "Ready to Begin"}
          </h2>
          <p className="text-xs" style={{ color: "var(--eb-text-faint)" }}>
            {phase === 0
              ? "Please wait while we prepare your exam session."
              : "Click below to enter fullscreen and start your exam. Exiting fullscreen or switching tabs will auto-submit."}
          </p>
        </div>

        {phase >= 1 && (
          <button onClick={onEnter} className="eb-btn w-full flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)" }}>
            <Icons.Fullscreen />
            Enter Fullscreen &amp; Begin Exam
          </button>
        )}

        {phase === 0 && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   10-SECOND WARNING OVERLAY — UNCHANGED behavior. No ThemeToggle here
   (forced, undismissable warning state).
───────────────────────────────────────────────────────────────────────── */
function TimerWarningOverlay({ secondsLeft }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(7,0,0,0.88)", backdropFilter: "blur(6px)" }}>
      <div className="text-center space-y-6 px-8">
        <div className="flex items-center justify-center w-20 h-20 rounded-full mx-auto animate-pulse"
          style={{ background: "rgba(248,113,113,0.15)", border: "2px solid rgba(248,113,113,0.5)", color: "#F87171" }}>
          <Icons.Warning />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#F87171" }}>Time Expired</p>
          <p className="text-6xl font-black tabular-nums" style={{ color: "#F87171" }}>{secondsLeft}</p>
          <p className="text-sm mt-3" style={{ color: "#CBD5E1" }}>
            Auto-submitting your exam in {secondsLeft} second{secondsLeft !== 1 ? "s" : ""}…
          </p>
        </div>
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: WARN_SECONDS }).map((_, i) => (
            <div key={i} className="h-1 rounded-full transition-all duration-1000"
              style={{ width: 20, background: i < secondsLeft ? "#F87171" : "rgba(255,255,255,0.15)" }} />
          ))}
        </div>
        <p className="text-xs" style={{ color: "#94A3B8" }}>All inputs are locked. Your answers have been saved.</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   LEFT SIDEBAR — dynamically built categories with per-category counts.
───────────────────────────────────────────────────────────────────────── */
function CategorySidebar({ categories, activeKey, onSelectCategory, mobileOpen, onCloseMobile }) {
  const content = (
    <nav className="space-y-1.5">
      {categories.map((cat, i) => {
        const style = styleForCategory(cat.key, i);
        const isActive = cat.key === activeKey;
        return (
          <button key={cat.key} onClick={() => { onSelectCategory(cat.key); onCloseMobile?.(); }}
            className="w-full flex items-center justify-between gap-2 px-3.5 py-3 rounded-xl text-left transition-colors"
            style={{ background: isActive ? style.bg : "transparent", border: `1px solid ${isActive ? style.color + "55" : "transparent"}` }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: style.color }} />
              <span className="text-sm font-semibold truncate" style={{ color: isActive ? style.color : "var(--eb-text)" }}>{style.label}</span>
            </div>
            <span className="text-xs font-mono font-bold flex-shrink-0 tabular-nums" style={{ color: isActive ? style.color : "var(--eb-text-faint)" }}>
              {cat.answeredCount}/{cat.questions.length}
            </span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className="hidden lg:block w-64 flex-shrink-0 sticky top-[92px] self-start p-4 rounded-2xl border"
        style={{ background: "var(--eb-surface)", borderColor: "var(--eb-border)", maxHeight: "calc(100vh - 116px)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-3 px-1" style={{ color: "var(--eb-text-faint)" }}>Sections</p>
        {content}
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onCloseMobile} />
          <div className="relative w-72 max-w-[80vw] h-full p-4 overflow-y-auto" style={{ background: "var(--eb-surface)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-3 px-1" style={{ color: "var(--eb-text-faint)" }}>Sections</p>
            {content}
          </div>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   QUESTION NUMBER STRIP — skip-and-return within the current category.
───────────────────────────────────────────────────────────────────────── */
function QuestionStrip({ questionsInCategory, currentPageQuestionIds, answers, onJump }) {
  return (
    <div className="flex flex-wrap gap-2">
      {questionsInCategory.map(({ question, globalIndex }, i) => {
        const isAnswered = answers[question.id] !== undefined && answers[question.id] !== null;
        const isOnCurrentPage = currentPageQuestionIds.has(question.id);
        // Answered = a solid, saturated green with white text - readable in
        // both themes on its own terms, not dependent on a translucent
        // overlay over the surrounding surface color (that's what caused
        // the low-contrast green-on-green look before). "Current page" is
        // now just a small dot underneath, not a border/ring at all.
        return (
          <div key={question.id} className="flex flex-col items-center gap-1">
            <button onClick={() => onJump(globalIndex)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-all flex-shrink-0"
              style={{
                background: isAnswered ? "#059669" : "var(--eb-surface-muted)",
                color: isAnswered ? "#ffffff" : "var(--eb-text-faint)",
                border: `1.5px solid ${isAnswered ? "#047857" : "var(--eb-border)"}`,
              }}
              title={isAnswered ? "Answered" : "Not answered yet"}>
              {i + 1}
            </button>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: isOnCurrentPage ? "var(--eb-text-faint)" : "transparent" }} />
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   QUESTION CARD
───────────────────────────────────────────────────────────────────────── */
function QuestionCard({ question, globalIndex, selectedOption, onSelect, locked, categoryStyle }) {
  const opts = [question.optionA, question.optionB, question.optionC, question.optionD];
  const keys = ["A", "B", "C", "D"];

  return (
    <div className="rounded-2xl overflow-hidden border" style={{ background: "var(--eb-surface)", borderColor: "var(--eb-border)" }}>
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--eb-border)", background: "var(--eb-surface-muted)" }}>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-md" style={{ background: "rgba(249,115,22,0.12)", color: "var(--eb-orange)" }}>Q{globalIndex + 1}</span>
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: categoryStyle.bg, color: categoryStyle.color }}>{categoryStyle.label}</span>
        </div>
        {selectedOption !== null && selectedOption !== undefined && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--eb-success-soft)", color: "var(--eb-success)", border: "1px solid rgba(16,185,129,0.3)" }}>Answered</span>
        )}
      </div>

      <div className="px-5 py-4">
        <p className="text-sm leading-relaxed font-medium" style={{ color: "var(--eb-text)", whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>{question.question}</p>
      </div>

      <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {opts.map((opt, idx) => {
          const isSelected = selectedOption === idx;
          return (
            <button key={keys[idx]} onClick={() => !locked && onSelect(question.id, idx)} disabled={locked}
              className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm text-left transition-all duration-150"
              style={{
                background: isSelected ? "rgba(249,115,22,0.10)" : "var(--eb-surface-muted)",
                border: `1.5px solid ${isSelected ? "rgba(249,115,22,0.5)" : "var(--eb-border)"}`,
                color: isSelected ? "var(--eb-orange)" : "var(--eb-text)",
                cursor: locked ? "not-allowed" : "pointer",
                transform: isSelected ? "scale(1.01)" : "scale(1)",
              }}>
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
                style={{
                  background: isSelected ? "rgba(249,115,22,0.22)" : "var(--eb-surface)",
                  color: isSelected ? "var(--eb-orange)" : "var(--eb-text-faint)",
                  border: `1px solid ${isSelected ? "rgba(249,115,22,0.4)" : "var(--eb-border)"}`,
                }}>
                {keys[idx]}
              </span>
              <span className="leading-snug" style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>{opt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   PROFILE POPUP — read-only, no logout (deliberately - not a click target
   that should exist mid-exam).
───────────────────────────────────────────────────────────────────────── */
function ProfilePopup({ profile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const initial = (profile?.fullName || "S").charAt(0).toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs text-white flex-shrink-0"
        style={{ background: "var(--eb-blue)" }} aria-label="Student details">
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 rounded-xl border shadow-xl p-4 z-50"
          style={{ background: "var(--eb-surface)", borderColor: "var(--eb-border)" }}>
          <p className="text-sm font-semibold mb-2" style={{ color: "var(--eb-text)" }}>{profile?.fullName || "Student"}</p>
          <div className="space-y-1.5 text-xs">
            {profile?.email && (
              <div className="flex justify-between gap-2">
                <span style={{ color: "var(--eb-text-faint)" }}>Email</span>
                <span className="text-right truncate" style={{ color: "var(--eb-text-muted)" }}>{profile.email}</span>
              </div>
            )}
            {profile?.collegeName && (
              <div className="flex justify-between gap-2">
                <span style={{ color: "var(--eb-text-faint)" }}>College</span>
                <span className="text-right" style={{ color: "var(--eb-text-muted)" }}>{profile.collegeName}</span>
              </div>
            )}
            {profile?.courseName && (
              <div className="flex justify-between gap-2">
                <span style={{ color: "var(--eb-text-faint)" }}>Course</span>
                <span className="text-right" style={{ color: "var(--eb-text-muted)" }}>{profile.courseName}</span>
              </div>
            )}
            {profile?.examCode && (
              <div className="flex justify-between gap-2">
                <span style={{ color: "var(--eb-text-faint)" }}>Exam Code</span>
                <span className="text-right font-mono" style={{ color: "var(--eb-text-muted)" }}>{profile.examCode}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────── */
export default function ExamPage() {
  const navigate = useNavigate();

  /* ── State ─────────────────────────────────────────────────────────── */
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [fsPrompt,    setFsPrompt]    = useState(true);
  const [questions,   setQuestions]   = useState([]);
  const [answers,     setAnswers]     = useState({});
  const [page,        setPage]        = useState(0);
  const [remainingMs, setRemainingMs] = useState(null);
  const [warnSecs,    setWarnSecs]    = useState(0);
  const [submitting,  setSubmitting]  = useState(false);
  const [violations,  setViolations]  = useState(0);
  const [locked,      setLocked]      = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile,     setProfile]     = useState(null); // read-only, ProfilePopup only
  const [manualSubmitWindowMs, setManualSubmitWindowMs] = useState(FALLBACK_MANUAL_SUBMIT_WINDOW_MS);

  /* ── Refs — UNCHANGED ──────────────────────────────────────────────── */
  const slotEndMsRef    = useRef(null);
  const clockDriftMsRef = useRef(0);
  const tickRef         = useRef(null);
  const warnTimerRef    = useRef(null);
  const isSubmittedRef  = useRef(false);
  const fsTransitionRef = useRef(false);
  const saveInFlightRef = useRef(null); // holds the currently-running saveProgress() promise, if any

  /* ── Derived ───────────────────────────────────────────────────────── */
  const totalPages    = Math.max(1, Math.ceil(questions.length / Qs_PER_PAGE));
  const pageStart     = page * Qs_PER_PAGE;
  const pageQuestions = questions.slice(pageStart, pageStart + Qs_PER_PAGE);
  const answeredCount = Object.keys(answers).length;
  const globalWarning = remainingMs !== null && remainingMs <= 5 * 60 * 1000 && remainingMs > WARN_SECONDS * 1000;
  const showWarning   = warnSecs > 0;
  const isLastPage    = page === totalPages - 1;
  // Manual submit visibility - purely a display gate, computed from the
  // same server-synced remainingMs the timer already uses. Never a second
  // timer, never a separate deadline calculation.
  const manualSubmitAvailable = remainingMs !== null && remainingMs <= manualSubmitWindowMs;

  // Categories built from whatever question.type values are actually
  // present - order follows first-appearance in the (already server-
  // shuffled-once, stable) question list, not a hardcoded array.
  const categories = useMemo(() => {
    const groups = {};
    const order = [];
    questions.forEach((q, i) => {
      const key = q.type;
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push({ question: q, globalIndex: i });
    });
    return order.map(key => ({
      key,
      questions: groups[key],
      answeredCount: groups[key].filter(({ question }) => answers[question.id] !== undefined && answers[question.id] !== null).length,
    }));
  }, [questions, answers]);

  const activeCategoryKey = pageQuestions[0]?.type ?? categories[0]?.key;
  const activeCategory = categories.find(c => c.key === activeCategoryKey);
  const currentPageQuestionIds = useMemo(() => new Set(pageQuestions.map(q => q.id)), [pageQuestions]);

  /* ─────────────────────────────────────────────────────────────────────
     SUBMIT — UNCHANGED
  ───────────────────────────────────────────────────────────────────── */
  const submitExam = useCallback(async (auto = false) => {
    if (isSubmittedRef.current) return;
    isSubmittedRef.current = true;
    clearInterval(tickRef.current);
    clearTimeout(warnTimerRef.current);
    localStorage.removeItem(LS_SLOT_END_KEY);
    setSubmitting(true);
    try {
      const token = localStorage.getItem("studentToken");
      const res = await api.post("/student/exam/submit",
        { autoSubmitted: auto },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.scores) {
        localStorage.setItem("examScores", JSON.stringify(res.data.scores));
      }
      navigate("/student/result");
    } catch {
      navigate("/student/result");
    }
  }, [navigate]);

  /* ─────────────────────────────────────────────────────────────────────
     TRIGGER WARNING COUNTDOWN — UNCHANGED
  ───────────────────────────────────────────────────────────────────── */
  const triggerWarningCountdown = useCallback(() => {
    setLocked(true);
    setWarnSecs(WARN_SECONDS);
  }, []);

  /* ─────────────────────────────────────────────────────────────────────
     START EXAM FLOW — UNCHANGED
  ───────────────────────────────────────────────────────────────────── */
  const startExamFlow = useCallback(async () => {
    try {
      const token = localStorage.getItem("studentToken");
      await api.post("/student/exam/start", {}, { headers: { Authorization: `Bearer ${token}` } });
    } catch { /* best effort */ }

    tickRef.current = setInterval(() => {
      if (isSubmittedRef.current) { clearInterval(tickRef.current); return; }
      const deadline = slotEndMsRef.current;
      if (deadline === null) return;
      const adjustedNow = Date.now() - clockDriftMsRef.current;
      const ms = deadline - adjustedNow;
      if (ms <= 0) {
        clearInterval(tickRef.current);
        setRemainingMs(0);
        triggerWarningCountdown();
      } else {
        setRemainingMs(ms);
      }
    }, 1000);
  }, [triggerWarningCountdown]);

  /* ─────────────────────────────────────────────────────────────────────
     SAVE PROGRESS (best effort, per-page) — UNCHANGED
  ───────────────────────────────────────────────────────────────────── */
  const saveProgress = useCallback(async (nextPageStart) => {
    // If a save is already running (e.g. a double-click on Next, or Next
    // followed immediately by Submit), wait for it to finish first rather
    // than either (a) letting two saves run concurrently - that's exactly
    // what caused real MySQL deadlocks in production, since each save is a
    // full-row update on the same student - or (b) silently skipping this
    // one, which could let a student submit before their last page's
    // answers were actually persisted. Serializing guarantees neither.
    if (saveInFlightRef.current) {
      await saveInFlightRef.current;
    }
    const runSave = (async () => {
      const pageQs = questions.slice(page * Qs_PER_PAGE, page * Qs_PER_PAGE + Qs_PER_PAGE);
      // ONE request carrying every question's current answer on this page,
      // instead of one HTTP request per question (previously 5 separate
      // POSTs per page change). This is the actual capacity fix - it's
      // what cuts both request volume and full-row Student updates 5x.
      const answerEntries = pageQs.map(q => ({
        questionId: q.id,
        selectedOptionIndex: answers[q.id] ?? null,
        timeSpentInSeconds: 0,
      }));
      try {
        const token = localStorage.getItem("studentToken");
        await api.post("/student/exam/save-progress", {
          answers: answerEntries,
          currentQuestionIndex: nextPageStart,
        }, { headers: { Authorization: `Bearer ${token}` } });
      } catch { /* best effort */ }
    })();
    saveInFlightRef.current = runSave;
    try {
      await runSave;
    } finally {
      if (saveInFlightRef.current === runSave) saveInFlightRef.current = null;
    }
  }, [questions, page, answers]);

  /* ─────────────────────────────────────────────────────────────────────
     PROFILE FETCH — read-only, header popup only. Same endpoint
     RulesPage.jsx already uses. Not on the critical exam-taking path.
  ───────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (fsPrompt || loading) return;
    const token = localStorage.getItem("studentToken");
    if (!token) return;
    api.get("/student/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setProfile(res.data))
      .catch(() => { /* non-critical, ignore */ });
  }, [fsPrompt, loading]);

  /* ─────────────────────────────────────────────────────────────────────
     MANUAL SUBMIT WINDOW — admin-configurable (Profile -> Exam Settings),
     was previously a hardcoded 5-minute constant. Falls back to 5 minutes
     if this fetch fails, so the button still works even if this endpoint
     is briefly unavailable.
  ───────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    api.get("/admin/exam-settings/public")
      .then(res => {
        const minutes = res.data?.manualSubmitWindowMinutes;
        if (typeof minutes === "number" && minutes > 0) {
          setManualSubmitWindowMs(minutes * 60 * 1000);
        }
      })
      .catch(() => { /* keep fallback on any failure */ });
  }, []);

  /* ─────────────────────────────────────────────────────────────────────
     RE-SYNC ON RECONNECT / FOCUS — UNCHANGED
  ───────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (fsPrompt || loading) return;
    const resync = async () => {
      if (isSubmittedRef.current) return;
      try {
        const token = localStorage.getItem("studentToken");
        const res = await api.get("/student/exam/time-status", { headers: { Authorization: `Bearer ${token}` } });
        const { slotEndTime, serverNow, isExpired, isSubmitted } = res.data;
        if (isExpired || isSubmitted) {
          clearInterval(tickRef.current);
          setRemainingMs(0);
          triggerWarningCountdown();
          return;
        }
        if (slotEndTime) {
          const serverNowMs = serverNow ? new Date(serverNow).getTime() : Date.now();
          clockDriftMsRef.current = Date.now() - serverNowMs;
          slotEndMsRef.current    = new Date(slotEndTime).getTime();
          localStorage.setItem(LS_SLOT_END_KEY, slotEndTime);
          const correctedMs = slotEndMsRef.current - (Date.now() - clockDriftMsRef.current);
          setRemainingMs(Math.max(0, correctedMs));
        }
      } catch { /* network unavailable — keep counting from cached value */ }
    };
    const onVisible = () => { if (!document.hidden) resync(); };
    const onFocus   = () => resync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [fsPrompt, loading, triggerWarningCountdown]);

  /* ─────────────────────────────────────────────────────────────────────
     ANTI-CHEAT — tab switch / visibility / blur — UNCHANGED
  ───────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (fsPrompt || loading) return;
    const handleViolation = async () => {
      if (isSubmittedRef.current || fsTransitionRef.current) return;
      setViolations(v => v + 1);
      submitExam(true);
    };
    const onVisChange = () => { if (document.hidden) handleViolation(); };
    const onBlur      = () => handleViolation();
    document.addEventListener("visibilitychange", onVisChange);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("blur", onBlur);
    };
  }, [fsPrompt, loading, submitExam]);

  /* ─────────────────────────────────────────────────────────────────────
     FULLSCREEN exit → auto-submit
     BUG FIX (see file header): this handler now checks fsTransitionRef,
     same guard the blur/tab-switch handler already had. Previously it
     didn't, so a fullscreenchange event during the entry transition
     could trigger a false auto-submit. The real violation path (student
     genuinely exits fullscreen mid-exam) is completely unchanged.
  ───────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (fsPrompt || loading) return;
    const onFsChange = () => {
      if (!document.fullscreenElement && !isSubmittedRef.current && !fsTransitionRef.current) submitExam(true);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [fsPrompt, loading, submitExam]);

  /* ─────────────────────────────────────────────────────────────────────
     LOAD EXAM — UNCHANGED
  ───────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem("studentToken");
        if (!token) { navigate("/"); return; }

        const res = await api.get("/student/exam", { headers: { Authorization: `Bearer ${token}` } });
        const { questions: qs, currentQuestionIndex, serverNow, slotEndTime } = res.data;
        setQuestions(qs);

        if (slotEndTime) {
          const serverNowMs  = serverNow ? new Date(serverNow).getTime() : Date.now();
          const slotEndMs    = new Date(slotEndTime).getTime();
          clockDriftMsRef.current = Date.now() - serverNowMs;
          slotEndMsRef.current    = slotEndMs;
          localStorage.setItem(LS_SLOT_END_KEY, slotEndTime);
          const initialMs = slotEndMs - (Date.now() - clockDriftMsRef.current);
          setRemainingMs(Math.max(0, initialMs));
        } else {
          const cached = localStorage.getItem(LS_SLOT_END_KEY);
          if (cached) {
            const slotEndMs = new Date(cached).getTime();
            slotEndMsRef.current = slotEndMs;
            const initialMs = slotEndMs - Date.now();
            setRemainingMs(Math.max(0, initialMs));
          } else {
            const fallbackEnd = Date.now() + FALLBACK_SECONDS * 1000;
            slotEndMsRef.current = fallbackEnd;
            setRemainingMs(FALLBACK_SECONDS * 1000);
          }
        }

        const restored = {};
        for (const q of qs) {
          if (q.selectedOptionIndex !== null && q.selectedOptionIndex !== undefined) {
            restored[q.id] = q.selectedOptionIndex;
          }
        }
        setAnswers(restored);

        const resumeIdx = currentQuestionIndex ?? 0;
        setPage(Math.floor(resumeIdx / Qs_PER_PAGE));

        setLoading(false);
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem("studentToken");
          navigate("/");
          return;
        }
        setError(err.response?.data?.message || "Failed to load exam.");
        setLoading(false);
      }
    })();
  }, [navigate]);

  /* ─────────────────────────────────────────────────────────────────────
     10-SECOND WARNING COUNTDOWN — UNCHANGED
  ───────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (warnSecs <= 0) return;
    if (warnSecs === 1) {
      const t = setTimeout(() => submitExam(true), 1000);
      return () => clearTimeout(t);
    }
    warnTimerRef.current = setTimeout(() => setWarnSecs(w => w - 1), 1000);
    return () => clearTimeout(warnTimerRef.current);
  }, [warnSecs, submitExam]);

  /* ─────────────────────────────────────────────────────────────────────
     FULLSCREEN ENTRY — transition guard widened 800ms → 1500ms (see file
     header bug-fix note). Everything else UNCHANGED.
  ───────────────────────────────────────────────────────────────────── */
  const enterFullscreen = async () => {
    try {
      fsTransitionRef.current = true;
      await document.documentElement.requestFullscreen();
      setTimeout(() => { fsTransitionRef.current = false; }, FS_TRANSITION_MS);
      setFsPrompt(false);
      startExamFlow();
    } catch {
      fsTransitionRef.current = false;
      alert("Unable to enter fullscreen. Please allow fullscreen permissions and try again.");
    }
  };

  /* ─────────────────────────────────────────────────────────────────────
     ANSWER SELECTION — UNCHANGED
  ───────────────────────────────────────────────────────────────────── */
  const selectOption = (questionId, optionIdx) => {
    if (locked) return;
    setAnswers(prev => ({ ...prev, [questionId]: optionIdx }));
  };

  /* ─────────────────────────────────────────────────────────────────────
     PAGE NAVIGATION — UNCHANGED shape
  ───────────────────────────────────────────────────────────────────── */
  const goToPage = async (targetPage) => {
    if (targetPage < 0 || targetPage >= totalPages) return;
    await saveProgress(targetPage * Qs_PER_PAGE);
    setPage(targetPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const goToQuestionIndex = (globalIndex) => goToPage(Math.floor(globalIndex / Qs_PER_PAGE));

  const goToCategory = (categoryKey) => {
    const cat = categories.find(c => c.key === categoryKey);
    if (cat && cat.questions.length > 0) goToQuestionIndex(cat.questions[0].globalIndex);
  };

  /* ─────────────────────────────────────────────────────────────────────
     FINAL SUBMIT (manual) — UNCHANGED behavior; only its VISIBILITY is
     now gated by manualSubmitAvailable in the render below. This function
     itself is unchanged and is never called except by that one button.
  ───────────────────────────────────────────────────────────────────── */
  const handleManualSubmit = async () => {
    await saveProgress(questions.length);
    submitExam(false);
  };

  /* ─────────────────────────────────────────────────────────────────────
     RENDER GUARDS — UNCHANGED
  ───────────────────────────────────────────────────────────────────── */
  if (loading) return <LoadingScreen />;

  if (error) return (
    <div className="min-h-screen flex items-center justify-center relative" style={{ background: "var(--eb-bg)" }}>
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <div className="eb-card max-w-md text-center">
        <p className="text-sm text-red-400 mb-4">{error}</p>
        <button className="eb-btn-outline" onClick={() => navigate("/")}>Back to Login</button>
      </div>
    </div>
  );

  if (fsPrompt) return <FullscreenGateway onEnter={enterFullscreen} />;

  if (submitting) return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "var(--eb-bg)" }}>
      <span className="spinner w-10 h-10 border-4 mb-4" />
      <p className="text-sm" style={{ color: "var(--eb-text-muted)" }}>Submitting your exam…</p>
    </div>
  );

  /* ─────────────────────────────────────────────────────────────────────
     MAIN EXAM RENDER
  ───────────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex flex-col select-none" style={{ background: "var(--eb-bg)" }}>

      {showWarning && <TimerWarningOverlay secondsLeft={warnSecs} />}

      {/* ── Top Bar — small, single row ──────────────────────────────── */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 sm:px-6 py-2 border-b"
        style={{ background: "var(--eb-surface)", borderColor: "var(--eb-border)", backdropFilter: "blur(8px)" }}>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 rounded-lg" style={{ color: "var(--eb-text-muted)" }} aria-label="Open sections">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <img src="/logo.png" alt="EchoBrains" className="h-6 w-auto" draggable={false} />
          {/* Compact "Protected Mode" indicator - a small pill, not a
              separate full-width banner. Tooltip carries the fuller
              warning text so it stays out of the way visually. */}
          <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: "rgba(249,115,22,0.1)", color: "var(--eb-orange)" }}
            title="Switching tabs or exiting fullscreen will auto-submit your exam immediately.">
            <Icons.Shield /> Protected Mode
          </div>
        </div>

        <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-bold tabular-nums transition-colors duration-500 ${globalWarning ? "animate-pulse" : ""}`}
          style={{
            background: globalWarning ? "rgba(248,113,113,0.15)" : "rgba(6,182,212,0.08)",
            border: `1px solid ${globalWarning ? "rgba(248,113,113,0.4)" : "rgba(6,182,212,0.25)"}`,
            color: globalWarning ? "#EF4444" : "#0891B2",
          }}>
          <Icons.Clock />
          {remainingMs !== null ? fmtMs(remainingMs) : "--:--:--"}
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="hidden md:inline text-xs" style={{ color: "var(--eb-text-muted)" }}>{answeredCount}/{questions.length}</span>
          <ThemeToggle />
          <ProfilePopup profile={profile} />
        </div>
      </header>

      {violations > 0 && (
        <div className="px-6 py-2 text-xs font-semibold text-center" style={{ background: "rgba(248,113,113,0.15)", color: "#EF4444" }}>
          ⚠ Security violation detected — your exam has been auto-submitted.
        </div>
      )}

      {/* ── Body: sidebar + question batch ───────────────────────────── */}
      <div className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 flex gap-5 items-start">

        <CategorySidebar
          categories={categories}
          activeKey={activeCategoryKey}
          onSelectCategory={goToCategory}
          mobileOpen={sidebarOpen}
          onCloseMobile={() => setSidebarOpen(false)}
        />

        <main className="flex-1 min-w-0 space-y-5">

          {activeCategory && (() => {
            const activeStyle = styleForCategory(activeCategoryKey, categories.findIndex(c => c.key === activeCategoryKey));
            return (
              <div className="rounded-2xl p-4 border" style={{ background: "var(--eb-surface)", borderColor: "var(--eb-border)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold" style={{ color: activeStyle.color }}>{activeStyle.label}</p>
                  <span className="text-xs font-mono" style={{ color: "var(--eb-text-faint)" }}>
                    {activeCategory.answeredCount}/{activeCategory.questions.length} answered in this section
                  </span>
                </div>
                <QuestionStrip
                  questionsInCategory={activeCategory.questions}
                  currentPageQuestionIds={currentPageQuestionIds}
                  answers={answers}
                  onJump={goToQuestionIndex}
                />
              </div>
            );
          })()}

          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: "var(--eb-text)" }}>
              Questions {pageStart + 1}–{Math.min(pageStart + Qs_PER_PAGE, questions.length)}
              <span className="ml-2 text-xs font-normal" style={{ color: "var(--eb-text-faint)" }}>of {questions.length}</span>
            </p>
            <span className="text-xs font-mono px-2.5 py-1 rounded-full" style={{ background: "rgba(249,115,22,0.1)", color: "var(--eb-orange)", border: "1px solid rgba(249,115,22,0.25)" }}>
              Page {page + 1} of {totalPages}
            </span>
          </div>

          {pageQuestions.map((q, i) => (
            <QuestionCard
              key={q.id}
              question={q}
              globalIndex={pageStart + i}
              selectedOption={answers[q.id] ?? null}
              onSelect={selectOption}
              locked={locked}
              categoryStyle={styleForCategory(q.type, categories.findIndex(c => c.key === q.type))}
            />
          ))}

          {/* ── Pagination Ribbon ─────────────────────────────────────── */}
          <div className="flex items-center justify-between pt-4 pb-2 border-t" style={{ borderColor: "var(--eb-border)" }}>
            <button onClick={() => goToPage(page - 1)} disabled={page === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-30"
              style={{ background: "var(--eb-surface-muted)", border: "1px solid var(--eb-border)", color: "var(--eb-text-muted)" }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
              Previous
            </button>

            <div className="hidden sm:flex items-center gap-1.5">
              {Array.from({ length: totalPages }).map((_, i) => (
                <button key={i} onClick={() => goToPage(i)} className="transition-all duration-200 rounded-full"
                  style={{ width: i === page ? 24 : 8, height: 8, background: i === page ? "linear-gradient(90deg, #F97316, #06B6D4)" : "var(--eb-border-strong)" }} />
              ))}
            </div>

            <span className="sm:hidden text-xs font-mono" style={{ color: "var(--eb-text-faint)" }}>{page + 1} / {totalPages}</span>

            {/* Manual submit - only rendered once inside the final 5
                minutes (manualSubmitAvailable). Outside that window,
                reaching the last page shows an info note instead of a
                button - never auto-submits, never blocks Next/Previous. */}
            {manualSubmitAvailable ? (
              <button onClick={handleManualSubmit} disabled={locked}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-[1.02] disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff" }}>
                Submit Exam
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </button>
            ) : (
              <button onClick={() => goToPage(page + 1)} disabled={page === totalPages - 1}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] disabled:opacity-30"
                style={{ background: "linear-gradient(135deg, #F97316, #EA580C)", color: "#fff" }}>
                Next
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between text-xs pb-4" style={{ color: "var(--eb-text-faint)" }}>
            <span>{answeredCount} answered · {questions.length - answeredCount} remaining</span>
            {isLastPage && !manualSubmitAvailable && (
              <span className="flex items-center gap-1" style={{ color: "var(--eb-text-faint)" }}>
                   <Icons.Info /> Manual submit unlocks in the final {manualSubmitWindowMs / 60000} minutes. Your exam auto-submits when time runs out.
              </span>
            )}
            {isLastPage && manualSubmitAvailable && (
              <span style={{ color: "var(--eb-orange)" }}>You are on the last page. Submit when ready.</span>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

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
 * Anti-cheat / examination policy:
 *  • Fullscreen gateway before the exam starts.
 *  • Tab-switch / window-blur / fullscreen-exit → server-side violation handling.
 *  • First two violations temporarily restrict access; the third terminates access.
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
 * Navigation — 10 questions per page, with a left category sidebar
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
import QuestionCard from "./shared/QuestionCard.jsx";
import { loadExamSession, saveExamSession, deleteExamSession } from "../utils/examStorage.js";

/* ─── Constants ─────────────────────────────────────────────────────────── */
const FALLBACK_SECONDS      = 60 * 60;
const Qs_PER_PAGE           = 10; // was 5 - halves page-navigation frequency, and now aligns each 10-question section (Aptitude/Logical) to exactly one page
const WARN_SECONDS          = 10;
const LS_SLOT_END_KEY       = "examSlotEndTime";
const FALLBACK_MANUAL_SUBMIT_WINDOW_MS = 5 * 60 * 1000; // used only until the admin-configured value loads
const FS_TRANSITION_MS      = 1500; // widened from 800ms - guard window for fullscreen entry
const FINAL_SUBMIT_TIMEOUT_MS = 6000;              // one final submit request never waits longer
const FINAL_RETRY_MS          = 3000;              // retry gap after the final window
const FINAL_SILENT_RETRY_AFTER_END_MS = 60 * 1000; // background retries stop 1 min after the end

/* ─── Laptop keyboard lock (Chrome / Edge) ───────────────────────────────
   While the exam is in fullscreen ALL keys are captured (same call as
   Chrome's official keyboard-lock demo: navigator.keyboard.lock() with no
   key list), so Alt+Tab, the Windows key, Ctrl+T/W/N, F5 etc. reach the exam
   page instead of the operating system / browser, and the page ignores them.
   Exit: the student PRESSES AND HOLDS Esc for ~2 seconds (Chrome's built-in
   escape hatch); that exit is handled as a violation exactly as before.
   The key lists below are only fallbacks if the full lock is refused.
   Not possible from any website: Ctrl+Alt+Del, Win+L, power button and
   3/4-finger touchpad gestures (handled by Windows before the browser). */
const LOCKED_KEY_CODES = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(c => `Key${c}`),
  ..."0123456789".split("").map(d => `Digit${d}`),
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  "Tab", "CapsLock", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight",
  "AltLeft", "AltRight", "MetaLeft", "MetaRight", "ContextMenu", "Space", "Enter",
  "Backspace", "Delete", "Insert", "Home", "End", "PageUp", "PageDown",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backquote", "Minus", "Equal",
  "BracketLeft", "BracketRight", "Backslash", "Semicolon", "Quote", "Comma", "Period", "Slash",
  "PrintScreen", "ScrollLock", "Pause", "NumLock",
  ..."0123456789".split("").map(d => `Numpad${d}`),
  "NumpadAdd", "NumpadSubtract", "NumpadMultiply", "NumpadDivide", "NumpadDecimal", "NumpadEnter",
  "BrowserBack", "BrowserForward", "BrowserRefresh", "BrowserHome", "BrowserSearch",
];
// Smaller set used only if a browser rejects the full list.
const ESSENTIAL_LOCKED_KEY_CODES = [
  "MetaLeft", "MetaRight", "Tab", "AltLeft", "AltRight", "ControlLeft", "ControlRight",
  "KeyW", "KeyT", "KeyN", "KeyR", "F4", "F5", "F11", "BrowserBack", "BrowserForward",
];

/**
 * Captures system keys in fullscreen (Chrome/Edge).
 * Only ONE lock request is ever in flight: a second keyboard.lock() call
 * cancels the pending one (AbortError), so overlapping calls must share it.
 * Resolves to { ok, reason } - reason explains why the lock is not active.
 */
let keyboardLockRequest = null;
function lockExamKeyboard() {
  if (keyboardLockRequest) return keyboardLockRequest;
  keyboardLockRequest = (async () => {
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      return { ok: false, reason: "page is not HTTPS/localhost" };
    }
    const kb = typeof navigator !== "undefined" ? navigator.keyboard : null;
    if (!kb || typeof kb.lock !== "function") return { ok: false, reason: "browser does not support keyboard lock" };
    if (!document.fullscreenElement) return { ok: false, reason: "not in fullscreen" };
    try {
      await kb.lock();                                   // all keys - same call as Chrome's demo
      return { ok: true, reason: "" };
    } catch (first) {
      try {
        await kb.lock(ESSENTIAL_LOCKED_KEY_CODES);       // fallback: the most important keys only
        return { ok: true, reason: "" };
      } catch (second) {
        return { ok: false, reason: `${second?.name || first?.name || "Error"}: ${second?.message || first?.message || "lock refused"}` };
      }
    }
  })().finally(() => { keyboardLockRequest = null; });
  return keyboardLockRequest;
}

function unlockExamKeyboard() {
  try { navigator.keyboard?.unlock?.(); } catch { /* ignore */ }
}

/* Answer synchronisation rules:
   - Pages before the last: NO automatic saving. Unsaved answers (from ANY page)
     are sent when the student clicks Next / Previous / a question number.
   - Last page only: autosave 1.5 s after the last click, never later than 3 s
     after the first unsaved click (students often do not navigate again there).
   - Nothing changed = no request.
   A small random spread avoids many students hitting the server together. */
const SYNC_IDLE_MS = 1500;
const SYNC_MAX_WAIT_MS = 3000;
const SYNC_JITTER_MS = 400;

/* Next / Previous waits for the server's confirmation before changing page,
   but never longer than this (no internet: the student is not stuck; the
   unsaved answers are retried and also go with the next save / final submit). */
const NAV_SYNC_MAX_WAIT_MS = 3000;

/* Final violation sync: retries until the server confirms the answers. */
const VIOLATION_SYNC_RETRY_MS = 1500;

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

import { styleForCategory } from "./shared/sectionStyles.js";

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
              : "Click below to enter fullscreen and start your exam. Exiting fullscreen or switching tabs triggers examination-policy access control."}
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
/* Final-seconds screen. ALWAYS the same calm "Submitting your exam" screen -
   also when the student's internet drops (the submission is retried in the
   background and completes as soon as the connection returns). */
function TimerWarningOverlay({ secondsLeft }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: "rgba(7,0,0,0.88)", backdropFilter: "blur(6px)" }}
      role="alertdialog" aria-live="assertive">
      <div className="text-center space-y-6 px-8 max-w-md">
        <div className="flex items-center justify-center w-20 h-20 rounded-full mx-auto animate-pulse"
          style={{ background: "rgba(52,211,153,0.15)", border: "2px solid rgba(52,211,153,0.5)", color: "#34D399" }}>
          <Icons.Lock />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#34D399" }}>Submitting your exam</p>
          {secondsLeft > 0
            ? <p className="text-6xl font-black tabular-nums" style={{ color: "#F8FAFC" }}>{secondsLeft}</p>
            : <span className="spinner w-10 h-10 border-4 inline-block" />}
          <p className="text-sm mt-3" style={{ color: "#CBD5E1" }}>Please wait. Your answers are being submitted.</p>
        </div>
        {secondsLeft > 0 && (
          <div className="flex items-center justify-center gap-1.5">
            {Array.from({ length: WARN_SECONDS }).map((_, i) => (
              <div key={i} className="h-1 rounded-full transition-all duration-1000"
                style={{ width: 20, background: i < secondsLeft ? "#34D399" : "rgba(255,255,255,0.15)" }} />
            ))}
          </div>
        )}
        <p className="text-xs" style={{ color: "#94A3B8" }}>Answers are locked. Please keep this window open.</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   VIOLATION OVERLAY — shown while answers are frozen and being force-synced
   after a tab switch / fullscreen exit, BEFORE the violation is recorded.
───────────────────────────────────────────────────────────────────────── */
function ViolationSyncOverlay({ waitingForNetwork }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" style={{ background: "rgba(7,0,0,0.88)", backdropFilter: "blur(6px)" }}
      role="alertdialog" aria-live="assertive">
      <div className="text-center space-y-5 max-w-md">
        <div className="flex items-center justify-center w-16 h-16 rounded-full mx-auto"
          style={{ background: "rgba(251,191,36,0.15)", border: "2px solid rgba(251,191,36,0.5)", color: "#FBBF24" }}>
          <Icons.Warning />
        </div>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#FBBF24" }}>Tab switch detected</p>
        <p className="text-base font-semibold" style={{ color: "#F8FAFC" }}>
          {waitingForNetwork ? "Waiting for internet connection…" : "Saving your latest answers…"}
        </p>
        <p className="text-sm" style={{ color: "#CBD5E1" }}>
          {waitingForNetwork
            ? "Your answers are safe on this device. They will be saved as soon as the connection returns."
            : "Please wait. Your answers are locked until they are saved."}
        </p>
        <span className="spinner w-8 h-8 border-4 inline-block" />
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
        style={{ background: "var(--eb-surface)", borderColor: "var(--eb-border)" }}>
        <p className="text-[11px] font-semibold uppercase tracking-wide mb-3 px-1" style={{ color: "var(--eb-text-faint)" }}>Sections</p>
        {content}
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onCloseMobile} />
          <div className="relative w-72 max-w-[80vw] h-auto max-h-[70vh] p-4 rounded-r-2xl" style={{ background: "var(--eb-surface)" }}>
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
  const [submitError, setSubmitError] = useState(null); // set only after retries are exhausted - student is told honestly, never shown a fake success
  const [violations,  setViolations]  = useState(0);
  const [locked,      setLocked]      = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileNavigatorExpanded, setMobileNavigatorExpanded] = useState(true);
  const [profile,     setProfile]     = useState(null); // read-only, ProfilePopup only
  const [manualSubmitWindowMs, setManualSubmitWindowMs] = useState(FALLBACK_MANUAL_SUBMIT_WINDOW_MS);
  const [accessStatus, setAccessStatus] = useState("READY");
  const [restrictionUntil, setRestrictionUntil] = useState(null);
  const [networkStatus, setNetworkStatus] = useState(() => navigator.onLine === false ? "offline" : "connected");
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [syncStatus, setSyncStatus] = useState("saved");
  // Violation freeze: null | "saving" | "waiting-network". While set, answers and navigation are locked.
  const [violationPhase, setViolationPhase] = useState(null);
  // Browser keyboard lock status, shown in the header: null = not checked yet
  const [keyboardLock, setKeyboardLock] = useState(null);
  // Final 10 seconds: null | "submitting" | "offline" | "done"
  const [finalPhase, setFinalPhase] = useState(null);

  /* ── Refs — UNCHANGED ──────────────────────────────────────────────── */
  const slotEndMsRef    = useRef(null);
  const clockDriftMsRef = useRef(0);
  const tickRef         = useRef(null);
  const warnTimerRef    = useRef(null);
  const isSubmittedRef  = useRef(false); // set ONLY on a confirmed server success - never optimistically
  const submittingRef   = useRef(false); // true only while a submit attempt is actually in flight (guards against overlapping retries/triggers)
  const fsTransitionRef = useRef(false);
  const saveInFlightRef = useRef(null);
  const answersRef = useRef({});
  const syncedAnswersRef = useRef({});
  const syncQueueRef = useRef(new Set());
  const syncSequenceRef = useRef(0);
  const examIdRef = useRef(null);
  const studentIdRef = useRef(null);
  const storageKeyRef = useRef(null);
  const violationInFlightRef = useRef(false);
  const currentPageRef = useRef(0);
  const questionsRef = useRef([]);
  const violationFrozenRef = useRef(false); // immediate (non-render) copy of the violation freeze
  const lastViolationSentAtRef = useRef(0);  // time the last /violation request was sent
  const syncTimerRef = useRef(null);         // pending autosave timer
  const firstDirtyAtRef = useRef(0);         // when the oldest unsaved click happened
  const finalStartedRef = useRef(false);     // final 10-second submission has begun
  const navigatingRef = useRef(false);       // a Next/Previous is waiting for the server
  const finalRetryTimerRef = useRef(null);   // offline / silent retry timer
  const finalOnlineHandlerRef = useRef(null);

  /* ── Derived ───────────────────────────────────────────────────────── */
  const totalPages    = Math.max(1, Math.ceil(questions.length / Qs_PER_PAGE));
  const pageStart     = page * Qs_PER_PAGE;
  const pageQuestions = questions.slice(pageStart, pageStart + Qs_PER_PAGE);
  const answeredCount = Object.keys(answers).length;
  const globalWarning = remainingMs !== null && remainingMs <= 5 * 60 * 1000 && remainingMs > WARN_SECONDS * 1000;
  const showWarning   = finalPhase === "submitting" || finalPhase === "offline";
  const isLastPage    = page === totalPages - 1;
  // Manual submit visibility - purely a display gate, computed from the
  // same server-synced remainingMs the timer already uses. Never a second
  // timer, never a separate deadline calculation.
  const manualSubmitAvailable = remainingMs !== null && remainingMs <= manualSubmitWindowMs;
  // Answers/navigation are locked by the 10-second deadline OR by a violation being processed.
  const inputLocked = locked || violationPhase !== null;

  /* Mobile question navigator:
     - Expanded at the top of the exam.
     - Collapses after the student scrolls down so it does not consume screen space.
     - Expands again automatically when the student returns to the top.
     Desktop behavior is unchanged. */
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth >= 640) return;
      setMobileNavigatorExpanded(window.scrollY <= 80);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

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
  const lastAutoRef = useRef(false); // remembers which submit type (auto/manual) triggered this, so the Retry button can resume correctly

  const buildAllAnswerEntries = useCallback(() => questions.map(q => ({
    questionId: q.id,
    selectedOptionIndex: answersRef.current[q.id] ?? null,
    timeSpentInSeconds: 0,
  })), [questions]);

  const persistLocal = useCallback(async () => {
    if (!storageKeyRef.current || !examIdRef.current || !studentIdRef.current) return;
    await saveExamSession({
      key: storageKeyRef.current,
      examId: examIdRef.current,
      studentId: studentIdRef.current,
      answers: answersRef.current,
      syncedAnswers: syncedAnswersRef.current,
      sequence: syncSequenceRef.current,
      currentQuestionIndex: currentPageRef.current * Qs_PER_PAGE,
      questions: questionsRef.current,
      slotEndTime: slotEndMsRef.current ? new Date(slotEndMsRef.current).toISOString() : null,
      updatedAt: Date.now(),
    });
  }, []);

  /* ── Answer synchronisation (dirty-based, every page incl. the last) ──
     answersRef        = latest browser answers
     syncedAnswersRef  = answers the SERVER confirmed
     dirty             = any question where the two differ            */
  const anyDirty = useCallback(() => questionsRef.current.some(q =>
    (answersRef.current[q.id] ?? null) !== (syncedAnswersRef.current[q.id] ?? null)
  ), []);

  const runQueuedSync = useCallback(async () => {
    if (saveInFlightRef.current) return saveInFlightRef.current;
    const run = (async () => {
      const dirtyQuestions = () => questionsRef.current.filter(q =>
        (answersRef.current[q.id] ?? null) !== (syncedAnswersRef.current[q.id] ?? null)
      );
      let rounds = 0;
      while (!isSubmittedRef.current) {
        const changed = dirtyQuestions();
        if (!changed.length) break;
        if (++rounds > 20) break;                       // safety; the retry timer continues later
        setSyncStatus("saving");
        syncSequenceRef.current += 1;
        // Snapshot exactly what is sent. A click during the request stays dirty
        // and goes in the next round - it is never marked saved by this reply.
        const sentValues = Object.fromEntries(changed.map(q => [q.id, answersRef.current[q.id] ?? null]));
        const payload = {
          answers: changed.map(q => ({ questionId: q.id, selectedOptionIndex: sentValues[q.id], timeSpentInSeconds: 0 })),
          currentQuestionIndex: currentPageRef.current * Qs_PER_PAGE,
          clientSequence: syncSequenceRef.current,
        };
        try {
          const token = localStorage.getItem("studentToken");
          const startedAt = performance.now();
          const res = await api.post("/student/exam/save-progress", payload, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
          const elapsed = performance.now() - startedAt;
          setNetworkStatus(elapsed > 1800 ? "slow" : "connected");

          const data = res?.data;
          if (data && typeof data === "object" && data.answers && typeof data.answers === "object") {
            // The server returned what it really stored: trust only that.
            if (Number.isFinite(Number(data.stateVersion))) {
              syncSequenceRef.current = Math.max(syncSequenceRef.current, Number(data.stateVersion));
            }
            changed.forEach(q => {
              const sent = sentValues[q.id];
              const current = answersRef.current[q.id] ?? null;
              if (current !== sent) return;              // changed during the request: stays dirty
              const stored = Object.prototype.hasOwnProperty.call(data.answers, q.id) ? data.answers[q.id] : null;
              if (stored === null || stored === undefined) delete syncedAnswersRef.current[q.id];
              else syncedAnswersRef.current[q.id] = stored;
              // If the server ignored it (stored !== sent) it stays dirty and is resent next round.
            });
            // CROSS-CHECK the rest of the paper against what the server holds. An answer
            // from an earlier page that the server does not have (or has differently)
            // becomes "unsaved" again and is sent in the next round, so server and browser
            // stay equal for every page except unsaved clicks on the current page.
            questionsRef.current.forEach(q => {
              if (Object.prototype.hasOwnProperty.call(sentValues, q.id)) return;
              const stored = Object.prototype.hasOwnProperty.call(data.answers, q.id) ? data.answers[q.id] : null;
              if (stored === null || stored === undefined) delete syncedAnswersRef.current[q.id];
              else syncedAnswersRef.current[q.id] = stored;
            });
          } else {
            // Older backend that only answers "OK".
            changed.forEach(q => {
              const sent = sentValues[q.id];
              if ((answersRef.current[q.id] ?? null) !== sent) return;
              if (sent === null) delete syncedAnswersRef.current[q.id];
              else syncedAnswersRef.current[q.id] = sent;
            });
          }
          await persistLocal();
        } catch {
          syncQueueRef.current.add(0);
          setSyncStatus("offline");
          setNetworkStatus(navigator.onLine === false ? "offline" : "slow");
          await persistLocal();
          break;
        }
      }
      if (!dirtyQuestions().length && !isSubmittedRef.current) {
        syncQueueRef.current.clear();
        setSyncStatus("saved");
      } else if (rounds > 20) {
        syncQueueRef.current.add(0);                    // server kept refusing: retry timer tries again
      }
    })();
    saveInFlightRef.current = run;
    try { await run; } finally { if (saveInFlightRef.current === run) saveInFlightRef.current = null; }
    return run;
  }, [persistLocal]);

  /* Debounced autosave after an answer click: 1.5 s idle, max 3 s after the first unsaved click. */
  const scheduleAnswerSync = useCallback(() => {
    const now = Date.now();
    if (!firstDirtyAtRef.current) firstDirtyAtRef.current = now;
    clearTimeout(syncTimerRef.current);
    const untilMaxWait = firstDirtyAtRef.current + SYNC_MAX_WAIT_MS - now;
    const delay = Math.max(0, Math.min(SYNC_IDLE_MS, untilMaxWait)) + Math.floor(Math.random() * SYNC_JITTER_MS);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      firstDirtyAtRef.current = 0;
      if (!violationFrozenRef.current) void runQueuedSync();   // during a violation the force-sync handles it
    }, delay);
  }, [runQueuedSync]);

  /* Navigation checkpoint: send every unsaved answer (any page), no request if nothing is dirty. */
  const queuePageSync = useCallback(() => {
    if (anyDirty()) void runQueuedSync();
  }, [anyDirty, runQueuedSync]);

  const flushAllDirty = useCallback(async () => {
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = null;
    firstDirtyAtRef.current = 0;
    if (anyDirty()) await runQueuedSync();
  }, [anyDirty, runQueuedSync]);

  useEffect(() => () => clearTimeout(syncTimerRef.current), []);

  const submitExam = useCallback(async (auto = false) => {
    if (isSubmittedRef.current || submittingRef.current) return;
    submittingRef.current = true;
    lastAutoRef.current = auto;
    clearInterval(tickRef.current);
    clearTimeout(warnTimerRef.current);
    setSubmitting(true);
    setSubmitError(null);

    // Best effort Redis sync first; the submit payload also contains the
    // complete browser state, so a Redis outage cannot destroy the attempt.
    await flushAllDirty();
    const token = localStorage.getItem("studentToken");
    const MAX_ATTEMPTS = 6;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await api.post("/student/exam/submit", {
          autoSubmitted: auto,
          answers: buildAllAnswerEntries(),
          currentQuestionIndex: page * Qs_PER_PAGE,
          clientSequence: ++syncSequenceRef.current,
        }, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
        isSubmittedRef.current = true;
        submittingRef.current = false;
        localStorage.removeItem(LS_SLOT_END_KEY);
        if (res.data?.scores) localStorage.setItem("examScores", JSON.stringify(res.data.scores));
        if (storageKeyRef.current) await deleteExamSession(storageKeyRef.current);
        localStorage.removeItem("studentId");
        localStorage.removeItem("examId");
        navigate("/student/result");
        return;
      } catch (err) {
        const isNetworkFailure = !err.response;
        const isLastAttempt = attempt === MAX_ATTEMPTS;
        if (!isNetworkFailure || isLastAttempt) {
          submittingRef.current = false;
          setSubmitError(isNetworkFailure
            ? "We couldn't reach the server to confirm your submission. Please check the connection and tap Retry. Your answers remain safely stored in this browser."
            : (err.response?.data?.message || "Something went wrong while submitting. Please tap Retry."));
          return;
        }
        await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }
  }, [buildAllAnswerEntries, flushAllDirty, navigate, page]);
  /* ─────────────────────────────────────────────────────────────────────
     DEADLINE WARNING COUNTDOWN
  ───────────────────────────────────────────────────────────────────── */
  /* ─────────────────────────────────────────────────────────────────────
     FINAL 10 SECONDS — lock, submit ALL answers BEFORE 00:00
     - Online + server answers   -> result page.
     - Student offline           -> "We have saved your latest answers. Please
                                    reconnect…", submits by itself on reconnect.
     - Online, server not answering -> "submitted successfully" screen; silent
                                    retries until 1 minute after the end.
     Never a scary "not submitted" message.
  ───────────────────────────────────────────────────────────────────── */
  const finalWait = (ms) => new Promise(r => setTimeout(r, Math.max(0, ms)));
  const finalNowMs = () => Date.now() - clockDriftMsRef.current;

  /** One submit request with every answer. Never throws. */
  const sendFinalSubmit = useCallback(async () => {
    try {
      const token = localStorage.getItem("studentToken");
      const qs = questionsRef.current.length ? questionsRef.current : questions;
      const res = await api.post("/student/exam/submit", {
        autoSubmitted: true,
        answers: qs.map(q => ({ questionId: q.id, selectedOptionIndex: answersRef.current[q.id] ?? null, timeSpentInSeconds: 0 })),
        currentQuestionIndex: currentPageRef.current * Qs_PER_PAGE,
        clientSequence: ++syncSequenceRef.current,
      }, { headers: { Authorization: `Bearer ${token}` }, timeout: FINAL_SUBMIT_TIMEOUT_MS });
      return { ok: true, res };
    } catch (err) {
      return { ok: false, offline: navigator.onLine === false, status: err.response?.status ?? null };
    }
  }, [questions]);

  const stopFinalRetries = useCallback(() => {
    clearTimeout(finalRetryTimerRef.current);
    finalRetryTimerRef.current = null;
    if (finalOnlineHandlerRef.current) {
      window.removeEventListener("online", finalOnlineHandlerRef.current);
      finalOnlineHandlerRef.current = null;
    }
  }, []);

  /** Server has the submission: clear the local copy. */
  const clearLocalExam = useCallback(async (res) => {
    isSubmittedRef.current = true;
    submittingRef.current = false;
    clearInterval(tickRef.current);
    stopFinalRetries();
    localStorage.removeItem(LS_SLOT_END_KEY);
    if (res?.data?.scores) localStorage.setItem("examScores", JSON.stringify(res.data.scores));
    try { if (storageKeyRef.current) await deleteExamSession(storageKeyRef.current); } catch { /* ignore */ }
    localStorage.removeItem("studentId");
    localStorage.removeItem("examId");
  }, [stopFinalRetries]);

  const completeFinalSubmission = useCallback(async (res) => {
    await clearLocalExam(res);
    navigate("/student/result", { replace: true });
  }, [clearLocalExam, navigate]);

  /** Online but the server does not answer: exam has ended for the student; retry silently. */
  const showSubmittedAndRetrySilently = useCallback(() => {
    finalStartedRef.current = true;
    setLocked(true);
    setSubmitting(false);
    setSubmitError(null);
    setFinalPhase("done");
    clearInterval(tickRef.current);
    stopFinalRetries();
    const stopAt = (slotEndMsRef.current ?? finalNowMs()) + FINAL_SILENT_RETRY_AFTER_END_MS;
    const attempt = async () => {
      if (isSubmittedRef.current || finalNowMs() > stopAt) { finalRetryTimerRef.current = null; return; }
      const r = await sendFinalSubmit();
      if (r.ok) { await clearLocalExam(r.res); return; }           // stays on the "submitted" screen
      finalRetryTimerRef.current = setTimeout(attempt, FINAL_RETRY_MS);
    };
    finalRetryTimerRef.current = setTimeout(attempt, FINAL_RETRY_MS);
  }, [clearLocalExam, sendFinalSubmit, stopFinalRetries]);

  /** Student offline: answers stay in the browser; submit automatically when back online. */
  const waitForInternetThenSubmit = useCallback(() => {
    finalStartedRef.current = true;
    setLocked(true);
    setSubmitting(false);
    setSubmitError(null);
    setFinalPhase("offline");
    stopFinalRetries();
    void persistLocal();
    let busy = false;
    const attempt = async () => {
      if (isSubmittedRef.current || busy) return;
      if (navigator.onLine === false) { finalRetryTimerRef.current = setTimeout(attempt, FINAL_RETRY_MS); return; }
      busy = true;
      const r = await sendFinalSubmit();
      busy = false;
      if (r.ok) { await completeFinalSubmission(r.res); return; }
      if (!r.offline) { showSubmittedAndRetrySilently(); return; }   // back online, server is the problem
      finalRetryTimerRef.current = setTimeout(attempt, FINAL_RETRY_MS);
    };
    finalOnlineHandlerRef.current = () => { clearTimeout(finalRetryTimerRef.current); void attempt(); };
    window.addEventListener("online", finalOnlineHandlerRef.current);
    finalRetryTimerRef.current = setTimeout(attempt, FINAL_RETRY_MS);
  }, [completeFinalSubmission, persistLocal, sendFinalSubmit, showSubmittedAndRetrySilently, stopFinalRetries]);

  /** 10 seconds left: lock everything and submit all answers before the end. */
  const startFinalSubmission = useCallback(async () => {
    if (finalStartedRef.current || isSubmittedRef.current) return;
    finalStartedRef.current = true;
    clearTimeout(syncTimerRef.current);              // no more normal saves
    setLocked(true);
    setSubmitting(false);
    setSubmitError(null);
    setFinalPhase("submitting");
    void persistLocal();
    if (saveInFlightRef.current) { try { await saveInFlightRef.current; } catch { /* submit carries everything */ } }

    while (!isSubmittedRef.current) {
      const r = await sendFinalSubmit();
      if (r.ok) { await completeFinalSubmission(r.res); return; }
      if (r.offline) { waitForInternetThenSubmit(); return; }
      const left = (slotEndMsRef.current ?? 0) - finalNowMs();
      if (left <= 500) { showSubmittedAndRetrySilently(); return; }
      await finalWait(Math.min(1500, left - 400));    // retry while time remains
    }
  }, [completeFinalSubmission, persistLocal, sendFinalSubmit, showSubmittedAndRetrySilently, waitForInternetThenSubmit]);

  useEffect(() => () => stopFinalRetries(), [stopFinalRetries]);

  /* ─────────────────────────────────────────────────────────────────────
     START EXAM FLOW
  ───────────────────────────────────────────────────────────────────── */
  const startExamFlow = useCallback(async () => {
    try {
      const token = localStorage.getItem("studentToken");
      await api.post("/student/exam/start", {}, { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
      setAccessStatus("ACTIVE");
    } catch (err) {
      fsTransitionRef.current = false;
      setError(err.response?.data?.message || "Unable to start the examination. Please try again.");
      return;
    }

    tickRef.current = setInterval(() => {
      // Stop entirely once genuinely submitted, and pause (skip this tick,
      // don't re-trigger the deadline countdown) while a submit attempt is
      // already retrying - the retry loop will finish on its own; we don't
      // want the timer racing to fire ANOTHER auto-submit trigger on top
      // of one that's already in flight.
      if (isSubmittedRef.current) { clearInterval(tickRef.current); return; }
      if (submittingRef.current) return;
      const deadline = slotEndMsRef.current;
      if (deadline === null) return;
      const adjustedNow = Date.now() - clockDriftMsRef.current;
      const ms = deadline - adjustedNow;
      if (ms <= 0) {
        clearInterval(tickRef.current);
        setRemainingMs(0);
        setWarnSecs(0);
        if (!finalStartedRef.current) void startFinalSubmission();
        return;
      }
      setRemainingMs(ms);
      if (ms <= WARN_SECONDS * 1000) {
        setWarnSecs(Math.ceil(ms / 1000));            // countdown on the overlay
        if (!finalStartedRef.current) void startFinalSubmission();
      }
    }, 1000);
  }, [startFinalSubmission]);

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

  /* Simple device/network indicators. No polling is added for these UI
     indicators: online/offline comes from the browser, network quality is
     inferred from the existing exam save request, and battery uses the
     browser Battery API only when the device exposes it. */
  useEffect(() => {
    if (fsPrompt || loading) return;
    const onOnline = () => { setNetworkStatus("connected"); if (!anyDirty()) setSyncStatus("saved"); };
    const onOffline = () => { setNetworkStatus("offline"); setSyncStatus("offline"); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    let battery = null;
    const updateBattery = () => {
      if (battery && typeof battery.level === "number") setBatteryLevel(Math.round(battery.level * 100));
    };
    if (navigator.getBattery) {
      navigator.getBattery().then(b => {
        battery = b;
        updateBattery();
        b.addEventListener("levelchange", updateBattery);
      }).catch(() => {});
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      if (battery) battery.removeEventListener("levelchange", updateBattery);
    };
  }, [fsPrompt, loading]);

  /* Retry pending dirty pages after temporary college-network outages.
     This timer is local-only and never runs a request when nothing is dirty. */
  useEffect(() => {
    if (fsPrompt || loading) return;
    // Retries ONLY a send that failed (network drop / server error). It never
    // sends unsaved current-page clicks on its own - those go on Next/Previous.
    const retry = () => {
      if (navigator.onLine !== false && !violationFrozenRef.current && syncQueueRef.current.size > 0) void runQueuedSync();
    };
    const id = setInterval(retry, 5000);
    window.addEventListener("online", retry);
    return () => { clearInterval(id); window.removeEventListener("online", retry); };
  }, [fsPrompt, loading, runQueuedSync]);

  /* ─────────────────────────────────────────────────────────────────────
     RE-SYNC ON RECONNECT / FOCUS
  ───────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (fsPrompt || loading) return;
    const resync = async () => {
      if (isSubmittedRef.current || submittingRef.current || finalStartedRef.current) return;
      try {
        const token = localStorage.getItem("studentToken");
        const res = await api.get("/student/exam/time-status", { headers: { Authorization: `Bearer ${token}` } });
        const { slotEndTime, serverNow, isExpired, isSubmitted } = res.data;
        if (isSubmitted) {                            // server already has the submission
          await completeFinalSubmission(null);
          return;
        }
        if (isExpired) {
          setRemainingMs(0);
          void startFinalSubmission();
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
  }, [fsPrompt, loading, completeFinalSubmission, startFinalSubmission]);

  /* ─────────────────────────────────────────────────────────────────────
     EXAMINATION-POLICY VIOLATIONS
  ───────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (fsPrompt || loading) return;
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    const timeLeftMs = () => slotEndMsRef.current === null
      ? Infinity
      : slotEndMsRef.current - (Date.now() - clockDriftMsRef.current);

    /* Freeze / unfreeze answer input + navigation (ref = immediate, state = UI). */
    const freeze = (on, phase = "saving") => {
      violationFrozenRef.current = on;
      setViolationPhase(on ? phase : null);
    };

    /*
     * FORCE-SYNC: send the COMPLETE browser answer state and wait until the
     * server confirms it. If the server returns its stored answers, every
     * answer is checked; a request the server ignored as "old" is resent with
     * a newer sequence number. No internet: keep waiting (answers stay in
     * IndexedDB). Returns true once confirmed, false if the exam time is over
     * or the session is no longer active.
     */
    const forceSyncAllAnswers = async () => {
      if (saveInFlightRef.current) { try { await saveInFlightRef.current; } catch { /* resent below */ } }
      let serverErrors = 0;
      while (!isSubmittedRef.current) {
        if (timeLeftMs() <= 0) return false;
        if (navigator.onLine === false) {
          setViolationPhase("waiting-network");
          await wait(VIOLATION_SYNC_RETRY_MS);
          continue;
        }
        setViolationPhase("saving");
        const qs = questionsRef.current.length ? questionsRef.current : questions;
        const sent = {};
        const allAnswers = qs.map(q => {
          const value = answersRef.current[q.id] ?? null;
          sent[q.id] = value;
          return { questionId: q.id, selectedOptionIndex: value, timeSpentInSeconds: 0 };
        });
        try {
          const token = localStorage.getItem("studentToken");
          const res = await api.post("/student/exam/save-progress", {
            answers: allAnswers,
            currentQuestionIndex: currentPageRef.current * Qs_PER_PAGE,
            clientSequence: ++syncSequenceRef.current,
          }, { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 });

          const data = res?.data || {};
          if (Number.isFinite(Number(data.stateVersion))) {
            syncSequenceRef.current = Math.max(syncSequenceRef.current, Number(data.stateVersion));
          }
          if (data.answers && typeof data.answers === "object") {
            const confirmed = qs.every(q => (sent[q.id] ?? null) === (data.answers[q.id] ?? null));
            if (!confirmed) { await wait(300); continue; }   // ignored as old -> resend with newer sequence
          }

          // Confirmed by the server: these values are now the synced copy.
          qs.forEach(q => {
            const value = sent[q.id];
            if (value === null) delete syncedAnswersRef.current[q.id];
            else syncedAnswersRef.current[q.id] = value;
          });
          syncQueueRef.current.clear();
          setSyncStatus("saved");
          setNetworkStatus("connected");
          await persistLocal();
          return true;
        } catch (err) {
          const status = err.response?.status;
          if (status === 401 || status === 403) return false;          // session no longer active
          if (err.response && ++serverErrors >= 5) return false;       // repeated server error: stop retrying
          setSyncStatus("offline");
          setNetworkStatus(navigator.onLine === false ? "offline" : "slow");
          await persistLocal();
          await wait(VIOLATION_SYNC_RETRY_MS);
        }
      }
      return false;
    };

    /*
     * Tab-switch / blur / fullscreen-exit violation flow (1st, 2nd and 3rd):
     *   1. Freeze answer input and navigation.
     *   2. Force-sync the latest local answers to the server (Redis).
     *   3. Wait for the server's confirmation.
     *   4. ONLY THEN report the violation. The server starts the 5-minute
     *      restriction (1st/2nd) or finalizes the exam (3rd) at this point,
     *      so the restriction timer can never start before the sync finished.
     *   5. Show the existing restriction (login) screen or the submitted screen.
     */
    const handleViolation = async () => {
      // Not counted in the final 10 seconds: the exam is already being submitted.
      if (isSubmittedRef.current || submittingRef.current || fsTransitionRef.current || violationInFlightRef.current || finalStartedRef.current) return;
      violationInFlightRef.current = true;
      freeze(true);                                   // 1. freeze
      await persistLocal();
      try {
        await forceSyncAllAnswers();                  // 2 + 3. sync and wait for confirmation

        if (isSubmittedRef.current || timeLeftMs() <= 0 || finalStartedRef.current) {
          // Exam already finished / time is up: the normal deadline flow takes over.
          violationInFlightRef.current = false;
          freeze(false);
          return;
        }

        // 4. Report the violation (still carries the full answer state as a safety copy).
        const violationPayload = {
          answers: (questionsRef.current.length ? questionsRef.current : questions).map(q => ({
            questionId: q.id,
            selectedOptionIndex: answersRef.current[q.id] ?? null,
            timeSpentInSeconds: 0,
          })),
          currentQuestionIndex: currentPageRef.current * Qs_PER_PAGE,
          clientSequence: ++syncSequenceRef.current,
        };
        const token = localStorage.getItem("studentToken");
        let res = null;
        for (let attempt = 1; attempt <= 3 && !res; attempt++) {
          try {
            lastViolationSentAtRef.current = Date.now();
            res = await api.post("/student/exam/violation", violationPayload, {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 10000,
            });
          } catch (err) {
            if (err.response) throw err;              // server answered with an error: stop
            await wait(1000 * attempt);               // network hiccup: retry
          }
        }
        if (!res) throw new Error("Violation could not be reported");

        await persistLocal();

        const status = res.data?.status;
        const count = res.data?.violationCount ?? violations + 1;
        setViolations(count);

        // Reset after every reported violation, so the next tab switch is detected too.
        violationInFlightRef.current = false;

        // 5a. 3rd violation: exam finalized on the server -> submitted screen.
        if (status === "TERMINATED" || status === "COMPLETED" || res.data?.submitted === true) {
          isSubmittedRef.current = true;
          setAccessStatus("COMPLETED");
          try { await deleteExamSession(storageKeyRef.current); } catch {}
          navigate("/student/result", { replace: true });
          return;
        }

        // 5b. 1st / 2nd violation: existing 5-minute restriction (login) screen.
        if (status === "RESTRICTED") {
          setAccessStatus("RESTRICTED");
          setRestrictionUntil(res.data?.restrictionUntil || null);
          if (res.data?.restrictionUntil) localStorage.setItem("examRestrictionUntil", res.data.restrictionUntil);
          await persistLocal();
          localStorage.removeItem("studentToken");
          navigate("/student/login", { replace: true });
          return;
        }

        // Not counted by the server: continue the exam.
        freeze(false);
      } catch {
        violationInFlightRef.current = false;
        freeze(false);
        /*
         * Keep all local answers and do not mark them as synced. A violation
         * must never cause the latest answers to be silently discarded. A
         * later reconnect/queued sync can send them.
         */
        await persistLocal();
      }
    };
    const onVisChange = () => { if (document.hidden) void handleViolation(); };
    const onBlur = () => { void handleViolation(); };
    document.addEventListener("visibilitychange", onVisChange);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisChange);
      window.removeEventListener("blur", onBlur);
    };
  }, [fsPrompt, loading, navigate, page, persistLocal, questions, submitExam, violations, flushAllDirty]);
  /* ─────────────────────────────────────────────────────────────────────
     FULLSCREEN exit → examination-policy violation
     BUG FIX (see file header): this handler now checks fsTransitionRef,
     same guard the blur/tab-switch handler already had. Previously it
     didn't, so a fullscreenchange event during the entry transition
     could trigger a false auto-submit. The real violation path (student
     genuinely exits fullscreen mid-exam) is completely unchanged.
  ───────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (fsPrompt || loading) return;
    const onFsChange = () => {
      if (!document.fullscreenElement && !isSubmittedRef.current && !fsTransitionRef.current && !finalStartedRef.current) { window.dispatchEvent(new Event("blur")); }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [fsPrompt, loading, submitExam]);

  /* ─────────────────────────────────────────────────────────────────────
     LAPTOP KEYBOARD + TOUCHPAD LOCK (only while the exam is on screen)
     - Every key except Escape is ignored (Esc still exits fullscreen).
     - Chrome/Edge: system keys (Alt+Tab, Windows key, Ctrl+T/W/N, F5 ...)
       are captured with the Keyboard Lock API so they reach this page.
     - Two-finger swipe back/forward, mouse back/forward buttons and the
       browser Back action are blocked; pinch / Ctrl+wheel zoom is blocked.
     - Scrolling, clicking and selecting options keep working.
  ───────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (fsPrompt || loading) return;

    const html = document.documentElement;
    const body = document.body;
    const previous = { html: html.style.overscrollBehaviorX, body: body.style.overscrollBehaviorX };
    html.style.overscrollBehaviorX = "none";   // extra guard against two-finger swipe back/forward
    body.style.overscrollBehaviorX = "none";

    const blockKey = (e) => {
      if (e.key === "Escape" || e.code === "Escape") return;   // Esc keeps working
      e.preventDefault();
      e.stopPropagation();
    };
    const blockEvent = (e) => e.preventDefault();
    const blockZoom = (e) => {
      if (e.ctrlKey) { e.preventDefault(); return; }                          // pinch / Ctrl+wheel zoom
      // Two-finger left/right swipe arrives as horizontal wheel scrolling;
      // cancelling it stops Chrome's swipe Back/Forward. Up/down scroll still works.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
    };
    const blockMouseNav = (e) => {                                            // mouse back/forward buttons
      if (e.button === 3 || e.button === 4) { e.preventDefault(); e.stopPropagation(); }
    };

    window.addEventListener("keydown", blockKey, true);
    window.addEventListener("keyup", blockKey, true);
    window.addEventListener("keypress", blockKey, true);
    document.addEventListener("contextmenu", blockEvent, true);
    document.addEventListener("copy", blockEvent, true);
    document.addEventListener("cut", blockEvent, true);
    document.addEventListener("paste", blockEvent, true);
    document.addEventListener("dragstart", blockEvent, true);
    window.addEventListener("wheel", blockZoom, { passive: false, capture: true });
    window.addEventListener("mousedown", blockMouseNav, true);
    window.addEventListener("mouseup", blockMouseNav, true);
    window.addEventListener("auxclick", blockMouseNav, true);

    // Browser Back (gesture or button) stays on the exam page: the extra history
    // entry is added in the fullscreen click (Chrome skips entries added without
    // a click); every Back lands on it and it is added again immediately.
    const onPopState = () => window.history.pushState(window.history.state, "", window.location.href);
    window.addEventListener("popstate", onPopState);

    /* Leaving the exam PAGE itself (back gesture / back button that still gets
       through, closing the tab). Laptops only - phones are intentionally untouched. */
    const isLaptop = typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;
    const examActive = () => !isSubmittedRef.current && !submittingRef.current && !finalStartedRef.current;

    // 1. Ask first: Chrome shows "Leave site?" so an accidental gesture can be cancelled.
    const onBeforeUnload = (e) => {
      if (!examActive()) return;
      e.preventDefault();
      e.returnValue = "";
    };

    // 2. Left anyway: report the violation WITH all latest answers. keepalive lets the
    //    request finish after the page is gone; the server stores the answers first and
    //    then records the violation, so the 5-minute restriction applies on return.
    const onPageHide = () => {
      if (!examActive()) return;
      if (Date.now() - lastViolationSentAtRef.current < 5000) return;   // in-page flow already reported it
      const token = localStorage.getItem("studentToken");
      const qs = questionsRef.current;
      if (!token || !qs.length) return;
      lastViolationSentAtRef.current = Date.now();
      const body = JSON.stringify({
        answers: qs.map(q => ({ questionId: q.id, selectedOptionIndex: answersRef.current[q.id] ?? null, timeSpentInSeconds: 0 })),
        currentQuestionIndex: currentPageRef.current * Qs_PER_PAGE,
        clientSequence: ++syncSequenceRef.current,
      });
      try {
        fetch("/api/student/exam/violation", {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body,
        });
      } catch { /* nothing more can be done while the page is closing */ }
      void persistLocal();
    };

    if (isLaptop) {
      window.addEventListener("beforeunload", onBeforeUnload);
      window.addEventListener("pagehide", onPageHide);
    }

    // Capture system keys now, and again whenever fullscreen is re-entered.
    let disposed = false;
    const applyLock = async () => {
      const result = await lockExamKeyboard();
      if (!disposed) setKeyboardLock(result);
    };
    const onFullscreenChange = () => {
      if (document.fullscreenElement) void applyLock();
      else setKeyboardLock({ ok: false, reason: "not in fullscreen" });   // the browser releases the lock when fullscreen ends
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      window.removeEventListener("keydown", blockKey, true);
      window.removeEventListener("keyup", blockKey, true);
      window.removeEventListener("keypress", blockKey, true);
      document.removeEventListener("contextmenu", blockEvent, true);
      document.removeEventListener("copy", blockEvent, true);
      document.removeEventListener("cut", blockEvent, true);
      document.removeEventListener("paste", blockEvent, true);
      document.removeEventListener("dragstart", blockEvent, true);
      window.removeEventListener("wheel", blockZoom, { capture: true });
      window.removeEventListener("mousedown", blockMouseNav, true);
      window.removeEventListener("mouseup", blockMouseNav, true);
      window.removeEventListener("auxclick", blockMouseNav, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      disposed = true;
      unlockExamKeyboard();
      html.style.overscrollBehaviorX = previous.html;
      body.style.overscrollBehaviorX = previous.body;
    };
  }, [fsPrompt, loading]);

  /* ─────────────────────────────────────────────────────────────────────
     LOAD EXAM
  ───────────────────────────────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem("studentToken");
        if (!token) { navigate("/student/login"); return; }
        let storedStudentId = Number(localStorage.getItem("studentId")) || null;
        let storedExamId = Number(localStorage.getItem("examId")) || null;
        const possibleStorageKey = storedStudentId && storedExamId ? `exam:${storedExamId}:student:${storedStudentId}` : null;
        const localBeforeServer = possibleStorageKey ? await loadExamSession(possibleStorageKey) : null;
        if (!storedStudentId || !storedExamId) {
          try {
            const me = await api.get("/student/auth/me", { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 });
            storedStudentId = Number(me.data?.id) || storedStudentId;
            storedExamId = Number(me.data?.examId) || storedExamId;
            if (storedStudentId) localStorage.setItem("studentId", String(storedStudentId));
            if (storedExamId) localStorage.setItem("examId", String(storedExamId));
          } catch { }
        }
        const res = await api.get("/student/exam", { headers: { Authorization: `Bearer ${token}` } });
        const { questions: qs, currentQuestionIndex, serverNow, slotEndTime, accessStatus: serverStatus, restrictionUntil: serverRestriction } = res.data;
        examIdRef.current = storedExamId;
        studentIdRef.current = storedStudentId;
        storageKeyRef.current = examIdRef.current && studentIdRef.current ? `exam:${examIdRef.current}:student:${studentIdRef.current}` : null;
        const serverAnswers = {};
        qs.forEach(q => { if (q.selectedOptionIndex !== null && q.selectedOptionIndex !== undefined) serverAnswers[q.id] = q.selectedOptionIndex; });
        let restored = { ...serverAnswers };
        let synced = { ...serverAnswers };
        const local = storageKeyRef.current ? await loadExamSession(storageKeyRef.current) : null;
        if (local && local.examId === examIdRef.current) {
          restored = { ...serverAnswers, ...(local.answers || {}) };
          synced = { ...serverAnswers, ...(local.syncedAnswers || {}) };
          syncSequenceRef.current = Number(local.sequence || 0);
        }
        answersRef.current = restored;
        syncedAnswersRef.current = synced;
        questionsRef.current = qs;
        setAnswers(restored);
        setQuestions(qs);
        setViolations(res.data.tabSwitchViolations || 0);
        setAccessStatus(serverStatus || "READY");
        setRestrictionUntil(serverRestriction || null);

        if (slotEndTime) {
          const serverNowMs = serverNow ? new Date(serverNow).getTime() : Date.now();
          const slotEndMs = new Date(slotEndTime).getTime();
          clockDriftMsRef.current = Date.now() - serverNowMs;
          slotEndMsRef.current = slotEndMs;
          localStorage.setItem(LS_SLOT_END_KEY, slotEndTime);
          setRemainingMs(Math.max(0, slotEndMs - (Date.now() - clockDriftMsRef.current)));
        }
        const resumeIdx = currentQuestionIndex ?? 0;
        const resumePage = Math.floor(resumeIdx / Qs_PER_PAGE);
        currentPageRef.current = resumePage;
        setPage(resumePage);
        await persistLocal();
        setLoading(false);
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem("studentToken");
          navigate("/student/login");
          return;
        }
        // Redis/backend may be temporarily unreachable at a college. If a
        // complete local exam paper exists, recover the visible exam from
        // IndexedDB and keep retrying synchronization in the background.
        // (Read again here: the values from the try-block are not visible in catch.)
        const storedStudentId = Number(localStorage.getItem("studentId")) || null;
        const storedExamId = Number(localStorage.getItem("examId")) || null;
        const possibleStorageKey = storedStudentId && storedExamId ? `exam:${storedExamId}:student:${storedStudentId}` : null;
        const localBeforeServer = possibleStorageKey ? await loadExamSession(possibleStorageKey) : null;
        if (localBeforeServer?.questions?.length) {
          const localQuestions = localBeforeServer.questions;
          const localAnswers = localBeforeServer.answers || {};
          const localSynced = localBeforeServer.syncedAnswers || {};
          examIdRef.current = storedExamId;
          studentIdRef.current = storedStudentId;
          storageKeyRef.current = possibleStorageKey;
          answersRef.current = localAnswers;
          syncedAnswersRef.current = localSynced;
          questionsRef.current = localQuestions;
          syncSequenceRef.current = Number(localBeforeServer.sequence || 0);
          setQuestions(localQuestions);
          setAnswers(localAnswers);
          setAccessStatus("ACTIVE");
          if (localBeforeServer.slotEndTime) {
            const endMs = new Date(localBeforeServer.slotEndTime).getTime();
            slotEndMsRef.current = endMs;
            localStorage.setItem(LS_SLOT_END_KEY, localBeforeServer.slotEndTime);
            setRemainingMs(Math.max(0, endMs - Date.now()));
          }
          const resumePage = Math.floor((localBeforeServer.currentQuestionIndex || 0) / Qs_PER_PAGE);
          currentPageRef.current = resumePage;
          setPage(resumePage);
          setLoading(false);
          return;
        }
        setError(err.response?.data?.message || "Exam service is temporarily unavailable. Please retry.");
        setLoading(false);
      }
    })();
  }, [navigate, persistLocal]);
  /* 10-second countdown + submission are driven by the exam timer (startFinalSubmission). */

  /* ─────────────────────────────────────────────────────────────────────
     FULLSCREEN ENTRY
  ───────────────────────────────────────────────────────────────────── */
  const enterFullscreen = async () => {
    try {
      fsTransitionRef.current = true;
      await document.documentElement.requestFullscreen();
      // Back-protection entry, created inside the click so Chrome does not skip it.
      window.history.pushState(window.history.state, "", window.location.href);
      // Same as Chrome's demo: ask for the keyboard lock inside the click itself.
      const lockResult = await lockExamKeyboard();
      setKeyboardLock(lockResult);
      console.info("[exam] keyboard lock:", lockResult);
      setTimeout(() => { fsTransitionRef.current = false; }, FS_TRANSITION_MS);
      setFsPrompt(false);
      startExamFlow();
    } catch {
      fsTransitionRef.current = false;
      alert("Unable to enter fullscreen. Please allow fullscreen permissions and try again.");
    }
  };

  /* ─────────────────────────────────────────────────────────────────────
     ANSWER SELECTION
  ───────────────────────────────────────────────────────────────────── */
  const selectOption = (questionId, optionIdx) => {
    if (locked || violationFrozenRef.current) return;   // frozen during a violation sync
    if ((answersRef.current[questionId] ?? null) === (optionIdx ?? null)) return;   // same option again: no work
    answersRef.current = { ...answersRef.current, [questionId]: optionIdx };
    setAnswers(answersRef.current);
    void persistLocal();
    if (currentPageRef.current >= totalPages - 1) {
      // Last page: students often do not navigate again, so save automatically.
      setSyncStatus("saving");
      scheduleAnswerSync();
    } else {
      // Other pages: kept in the browser; sent when the student clicks Next / Previous.
      setSyncStatus("pending");
    }
  };

  /* ─────────────────────────────────────────────────────────────────────
     PAGE NAVIGATION — dirty-page synchronization
  ───────────────────────────────────────────────────────────────────── */
  const goToPage = async (targetPage) => {
    if (violationFrozenRef.current || finalStartedRef.current) return;   // frozen / final submission running
    if (navigatingRef.current) return;                   // ignore double clicks while saving
    if (targetPage < 0 || targetPage >= totalPages) return;
    // Send unsaved answers (any page), WAIT for the server's confirmation, THEN change page.
    if (anyDirty()) {
      navigatingRef.current = true;
      try {
        await Promise.race([
          runQueuedSync(),
          new Promise(r => setTimeout(r, NAV_SYNC_MAX_WAIT_MS)),   // never stuck (e.g. no internet)
        ]);
      } finally {
        navigatingRef.current = false;
      }
      if (violationFrozenRef.current || finalStartedRef.current) return;   // a violation / final submit began meanwhile
    }
    currentPageRef.current = targetPage;
    setPage(targetPage);
    setMobileNavigatorExpanded(true);
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
    if (violationFrozenRef.current || finalStartedRef.current) return;   // frozen / final submission running
    await flushAllDirty();
    await submitExam(false);
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

  if (accessStatus === "TERMINATED") return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center" style={{ background: "var(--eb-bg)" }}>
      <div className="eb-card max-w-md">
        <Icons.Lock />
        <h2 className="text-lg font-bold mt-3" style={{ color: "var(--eb-text)" }}>Examination access terminated</h2>
        <p className="text-sm mt-2" style={{ color: "var(--eb-text-muted)" }}>Your examination access has been stopped due to repeated examination-policy violations. Please contact the examination administrator.</p>
      </div>
    </div>
  );

  if (accessStatus === "RESTRICTED") return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center" style={{ background: "var(--eb-bg)" }}>
      <div className="eb-card max-w-md">
        <Icons.Lock />
        <h2 className="text-lg font-bold mt-3" style={{ color: "var(--eb-text)" }}>Examination access temporarily restricted</h2>
        <p className="text-sm mt-2" style={{ color: "var(--eb-text-muted)" }}>Please wait until the restriction period ends.</p>
      </div>
    </div>
  );

  if (fsPrompt) return <FullscreenGateway onEnter={enterFullscreen} />;

  // Exam ended for the student (server finishes it from the saved answers).
  if (finalPhase === "done") return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative" style={{ background: "var(--eb-bg)" }}>
      <div className="absolute top-4 right-4"><ThemeToggle /></div>
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5" style={{ background: "var(--eb-success-soft)", color: "var(--eb-success)" }}>
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
      </div>
      <h1 className="text-xl font-bold" style={{ color: "var(--eb-text)" }}>Your exam has been submitted successfully.</h1>
      <p className="text-sm mt-2 max-w-sm" style={{ color: "var(--eb-text-muted)" }}>The exam has ended. You can close this window now.</p>
    </div>
  );

  if (submitting) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "var(--eb-bg)" }}>
      {submitError ? (
        <>
          <svg className="w-10 h-10 mb-4" fill="none" viewBox="0 0 24 24" stroke="var(--eb-danger)" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm max-w-sm mb-5" style={{ color: "var(--eb-text)" }}>{submitError}</p>
          <button
            onClick={() => { setSubmitting(false); setSubmitError(null); submitExam(lastAutoRef.current); }}
            className="eb-btn !w-auto !py-2.5 !px-6 text-sm">
            Retry Submission
          </button>
        </>
      ) : (
        <>
          <span className="spinner w-10 h-10 border-4 mb-4" />
          <p className="text-sm" style={{ color: "var(--eb-text-muted)" }}>Submitting your exam…</p>
        </>
      )}
    </div>
  );

  /* ─────────────────────────────────────────────────────────────────────
     MAIN EXAM RENDER
  ───────────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex flex-col select-none" style={{ background: "var(--eb-bg)" }}>

      {showWarning && <TimerWarningOverlay secondsLeft={warnSecs} />}
      {violationPhase && !showWarning && <ViolationSyncOverlay waitingForNetwork={violationPhase === "waiting-network"} />}

      {/* ── Exam header ────────────────────────────────────────────────
          Desktop stays one compact row. Mobile uses two short rows so the
          timer, network/battery/sync indicators and profile never overlap. */}
      <header className="sticky top-0 z-30 border-b"
        style={{ background: "var(--eb-surface)", borderColor: "var(--eb-border)", backdropFilter: "blur(8px)" }}>

        <div className="hidden sm:flex items-center justify-between gap-3 px-4 sm:px-6 py-2">
          <div className="flex items-center gap-2.5 flex-shrink-0 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-1.5 rounded-lg" style={{ color: "var(--eb-text-muted)" }} aria-label="Open sections">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <img src="/logo.png" alt="EchoBrains" className="h-6 w-auto" draggable={false} />
            <div className="hidden md:flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
              style={{ background: "rgba(249,115,22,0.1)", color: "var(--eb-orange)" }}
              title="Switching tabs or exiting fullscreen triggers examination-policy access control.">
              <Icons.Shield /> Protected Mode
            </div>
            {keyboardLock && (
              keyboardLock.ok ? (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
                  style={{ background: "var(--eb-success-soft)", color: "var(--eb-success)" }}
                  title="Keyboard shortcuts are disabled during the exam. Press and hold Esc to exit fullscreen.">
                  Keys locked
                </div>
              ) : (
                /* TEMPORARY diagnostic - remove after testing */
                <div className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
                  style={{ background: "var(--eb-warning-soft)", color: "var(--eb-warning)" }}>
                  Keys NOT locked: {keyboardLock.reason}
                </div>
              )
            )}
          </div>

          <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-bold tabular-nums transition-colors duration-500 ${globalWarning ? "animate-pulse" : ""}`}
            style={{
              background: globalWarning ? "rgba(248,113,113,0.15)" : "rgba(6,182,212,0.08)",
              border: `1px solid ${globalWarning ? "rgba(248,113,113,0.4)" : "rgba(6,182,212,0.25)"}`,
              color: globalWarning ? "#EF4444" : "#0891B2",
            }}>
            <Icons.Clock /> {remainingMs !== null ? fmtMs(remainingMs) : "--:--:--"}
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            <span className="inline-flex items-center gap-1 text-xs sm:text-sm font-semibold" title="Browser-to-exam connection status" style={{ color: networkStatus === "offline" ? "#DC2626" : networkStatus === "slow" ? "#D97706" : "#16A34A" }}>
              <span className="tracking-[2px]">{networkStatus === "offline" ? "●○○○" : networkStatus === "slow" ? "●●○○" : "●●●●"}</span>
              <span>{networkStatus === "offline" ? "Offline" : networkStatus === "slow" ? "Slow" : "Connected"}</span>
            </span>
            {batteryLevel !== null && <span className="text-xs sm:text-sm font-semibold" style={{ color: "var(--eb-text-muted)" }}>🔋 {batteryLevel}%</span>}
            <span className="text-sm font-semibold" style={{ color: syncStatus === "offline" ? "#DC2626" : (syncStatus === "saving" || syncStatus === "pending") ? "#D97706" : "#16A34A" }}>
              {syncStatus === "offline" ? "⚠ Offline" : syncStatus === "saving" ? "↻ Saving..." : syncStatus === "pending" ? "● Saves on Next" : "✓ Saved"}
            </span>
            <span className="hidden lg:inline text-xs" style={{ color: "var(--eb-text-muted)" }}>{answeredCount}/{questions.length}</span>
            {manualSubmitAvailable && (
              <button
                onClick={handleManualSubmit}
                disabled={inputLocked || submitting}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff" }}
              >
                Submit
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </button>
            )}
            <ThemeToggle />
            <ProfilePopup profile={profile} />
          </div>
        </div>

        <div className="sm:hidden px-3 py-2 space-y-2">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg flex-shrink-0" style={{ color: "var(--eb-text-muted)" }} aria-label="Open sections">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <img src="/logo.png" alt="EchoBrains" className="h-5 w-auto max-w-[110px]" draggable={false} />
            </div>

            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-bold tabular-nums flex-shrink-0 ${globalWarning ? "animate-pulse" : ""}`}
              style={{
                background: globalWarning ? "rgba(248,113,113,0.15)" : "rgba(6,182,212,0.08)",
                border: `1px solid ${globalWarning ? "rgba(248,113,113,0.4)" : "rgba(6,182,212,0.25)"}`,
                color: globalWarning ? "#EF4444" : "#0891B2",
              }}>
              <Icons.Clock /> {remainingMs !== null ? fmtMs(remainingMs) : "--:--:--"}
            </div>

            <ProfilePopup profile={profile} />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1 min-w-0" style={{ color: networkStatus === "offline" ? "#DC2626" : networkStatus === "slow" ? "#D97706" : "#16A34A" }}>
              <span className="tracking-[1.5px] text-sm">{networkStatus === "offline" ? "●○○○" : networkStatus === "slow" ? "●●○○" : "●●●●"}</span>
              <span>{networkStatus === "offline" ? "Offline" : networkStatus === "slow" ? "Slow" : "Connected"}</span>
            </span>
            {batteryLevel !== null && <span className="text-sm" style={{ color: "var(--eb-text-muted)" }}>🔋 {batteryLevel}%</span>}
           <span
  className="text-sm"
  style={{
    color: syncStatus === "offline"
      ? "#DC2626"
      : (syncStatus === "saving" || syncStatus === "pending")
        ? "#D97706"
        : "#16A34A"
  }}
>
              {syncStatus === "offline" ? "⚠ Offline" : syncStatus === "saving" ? "↻ Saving..." : syncStatus === "pending" ? "● Saves on Next" : "✓ Saved"}
            </span>
            {manualSubmitAvailable && (
              <button
                onClick={handleManualSubmit}
                disabled={inputLocked || submitting}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff" }}
              >
                Submit
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              </button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

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
              <>
                {/* Desktop / tablet: existing full navigator. */}
                <div
                  className="hidden sm:block sticky top-[74px] z-20 rounded-2xl p-4 border"
                  style={{
                    background: "var(--eb-surface)",
                    borderColor: "var(--eb-border)"
                  }}
                >
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

                {/* Mobile: full navigator at the top, compact bar while scrolling. */}
                <div
                  className="sm:hidden sticky top-[96px] z-20 rounded-2xl border overflow-hidden"
                  style={{
                    background: "var(--eb-surface)",
                    borderColor: "var(--eb-border)"
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setMobileNavigatorExpanded(v => !v)}
                    className="w-full flex items-center justify-between gap-3 px-3.5 py-3 text-left"
                    style={{ color: "var(--eb-text)" }}
                    aria-expanded={mobileNavigatorExpanded}
                    aria-label={mobileNavigatorExpanded ? "Collapse question navigator" : "Expand question navigator"}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: activeStyle.color }}
                      />
                      <span className="text-sm font-semibold truncate" style={{ color: activeStyle.color }}>
                        {activeStyle.label}
                      </span>
                      <span className="text-xs font-mono flex-shrink-0" style={{ color: "var(--eb-text-faint)" }}>
                        {activeCategory.answeredCount}/{activeCategory.questions.length}
                      </span>
                    </div>
                    <span
                      className="flex items-center gap-1 text-xs font-semibold flex-shrink-0"
                      style={{ color: "var(--eb-text-muted)" }}
                    >
                      Questions
                      <svg
                        className={`w-4 h-4 transition-transform duration-200 ${mobileNavigatorExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </button>

                  {mobileNavigatorExpanded && (
                    <div
                      className="px-3.5 pb-3.5 pt-1 border-t"
                      style={{ borderColor: "var(--eb-border)" }}
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[11px]" style={{ color: "var(--eb-text-faint)" }}>
                          Tap a number to jump to that question page
                        </span>
                        <span className="text-[11px] font-mono" style={{ color: "var(--eb-text-faint)" }}>
                          {activeCategory.answeredCount}/{activeCategory.questions.length} answered
                        </span>
                      </div>
                      <QuestionStrip
                        questionsInCategory={activeCategory.questions}
                        currentPageQuestionIds={currentPageQuestionIds}
                        answers={answers}
                        onJump={goToQuestionIndex}
                      />
                    </div>
                  )}
                </div>
              </>
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
              locked={inputLocked}
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

            <div className="flex items-center gap-2">
              <button onClick={() => goToPage(page + 1)} disabled={page === totalPages - 1 || locked}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.01] disabled:opacity-30"
                style={{ background: "linear-gradient(135deg, #F97316, #EA580C)", color: "#fff" }}>
                Next
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>

            </div>          </div>

          <div className="flex items-center justify-between text-xs pb-4" style={{ color: "var(--eb-text-faint)" }}>
            <span>{answeredCount} answered · {questions.length - answeredCount} remaining</span>
            {!manualSubmitAvailable && (
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
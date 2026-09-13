/**
 * ResultPage.jsx – Post-exam confirmation screen
 *
 * Scores are NOT shown to the student.
 * Neutral confirmation: "Your exam has been successfully recorded.
 * Results will be processed by your system coordinator."
 */

import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ThemeToggle from "./shared/ThemeToggle.jsx";

export default function ResultPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // Clear all exam session data — scores are intentionally not displayed
    localStorage.removeItem("studentToken");
    localStorage.removeItem("examScores");
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative"
      style={{ background: "var(--eb-bg)" }}>

      <div className="absolute top-4 right-4 z-10"><ThemeToggle /></div>

      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full opacity-[0.05]"
          style={{ background: "radial-gradient(circle, #10B981 0%, transparent 70%)" }} />
      </div>

      <div className="relative w-full max-w-lg mx-auto">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src="/logo.png" alt="EchoBrains" className="h-10 w-auto logo-pulse" draggable={false} />
        </div>

        <div className="eb-card space-y-7" style={{ borderColor: "rgba(16,185,129,0.25)" }}>

          {/* Success icon */}
          <div className="flex flex-col items-center text-center">
            <div className="success-pop flex items-center justify-center w-20 h-20 rounded-full mb-5"
              style={{ background: "rgba(16,185,129,0.08)", border: "2px solid rgba(16,185,129,0.3)" }}>
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="#10B981" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--eb-text)" }}>Exam Submitted!</h1>
          </div>

          {/* Neutral confirmation — no scores shown */}
          <div className="p-5 rounded-2xl text-center space-y-2"
            style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)" }}>
            <p className="text-base font-semibold leading-snug" style={{ color: "var(--eb-text)" }}>
              Your exam has been successfully recorded.
            </p>
            <p className="text-sm" style={{ color: "var(--eb-text-muted)" }}>
              Results will be processed by your system coordinator.
            </p>
          </div>

          {/* Info messages */}
          <div className="space-y-3">
            <div className="p-4 rounded-xl"
              style={{ background: "var(--eb-blue-soft)", border: "1px solid rgba(15,98,254,0.2)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "var(--eb-blue)" }}>
                📋 Your responses have been securely recorded and will be reviewed by the
                EchoBrains team. Results will be shared with your college SPOC within the
                stipulated time frame.
              </p>
            </div>
            <div className="p-4 rounded-xl"
              style={{ background: "var(--eb-warning-soft)", border: "1px solid rgba(217,119,6,0.2)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "var(--eb-warning)" }}>
                ⏳ Shortlisted candidates will be notified via email. Please check your
                inbox (and spam folder) regularly.
              </p>
            </div>
            <div className="p-4 rounded-xl"
              style={{ background: "var(--eb-surface-muted)", border: "1px solid var(--eb-border)" }}>
              <p className="text-xs leading-relaxed" style={{ color: "var(--eb-text-muted)" }}>
                🔒 This session has been securely closed. You may now safely close this window.
              </p>
            </div>
          </div>

          {/* Back to home */}
          <button onClick={() => navigate("/")} className="eb-btn-outline w-full">
            ← Back to Home
          </button>

        </div>
      </div>
    </div>
  );
}

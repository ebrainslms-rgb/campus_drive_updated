import React from "react";
import { authPromoHighlights } from "../../content/promoContent";
import ThemeToggle from "../shared/ThemeToggle.jsx";

/**
 * Two-column layout shared by the Login and Register screens: a branded
 * promo panel on the left (desktop), the form on the right. Stacks
 * vertically on mobile instead of squeezing the desktop layout down.
 *
 * `wide` widens the right column for the multi-field registration form.
 */
export default function AuthLayout({ children, wide = false }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: "var(--eb-bg)" }}>

      {/* ── Left: branding / promo panel — hidden on mobile ─────────────── */}
      <div
        className="hidden lg:flex lg:w-[42%] xl:w-[38%] flex-col justify-between p-12 text-white"
        style={{ background: "linear-gradient(160deg, var(--eb-blue) 0%, var(--eb-blue-dark) 100%)" }}
      >
        <div>
          <div className="flex items-center gap-3 mb-16">
            <img src="/logo.png" alt="EchoBrains" className="h-10 w-auto object-contain" draggable={false} />
          </div>

          <h1 className="text-3xl font-bold leading-tight mb-3">
            EchoBrains Examination Portal
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
            The official assessment platform for EchoBrains campus examination drives.
          </p>
        </div>

        <div className="space-y-6">
          {authPromoHighlights.map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.14)" }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.65)" }}>{item.description}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.45)" }}>
          © {new Date().getFullYear()} EchoBrains. All rights reserved.
        </p>
      </div>

      {/* ── Right: form column ──────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-4 py-10 sm:px-8 relative">
        {/* Theme toggle - the only place to change it before logging in;
            after login the same control lives in the profile drawer. */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
          <ThemeToggle />
        </div>

        <div className={`w-full ${wide ? "max-w-3xl" : "max-w-md"}`}>
          {/* Logo shown only on mobile, since the branded panel is hidden there */}
          <div className="flex lg:hidden items-center justify-center gap-3 mb-8 select-none">
            <img src="/logo.png" alt="EchoBrains Logo" className="h-10 w-auto object-contain" draggable={false} />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

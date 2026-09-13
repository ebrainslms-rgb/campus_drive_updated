import React from "react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--eb-bg)" }}>
      <div className="eb-card max-w-md text-center py-10">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: "var(--eb-surface-muted)" }}>
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="var(--eb-text-muted)" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-800">Page not found</h1>
        <p className="text-sm mt-2" style={{ color: "var(--eb-text-muted)" }}>
          The page you're looking for doesn't exist or has moved.
        </p>
        <Link to="/student/login" className="eb-btn mt-6 inline-flex w-auto px-6">
          Go to Student Login
        </Link>
      </div>
    </div>
  );
}

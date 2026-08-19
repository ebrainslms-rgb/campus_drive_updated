
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import { useStudentAuth } from "../context/StudentAuthContext";
import ProfileDrawer from "./shared/ProfileDrawer.jsx";
import CountdownTimer from "./shared/CountdownTimer.jsx";

const Icons = {
  Clock: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Document: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  Check: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  Arrow: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  ),
  Alert: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  Screen: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Shield: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  Ban: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
    </svg>
  ),
  Info: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Star: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  ),
  Target: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </svg>
  ),
  TrendUp: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  Users: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
};

/* ── Rule item — semantic type-based color only, numbered-icon-row style ── */
function RuleItem({ number, icon, title, description, type = "info" }) {
  const styles = {
    info:    { bg: "var(--eb-blue-soft)",    text: "var(--eb-blue)" },
    warning: { bg: "var(--eb-warning-soft)", text: "var(--eb-warning)" },
    danger:  { bg: "var(--eb-danger-soft)",  text: "var(--eb-danger)" },
    success: { bg: "var(--eb-success-soft)", text: "var(--eb-success)" },
  };
  const s = styles[type] || styles.info;
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: s.bg, color: s.text }}>
        {icon}
      </div>
      <div className="flex-1 pt-0.5">
        <h4 className="text-xs font-semibold" style={{ color: "var(--eb-text)" }}>
          {number}. {title}
        </h4>
        <p className="text-[11px] leading-snug mt-0.5" style={{ color: "var(--eb-text-muted)" }}>{description}</p>
      </div>
    </div>
  );
}

   function ImagePromoCarousel() {
  // Default images (existing behaviour, unchanged) - shown until the admin
  // uploads at least one poster via Profile -> Edit Exam Banners. Once
  // admin uploads are present, this switches to exactly those images (1
  // uploaded shows 1 slide, 4 uploaded shows 4 - never blank placeholders
  // for slots nobody filled in), fetched from the new public, unauthenticated
  // endpoint (plain <img> tags can't send an Authorization header).
  const DEFAULT_IMAGES = ["/poster1.png", "/poster3.jpeg", "/poster4.jpeg", "/poster5.jpeg"];
  const [images, setImages] = useState(DEFAULT_IMAGES);

  useEffect(() => {
    let cancelled = false;
    api.get("/admin/banners/public/active-posters")
      .then(res => {
        if (cancelled) return;
        const slots = Array.isArray(res.data?.slots) ? res.data.slots : [];
        if (slots.length > 0) {
          setImages(slots.map(slot => `/api/admin/banners/public/${slot}/image`));
        }
        // else: keep the DEFAULT_IMAGES already set above
      })
      .catch(() => { /* keep defaults on any failure */ });
    return () => { cancelled = true; };
  }, []);

  const [current, setCurrent] = useState(0);

  // If the image list length changes (e.g. defaults -> admin uploads with a
  // different count), make sure the current index can't point past the end.
  useEffect(() => { setCurrent(0); }, [images.length]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % images.length);
    }, 4000);

    return () => clearInterval(timer);
  }, [images.length]);

  return (
    <div
      className="relative overflow-hidden rounded-xl"
      style={{
        height: "100%",
        minHeight: "230px",
        background: "var(--eb-surface-muted)",
      }}
    >
      {images.map((image, index) => (
        <img
          key={image}
          src={image}
          alt={`EchoBrains promotion ${index + 1}`}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
          style={{
            opacity: current === index ? 1 : 0,
          }}
          draggable={false}
        />
      ))}

      {/* Dots */}
      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
        {images.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setCurrent(index)}
            className="rounded-full transition-all duration-300"
            style={{
              width: current === index ? "18px" : "6px",
              height: "6px",
              background:
                current === index
                  ? "var(--eb-blue)"
                  : "rgba(255,255,255,0.75)",
            }}
            aria-label={`Show promotion ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}


function BrandPanel() {
  // Tries the admin-uploaded hero image first (public, unauthenticated
  // endpoint); if the admin hasn't uploaded one yet, that request 404s and
  // onError swaps in the existing default file already shipped in
  // /public - exactly one fallback attempt, no extra round-trip needed to
  // check existence first.
  const [src, setSrc] = useState("/api/admin/banners/public/HERO/image");
  const [triedFallback, setTriedFallback] = useState(false);

  return (
    <aside
      className="hidden lg:flex lg:w-[430px] xl:w-[480px] flex-shrink-0 relative overflow-hidden border-r"
      style={{
        borderColor: "var(--eb-border)",
        backgroundColor: "var(--eb-surface)",
      }}
    >
      <img
        src={src}
        alt="EchoBrains"
        className="w-full h-full object-fill"
        draggable={false}
        onError={() => {
          if (!triedFallback) {
            setSrc("/outside-panel-rules.png");
            setTriedFallback(true);
          }
        }}
      />
    </aside>
  );
}

/* ── Already-submitted state ─────────────────────────────────────────── */
function AlreadySubmittedCard({ student, onLogout }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--eb-bg)" }}>
      <div className="eb-card max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "var(--eb-success-soft)" }}>
          <svg className="w-8 h-8" style={{ color: "var(--eb-success)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold" style={{ color: "var(--eb-text)" }}>Exam Already Submitted</h2>
        <p className="text-sm mt-2" style={{ color: "var(--eb-text-muted)" }}>
          Your examination has already been submitted. Thank you for participating.
        </p>
        <div className="mt-5 text-left space-y-2 rounded-xl p-4" style={{ background: "var(--eb-surface-muted)" }}>
          <Row label="Student" value={student.fullName} />
          <Row label="College" value={student.collegeName} />
          <Row label="Course" value={student.courseName} />
          <Row label="Status" value="Submitted" />
        </div>
        <button onClick={onLogout} className="eb-btn-outline mt-5">Logout</button>
      </div>
    </div>
  );
}
function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="grid gap-3 text-sm items-start" style={{ gridTemplateColumns: "108px 1fr" }}>
      <span className="flex-shrink-0" style={{ color: "var(--eb-text-faint)" }}>{label}</span>
      <span className="font-medium break-words" style={{ color: "var(--eb-text)" }}>{value}</span>
    </div>
  );
}

/* ── "Ready to start" modal, shown when the countdown hits zero ───────── */
function ExamReadyModal({ studentName, onContinue }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }}>
      <div className="eb-card max-w-sm text-center success-pop">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "var(--eb-success-soft)" }}>
          <svg className="w-8 h-8" style={{ color: "var(--eb-success)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--eb-text)" }}>Welcome, {studentName}</h2>
        <p className="text-sm mt-2" style={{ color: "var(--eb-text-muted)" }}>
          Your examination is ready to begin. Please review the rules below, agree to them, and start when you're ready.
        </p>
        <button onClick={onContinue} className="eb-btn mt-5">Continue <Icons.Arrow /></button>
      </div>
    </div>
  );
}

export default function RulesPage() {
  const navigate = useNavigate();
  const { logoutStudent } = useStudentAuth();
  const [agreed, setAgreed] = useState(false);
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [examReady, setExamReady] = useState(false);
  const [showReadyModal, setShowReadyModal] = useState(false);

  useEffect(() => {
    const fetchStudentInfo = async () => {
      const token = localStorage.getItem("studentToken");
      if (!token) { navigate("/student/login"); return; }
      try {
        const response = await api.get("/student/auth/me", { headers: { Authorization: `Bearer ${token}` } });
        setStudent(response.data);
        // Already-started-or-past-start-time: no waiting needed, treat as ready.
        if (response.data.examStartTime && new Date(response.data.serverNow) >= new Date(response.data.examStartTime)) {
          setExamReady(true);
        }
      } catch (error) {
        if (error.response?.status === 401 || error.response?.status === 403) {
          localStorage.removeItem("studentToken");
          navigate("/student/login");
          return;
        }
        setStudent({ fullName: "Student" });  
      } finally {
        setLoading(false);
      }
    };
    fetchStudentInfo();
  }, [navigate]);

  const handleCountdownComplete = useCallback(() => {
    setExamReady(true);
    setShowReadyModal(true);
  }, []);

  const handleStartExam = () => {
    if (!agreed || !examReady) return;
    navigate("/student/exam");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--eb-bg)" }}>
        <div className="spinner-dark" />
      </div>
    );
  }

  if (student.examSubmitted) {
    return <AlreadySubmittedCard student={student} onLogout={logoutStudent} />;
  }

  const durationMinutes = student.examStartTime && student.examEndTime
    ? Math.round((new Date(student.examEndTime) - new Date(student.examStartTime)) / 60000)
    : null;

  const examDetailRows = [
    { label: "Exam Name", value: `${student.courseName || ""} Assessment` },
    { label: "College", value: student.collegeName },
    { label: "Course", value: student.courseName },
    { label: "Duration", value: durationMinutes ? `${durationMinutes} Minutes` : null },
    { label: "Total Questions", value: student.totalQuestions != null ? `${student.totalQuestions}` : null },
    { label: "Exam Starts At", value: student.examStartTime ? new Date(student.examStartTime).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null },
  ];

  return (
    <div className="flex" style={{ background: "var(--eb-bg)", minHeight: "100vh" }}>
      <BrandPanel studentName={student.fullName} />

      {showReadyModal && (
        <ExamReadyModal studentName={student.fullName} onContinue={() => setShowReadyModal(false)} />
      )}

      <ProfileDrawer
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        title="Student Profile"
        roleLabel="Student"
        fields={[
          { label: "Full Name", value: student.fullName },
          { label: "Email", value: student.email },
          { label: "College", value: student.collegeName },
          { label: "Course", value: student.courseName },
          { label: "Domain / Branch", value: student.branch },
          { label: "Highest Qualification", value: student.highestQualification },
          { label: "Year of Passing", value: student.yearOfPassing },
        ]}
        onLogout={logoutStudent}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile-only logo, since the branded panel is hidden below lg */}
        <div className="flex lg:hidden items-center justify-between px-4 py-4 border-b"
          style={{ background: "var(--eb-surface)", borderColor: "var(--eb-border)" }}>
          <img src="/logo.png" alt="EchoBrains Logo" className="h-8 w-auto object-contain" draggable={false} />
        </div>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-6 space-y-4">
          {/* Header row — EchoBrains logo (left) / Welcome message (center) /
              profile trigger (right). Previously this row had no logo at
              all on desktop (branding lived only in the left BrandPanel);
              added here per request so it's visible right above the Exam
              Details card regardless of screen width. */}
         <div className="relative flex items-center min-h-[42px]">

  {/* Logo — left */}
  <img src="/logo.png" alt="EchoBrains" className="h-7 w-auto object-contain flex-shrink-0" draggable={false} />

  {/* Welcome message — center */}
  <div className="absolute left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
    <h1
      className="text-lg font-bold"
      style={{ color: "var(--eb-text)" }}
    >
      Welcome, {student.fullName} 👋
    </h1>
  </div>

  {/* Profile — right corner */}
  <button
    onClick={() => setProfileOpen(true)}
    className="ml-auto flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
    aria-label="Open profile menu"
  >
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs text-white flex-shrink-0"
      style={{ background: "var(--eb-blue)" }}
    >
      {(student.fullName || "S").charAt(0).toUpperCase()}
    </div>

    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="var(--eb-text-faint)"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 9l-7 7-7-7"
      />
    </svg>
  </button>

</div>

          {/* Three separate cards - Exam Details wide with aligned
              label/value rows (all values start at the same position,
              regardless of label length), a small/narrow countdown card
              since it doesn't need much room, and the blue Assessment
              Structure panel unchanged. */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_0.7fr_1.1fr] gap-5">
            <div className="eb-card !p-5" style={{ boxShadow: "0 1px 2px rgba(15,98,254,0.04), 0 10px 28px rgba(15,98,254,0.07)" }}>
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--eb-text)" }}>
                <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--eb-blue-soft)", color: "var(--eb-blue)" }}>
                  <Icons.Document />
                </span>
                Exam Details
              </h3>
              <div className="space-y-2.5">
                {examDetailRows.map((r, i) => <Row key={i} label={r.label} value={r.value} />)}
              </div>
            </div>

            <div className="eb-card !p-4 flex flex-col items-center justify-center">
              {student.examStartTime ? (
                <CountdownTimer serverNow={student.serverNow} targetTime={student.examStartTime} onComplete={handleCountdownComplete} size="sm" />
              ) : (
                <p className="text-xs text-center" style={{ color: "var(--eb-text-muted)" }}>Schedule not available.</p>
              )}
              {examReady && (
                <span className="eb-badge eb-badge-success mt-2 text-[10px]">All systems ready</span>
              )}
            </div>

            <ImagePromoCarousel />
          </div>

          {examReady && (
            <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "var(--eb-success-soft)", border: "1px solid rgba(5,150,105,0.25)" }}>
              <Icons.Check />
              <p className="text-sm font-medium" style={{ color: "var(--eb-success)" }}>
                Your exam is ready. Review the rules below and click Start Exam when you're ready.
              </p>
            </div>
          )}

          {/* Rules card */}
          <div className="eb-card !p-5 space-y-3.5">
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--eb-text)" }}>
              <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "var(--eb-blue-soft)", color: "var(--eb-blue)" }}>
                <Icons.Shield />
              </span>
              Exam Rules & Regulations
            </h3>

            <div className="rounded-xl p-3 border" style={{ background: "var(--eb-danger-soft)", borderColor: "rgba(220,38,38,0.3)" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span style={{ color: "var(--eb-danger)" }}><Icons.Alert /></span>
                <span className="text-xs font-bold tracking-wide" style={{ color: "var(--eb-danger)" }}>
                  STRICT PROCTORING — AUTOMATIC SUBMISSION
                </span>
              </div>
              <ul className="space-y-1 text-[11px] font-medium" style={{ color: "var(--eb-text)" }}>
                <li>Using any AI tool will lead to automatic exam submission.</li>
                <li>Changing tabs or navigating away from this window will lead to automatic exam submission.</li>
              </ul>
            </div>

            <div className="divide-y" style={{ borderColor: "var(--eb-border)" }}>
              <RuleItem number={1} icon={<Icons.Check />} type="success"
                title="No Negative Marking"
                description="You will not lose marks for incorrect answers. Attempt all questions." />
              <RuleItem number={2} icon={<Icons.Screen />} type="warning"
                title="Full-Screen Mode Required"
                description="The exam will start in full-screen mode. Exiting full-screen will be treated as a violation." />
              <RuleItem number={3} icon={<Icons.Ban />} type="danger"
                title="Tab Switching = Auto-Submit"
                description="If you switch tabs or windows during the exam, your test will be automatically submitted and you will be logged out." />
            </div>

            <div className="rounded-xl p-3 flex items-start gap-2.5" style={{ background: "var(--eb-orange-soft)", border: "1px solid rgba(249,115,22,0.25)" }}>
              <span className="flex-shrink-0 mt-0.5" style={{ color: "var(--eb-orange)" }}><Icons.Info /></span>
              <p className="text-[11px] leading-snug" style={{ color: "var(--eb-text)" }}>
                <strong>Resume Feature:</strong> If you accidentally get logged out, you can log back in
                with your email and exam code to resume from where you left off.
              </p>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl cursor-pointer transition-colors duration-150"
              style={{
                background: agreed ? "var(--eb-blue-soft)" : "var(--eb-surface-muted)",
                border: `1px solid ${agreed ? "var(--eb-blue)" : "var(--eb-border)"}`,
              }}>
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 cursor-pointer flex-shrink-0" style={{ accentColor: "var(--eb-blue)" }} />
              <span className="text-xs flex-1" style={{ color: agreed ? "var(--eb-blue)" : "var(--eb-text-muted)" }}>
                I have read and understood all the rules and regulations. I agree to follow them during the exam.
              </span>
            </label>

            <div className="flex justify-end">
              <button onClick={handleStartExam} disabled={!agreed || !examReady} className="eb-btn !w-auto !py-2.5 px-6 text-sm">
                {!examReady ? "Waiting for exam to start…" : "I Understand & Continue"}
                {examReady && <Icons.Arrow />}
              </button>
            </div>
          </div>

          <p className="text-center text-[11px] pb-4" style={{ color: "var(--eb-text-faint)" }}>
            EchoBrains &nbsp;|&nbsp; Smarter Assessments. A Brighter Tomorrow.
          </p>
        </main>
      </div>
    </div>
  );
}

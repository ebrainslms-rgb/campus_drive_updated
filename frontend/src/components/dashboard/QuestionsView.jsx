import React, { useState, useEffect } from 'react';
import axios from '../../utils/api';
import { useAdminAuth } from '../../context/AdminContext';
import { parseAndValidateCsv, validateFileBasics } from '../../utils/csvValidation';

const QUESTIONS_API = '/admin/questions';

const CSV_TEMPLATE = `question,optionA,optionB,optionC,optionD,correctAnswer,type
What is 15% of 200?,30,25,35,40,A,aptitude
Which number comes next: 2 4 8 16 ?,32,30,24,18,A,logical
What does HTML stand for?,HyperText Markup Language,High Text Markup Language,HyperText Markdown Language,HyperText Making Language,A,frontend
What is a closure in JS?,A function bundled with its lexical environment,A loop,A CSS selector,An HTML tag,A,programming`;

const SECTION_TARGETS = { aptitude: 15, logical: 15, programming: 35, frontend: 15 };
const COURSE_STYLES = [
  { color: '#F97316', bg: 'rgba(249,115,22,0.10)',  border: 'rgba(249,115,22,0.28)',  icon: '☕' },
  { color: '#34D399', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.28)',  icon: '🐍' },
  { color: '#06B6D4', bg: 'rgba(6,182,212,0.10)',   border: 'rgba(6,182,212,0.28)',   icon: '⚙️'  },
  { color: '#A855F7', bg: 'rgba(168,85,247,0.10)',  border: 'rgba(168,85,247,0.28)',  icon: '🧠' },
  { color: '#FBBF24', bg: 'rgba(251,191,36,0.10)',  border: 'rgba(251,191,36,0.28)',  icon: '⚡' },
  { color: '#818CF8', bg: 'rgba(129,140,248,0.10)', border: 'rgba(129,140,248,0.28)', icon: '💡' },
];

const formatTime12Hr = (t) => {
  if (!t) return '';
  if (t.includes('AM') || t.includes('PM')) return t;
  const [h, m] = t.split(':');
  let hr = parseInt(h, 10);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12 || 12;
  return `${hr}:${m} ${ampm}`;
};
const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/* ─────────────────────────────────────────────────────────────────────────
   CSV UPLOAD SUB-PANEL
───────────────────────────────────────────────────────────────────────── */
function UploadPanel({ course, style, onBack }) {
  const [file,        setFile]      = useState(null);
  const [dragOver,    setDragOver]  = useState(false);
  const [loading,     setLoading]   = useState(false);
  const [result,      setResult]    = useState(null);
  // Client-side preview — computed the moment a file is chosen, before any
  // upload request is made. See utils/csvValidation.js.
  const [preview,        setPreview]        = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  // Upload history — seeded from backend on mount, new session entries prepended
  const [history,     setHistory]   = useState([]);
  const [histLoading, setHistLoading] = useState(true);
  // Existing question count for this course — used to warn before a
  // replace-on-upload (the backend replaces the whole question bank per course).
  const [existingCount, setExistingCount] = useState(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

  // Fetch persistent upload history for this course on mount
  useEffect(() => {
    let cancelled = false;
    const fetchHistory = async () => {
      setHistLoading(true);
      try {
        const res = await axios.get(
          `${QUESTIONS_API}/upload-history?courseId=${course.id}`
        );
        if (!cancelled) {
          // Normalise timestamps to Date objects
          const entries = (res.data.history || []).map(h => ({
            ...h,
            timestamp: new Date(h.timestamp),
          }));
          setHistory(entries);
        }
      } catch {
        // History unavailable — silently ignore, upload still works
        if (!cancelled) setHistory([]);
      } finally {
        if (!cancelled) setHistLoading(false);
      }
    };
    fetchHistory();
    return () => { cancelled = true; };
  }, [course.id]);

  // Fetch how many questions this course already has, to warn before replace.
  useEffect(() => {
    let cancelled = false;
    axios.get(`${QUESTIONS_API}/stats/${course.id}`)
      .then(res => { if (!cancelled) setExistingCount(res.data?.total ?? 0); })
      .catch(() => { if (!cancelled) setExistingCount(null); });
    return () => { cancelled = true; };
  }, [course.id]);

  const handleFile = (f) => {
    setResult(null);
    setPreview(null);
    const basicError = validateFileBasics(f);
    if (basicError) {
      setFile(null);
      setResult({ success: false, message: basicError });
      return;
    }
    setFile(f);
    setPreviewLoading(true);
    parseAndValidateCsv(f).then(p => {
      setPreview(p);
      setPreviewLoading(false);
    });
  };

  const resetSelection = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file) { setResult({ success: false, message: 'Please select a CSV file.' }); return; }
    setShowReplaceConfirm(false);
    const fileName = file.name;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('courseId', course.id);
    setLoading(true); setResult(null);
    try {
      const res = await axios.post(QUESTIONS_API + '/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { inserted, skipped, skipReasons: reasons, courseName } = res.data;
      const uploadedTo = courseName || course.name;
      const successResult = {
        success: true,
        inserted,
        skipped,
        skipReasons: reasons,
        message: `${inserted} Question${inserted !== 1 ? 's' : ''} successfully uploaded and mapped to ${uploadedTo}.`,
      };
      setResult(successResult);
      setFile(null);
      setPreview(null);
      setExistingCount(inserted);
      // Prepend new entry — backend will also have it persisted
      setHistory(prev => [{
        id:        Date.now(),
        timestamp: new Date(),
        course:    uploadedTo,
        courseId:  course.id,
        fileName,
        inserted,
        skipped,
        status:    inserted > 0 ? 'Success' : 'Failed',
      }, ...prev]);
    } catch (err) {
      const errMsg = err.response?.data?.message || 'Upload failed.';
      setResult({ success: false, message: errMsg });
      setHistory(prev => [{
        id:        Date.now(),
        timestamp: new Date(),
        course:    course.name,
        courseId:  course.id,
        fileName,
        inserted:  0,
        skipped:   0,
        status:    'Failed',
      }, ...prev]);
    } finally { setLoading(false); }
  };

  /** Entry point for the "Confirm & Upload" button — gates on a replace
   *  warning if this course already has questions, since every upload
   *  fully replaces the existing question bank for that course. */
  const requestUpload = () => {
    if (existingCount > 0) {
      setShowReplaceConfirm(true);
    } else {
      handleUpload();
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type:'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = 'exam_questions_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Sub-panel header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-slate-800 dark:hover:text-slate-100"
          style={{ color: style.color }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          All Courses
        </button>
        <div className="h-4 w-px bg-slate-100 dark:bg-slate-800" />
        <div className="flex items-center gap-2">
          <span className="text-xl">{style.icon}</span>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{course.name}</h2>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: style.bg, color: style.color, border:`1px solid ${style.border}` }}>
            {course.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="ml-auto">
          <button onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-medium transition-colors hover:text-slate-800 dark:hover:text-slate-100"
            style={{ borderColor:'rgba(100,116,139,0.4)', color:'#94A3B8' }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV Template
          </button>
        </div>
      </div>

      <div className="flex gap-6 items-start">
        {/* Upload area */}
        <div className="flex-1 space-y-5 rounded-2xl p-6 border"
          style={{ background:'var(--eb-surface-muted)', borderColor: style.border }}>

          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Upload Course Questions CSV</h3>

          {/* Drop zone — no exam slot selector per requirements */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById(`csv-input-${course.id}`).click()}
            className="rounded-2xl p-10 flex flex-col items-center gap-3 text-center cursor-pointer transition-all"
            style={{
              border: `2px dashed ${dragOver ? style.color : file ? style.color + '80' : 'rgba(100,116,139,0.35)'}`,
              background: dragOver ? style.bg : file ? style.bg + '80' : 'var(--eb-surface-muted)',
            }}>
            <input id={`csv-input-${course.id}`} type="file" accept=".csv" className="hidden"
              onChange={e => handleFile(e.target.files[0])} />
            {file ? (
              <>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: style.bg }}>
                  <svg className="w-6 h-6" style={{ color: style.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="font-semibold text-sm" style={{ color: style.color }}>{file.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{(file.size/1024).toFixed(1)} KB · Click to change</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white dark:bg-slate-800">
                  <svg className="w-6 h-6 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">Drag & drop your CSV here</p>
                  <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                    or <span style={{ color: style.color }}>click to browse files</span>
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Preview — computed client-side the moment a file is chosen,
              before any upload request is sent (Step 1 + 2 of the review flow). */}
          {previewLoading && (
            <div className="flex items-center gap-2 text-sm" style={{ color: '#94A3B8' }}>
              <span className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-transparent animate-spin" />
              Reading and validating file…
            </div>
          )}

          {preview && !previewLoading && preview.fatal && (
            <div className="p-4 rounded-xl border text-sm"
              style={{ background: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.3)', color: '#DC2626' }}>
              <p className="font-semibold">This file can't be used.</p>
              <p className="mt-1 text-xs">{preview.fatalReason}</p>
            </div>
          )}

          {preview && !previewLoading && !preview.fatal && (
            <div className="rounded-xl p-4 border space-y-3"
              style={{ background: 'var(--eb-surface-muted)', borderColor: 'rgba(100,116,139,0.25)' }}>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Review before uploading</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg py-2" style={{ background: 'rgba(100,116,139,0.12)' }}>
                  <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{preview.totalRows}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total Detected</p>
                </div>
                <div className="rounded-lg py-2" style={{ background: 'rgba(34,197,94,0.10)' }}>
                  <p className="text-lg font-bold" style={{ color: '#4ADE80' }}>{preview.validCount}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Valid</p>
                </div>
                <div className="rounded-lg py-2" style={{ background: 'rgba(248,113,113,0.10)' }}>
                  <p className="text-lg font-bold" style={{ color: '#F87171' }}>{preview.invalidCount}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">Invalid</p>
                </div>
              </div>

              {preview.issues.length > 0 && (
                <div className="rounded-lg p-3 max-h-40 overflow-y-auto space-y-1"
                  style={{ background: 'var(--eb-surface-muted)', border: '1px solid rgba(100,116,139,0.2)' }}>
                  {preview.issues.map((iss, i) => (
                    <p key={i} className="text-xs font-mono" style={{ color: iss.warningOnly ? '#B45309' : '#F87171' }}>
                      Row {iss.row}: {iss.reasons.join('; ')}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button onClick={resetSelection}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors"
                  style={{ borderColor: 'rgba(100,116,139,0.4)', color: '#94A3B8' }}>
                  Choose a different file
                </button>
              </div>
            </div>
          )}

          {/* Result banner */}
          {result && (
            <div className="space-y-2">
              {/* Main status row */}
              <div
                className="flex items-start gap-3 p-4 rounded-xl border text-sm"
                style={{
                  background:   result.success ? 'rgba(34,197,94,0.08)'  : 'rgba(248,113,113,0.08)',
                  borderColor:  result.success ? 'rgba(34,197,94,0.35)'  : 'rgba(248,113,113,0.3)',
                  color:        result.success ? '#16A34A'                : '#DC2626',
                }}>
                <span className="flex-shrink-0 mt-0.5">
                  {result.success ? (
                    /* solid green check circle */
                    <svg className="w-5 h-5" style={{ color: '#22C55E' }} viewBox="0 0 24 24" fill="currentColor">
                      <path fillRule="evenodd" d="M2.25 12a9.75 9.75 0 1119.5 0 9.75 9.75 0 01-19.5 0zm13.28-2.47a.75.75 0 00-1.06-1.06L10.5 12.44l-1.72-1.72a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.5-4.5z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold leading-snug">{result.message}</p>
                  {result.success && result.skipped > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      {result.skipped} row{result.skipped !== 1 ? 's' : ''} skipped — see details below.
                    </p>
                  )}
                </div>
              </div>

              {/* Skip report */}
              {result.skipReasons?.length > 0 && (
                <div className="rounded-xl p-3 max-h-32 overflow-y-auto space-y-1"
                  style={{ background: 'var(--eb-surface-muted)', border: '1px solid rgba(100,116,139,0.2)' }}>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Skip Report</p>
                  {result.skipReasons.map((r, i) => (
                    <p key={i} className="text-xs text-amber-600 dark:text-amber-400 font-mono">{r}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Replace-existing warning — only shown when this course already
              has questions and the admin hasn't confirmed yet */}
          {showReplaceConfirm && (
            <div className="p-4 rounded-xl border text-sm space-y-3"
              style={{ background: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.3)', color: '#B45309' }}>
              <p className="font-semibold">
                This course already has {existingCount} question{existingCount !== 1 ? 's' : ''}.
              </p>
              <p className="text-xs" style={{ color: '#92400E' }}>
                Uploading will replace the entire existing question bank for this course — this can't be undone.
              </p>
              <div className="flex gap-2">
                <button onClick={handleUpload} disabled={loading}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100"
                  style={{ background: '#DC2626' }}>
                  {loading ? 'Uploading…' : 'Yes, Replace Existing Questions'}
                </button>
                <button onClick={() => setShowReplaceConfirm(false)} disabled={loading}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold border"
                  style={{ borderColor: 'rgba(100,116,139,0.4)', color: '#94A3B8' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Confirm & upload button — disabled until a valid preview exists */}
          {!showReplaceConfirm && (
            <button onClick={requestUpload}
              disabled={loading || !file || previewLoading || preview?.fatal || (preview && preview.validCount === 0)}
              className="w-full py-3 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 transition-all hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${style.color}, ${style.color}cc)` }}>
              {loading
                ? <><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />Uploading…</>
                : preview && !preview.fatal
                  ? `Confirm & Upload ${preview.validCount} Question${preview.validCount !== 1 ? 's' : ''}`
                  : 'Upload Questions'}
            </button>
          )}
        </div>

        {/* Right — structure guide */}
        <div className="w-72 flex-shrink-0 space-y-4">
          <div className="rounded-2xl p-5 space-y-4 border"
            style={{ background:'var(--eb-surface-muted)', borderColor:'rgba(100,116,139,0.3)' }}>
            <div>
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Exam Paper Structure</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">80 Questions / 60 Mins</p>
            </div>
            <div className="space-y-3">
              {[
                { key:'aptitude',    label:'Aptitude',    target:15,  color:'#06B6D4' },
                { key:'logical',     label:'Logical',     target:15,  color:'#F97316' },
                { key:'programming', label:'Programming', target:35,  color:'#10B981' },
                { key:'frontend',    label:'Front-End',   target:15,  color:'#A855F7' },
              ].map(sec => (
                <div key={sec.key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-300">{sec.label}</span>
                    <span className="text-slate-500 dark:text-slate-400">Target: {sec.target} questions</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background:'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full" style={{ width:'100%', backgroundColor: sec.color + '40' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CSV format guide */}
          <div className="rounded-2xl p-4 space-y-2 border"
            style={{ background:'var(--eb-surface-muted)', borderColor:'rgba(100,116,139,0.3)' }}>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">CSV Columns</h4>
            {['question','optionA','optionB','optionC','optionD','correctAnswer','correctAns','type'].map(col => (
              <div key={col} className="flex justify-between gap-2 px-2 py-1.5 rounded-lg text-[10px] font-mono"
                style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ color: style.color }}>{col}</span>
                <span className="text-slate-500 dark:text-slate-400 text-right">
                  {col === 'correctAnswer' ? 'A / B / C / D'
                    : col === 'correctAns'  ? 'A / B / C / D (alias)'
                    : col === 'type' ? 'aptitude|logical|programming|frontend'
                    : col === 'question' ? 'Question text'
                    : `Option ${col.slice(-1)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Upload History Table ─────────────────────────────────────── */}
      {histLoading ? (
        <div className="flex items-center gap-3 px-1 py-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600 border-t-slate-400 animate-spin flex-shrink-0" />
          Loading upload history…
        </div>
      ) : history.length > 0 && (
        <div className="rounded-2xl border overflow-hidden"
          style={{ background: 'var(--eb-surface-muted)', borderColor: 'rgba(100,116,139,0.25)' }}>
          {/* Table header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b"
            style={{ borderColor: 'rgba(100,116,139,0.2)', background: 'var(--eb-surface-muted)' }}>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Upload History</h4>
            <span className="text-xs text-slate-500 dark:text-slate-400">{history.length} upload{history.length !== 1 ? 's' : ''} total</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold border-b"
                style={{ borderColor: 'rgba(100,116,139,0.18)', background: 'var(--eb-surface-muted)' }}>
                <tr>
                  <th className="px-5 py-3">Upload Date / Time</th>
                  <th className="px-5 py-3">Target Course</th>
                  <th className="px-5 py-3">File Name</th>
                  <th className="px-5 py-3 text-center">Questions Added</th>
                  <th className="px-5 py-3 text-center">Skipped</th>
                  <th className="px-5 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {history.map(h => (
                  <tr key={h.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <td className="px-5 py-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {h.timestamp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' '}
                      <span className="text-slate-500 dark:text-slate-400">
                        {h.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-800 dark:text-slate-100 font-medium">{h.course}</td>
                    <td className="px-5 py-3 font-mono text-slate-500 dark:text-slate-400 max-w-[180px] truncate" title={h.fileName}>
                      {h.fileName}
                    </td>
                    <td className="px-5 py-3 text-center font-bold font-mono"
                      style={{ color: h.inserted > 0 ? '#22C55E' : '#94A3B8' }}>
                      {h.inserted}
                    </td>
                    <td className="px-5 py-3 text-center font-mono"
                      style={{ color: h.skipped > 0 ? '#FBBF24' : '#475569' }}>
                      {h.skipped}
                    </td>
                    <td className="px-5 py-3 text-center">
                      {h.status === 'Success' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold"
                          style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)' }}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          Success
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold"
                          style={{ background: 'rgba(248,113,113,0.1)', color: '#F87171', border: '1px solid rgba(248,113,113,0.25)' }}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   COURSE DIRECTORY
───────────────────────────────────────────────────────────────────────── */
export default function QuestionsView() {
  const { courses, loadingCourses } = useAdminAuth();
  const [selectedCourse, setSelected] = useState(null); // { course, style }

  /* ── Course selected — show upload panel ──────────────────────────── */
  if (selectedCourse) {
    return (
      <UploadPanel
        course={selectedCourse.course}
        style={selectedCourse.style}
        onBack={() => setSelected(null)} />
    );
  }

  /* ── Course directory ─────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Question Management</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Select a course to upload its question bank CSV
        </p>
      </div>

      {loadingCourses ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-2 border-blue-500 dark:border-blue-400 border-t-transparent animate-spin" />
        </div>
      ) : courses.filter(c => c.isActive).length === 0 ? (
        <div className="text-center py-20 text-slate-500 dark:text-slate-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="font-medium">No active courses found.</p>
          <p className="text-xs mt-1">Activate a course in the Courses section to upload questions.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {courses.filter(c => c.isActive).map((course, idx) => {
            const style = COURSE_STYLES[idx % COURSE_STYLES.length];
            return (
              <button
                key={course.id}
                onClick={() => setSelected({ course, style })}
                className="group relative text-left rounded-2xl p-6 transition-all duration-200 hover:scale-[1.03] hover:-translate-y-0.5 focus:outline-none"
                style={{
                  background: 'var(--eb-surface-muted)',
                  border: `1.5px solid ${style.border}`,
                  boxShadow: `0 4px 24px 0 ${style.color}18`,
                }}>

                {/* Glow on hover */}
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse at 30% 30%, ${style.color}12, transparent 70%)` }} />

                {/* Icon badge */}
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 relative"
                  style={{ background: style.bg, border: `1px solid ${style.border}` }}>
                  {style.icon}
                </div>

                {/* Course name */}
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-1 relative">{course.name}</h3>

                {/* Description */}
                {course.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 relative mb-3">{course.description}</p>
                )}

                {/* Footer row */}
                <div className="flex items-center justify-between relative">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${course.isActive ? '' : 'opacity-60'}`}
                    style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
                    {course.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-medium group-hover:gap-2 transition-all duration-200"
                    style={{ color: style.color }}>
                    Upload CSV
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAdminAuth } from '../../context/AdminContext';
import axios from '../../utils/api';

const EXAMS_API = '/admin/exams';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
/*
 * TIMEZONE FIX: exam start/end times are entered by the admin as plain
 * "HH:MM" wall-clock values and the backend (examController.scheduleTest)
 * deliberately bakes them in as India Standard Time (UTC+5:30) *regardless
 * of the server's own timezone*, specifically so scheduling behaves the
 * same in local dev and in production no matter where the server is
 * hosted. Everything that formats or compares those stored timestamps on
 * the frontend has to use that same fixed "Asia/Kolkata" interpretation —
 * not the browser's local timezone (via getHours()/new Date() defaults),
 * which only happens to match IST if the admin's own device/browser is
 * also set to IST. Mixing the two was the source of the deployment
 * timezone bugs (correct on a dev machine set to IST, wrong everywhere
 * else — including most cloud servers, which default to UTC).
 */
const IST_TZ = 'Asia/Kolkata';

const formatTime12Hr = (t) => {
  if (!t) return '';
  if (typeof t === 'string' && (t.includes('AM') || t.includes('PM'))) return t;
  if (typeof t === 'string' && (t.includes('T') || t.length > 8)) {
    const d = new Date(t);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString('en-IN', { timeZone: IST_TZ, hour: 'numeric', minute: '2-digit', hour12: true });
    }
  }
  // Plain "HH:MM" (24hr) form input value — already wall-clock IST, no conversion needed.
  const [h, m] = t.split(':');
  let hr = parseInt(h, 10);
  const ampm = hr >= 12 ? 'PM' : 'AM';
  hr = hr % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
};

const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { timeZone: IST_TZ, day: 'numeric', month: 'short', year: 'numeric' });

/* "today" in IST as YYYY-MM-DD, for the date input's min= attribute.
 * Using en-CA locale gives YYYY-MM-DD directly. */
const todayStr = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: IST_TZ });

/* current IST time as HH:MM — used to restrict past-time scheduling on today */
const nowTimeStr = () =>
  new Date().toLocaleTimeString('en-GB', { timeZone: IST_TZ, hour: '2-digit', minute: '2-digit', hour12: false });

/* add 60 min to "HH:MM" → "HH:MM" */
const addSixtyMin = (timeStr) => {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + 60;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

const genCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

/* ─── Searchable college combobox ─────────────────────────────────────────── */
function CollegeSearchSelect({ colleges, value, onChange, placeholder = '— Select an active college —' }) {
  const [query, setQuery]     = useState('');
  const [open, setOpen]       = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const wrapRef  = useRef(null);
  const inputRef = useRef(null);

  const selected = colleges.find(c => c.id === value);

  /* filter + sort: exact prefix first, then contains, all case-insensitive */
  const filtered = query.trim() === ''
    ? colleges
    : (() => {
        const q = query.trim().toLowerCase();
        const startsWith = colleges.filter(c => c.name.toLowerCase().startsWith(q));
        const contains   = colleges.filter(c => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q));
        return [...startsWith, ...contains];
      })();

  /* close on outside click */
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* reset highlight when filter changes */
  useEffect(() => { setHighlighted(0); }, [query]);

  const select = (college) => {
    onChange(college.id);
    setQuery('');
    setOpen(false);
  };

  const clear = () => { onChange(''); setQuery(''); inputRef.current?.focus(); };

  const handleKeyDown = (e) => {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true); return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); setHighlighted(h => Math.min(h + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); setHighlighted(h => Math.max(h - 1, 0)); }
    if (e.key === 'Enter')      { e.preventDefault(); if (filtered[highlighted]) select(filtered[highlighted]); }
    if (e.key === 'Escape')     { setOpen(false); setQuery(''); }
  };

  /* highlight matching part of text */
  const highlight = (name) => {
    if (!query.trim()) return name;
    const idx = name.toLowerCase().indexOf(query.trim().toLowerCase());
    if (idx === -1) return name;
    return (
      <>
        {name.slice(0, idx)}
        <span style={{ color: '#06B6D4', fontWeight: 700 }}>{name.slice(idx, idx + query.trim().length)}</span>
        {name.slice(idx + query.trim().length)}
      </>
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      {/* Input box */}
      <div
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-text"
        style={{ background: 'var(--eb-surface-muted)', border: `1px solid ${open ? '#06B6D4' : 'rgba(6,182,212,0.35)'}`,
          boxShadow: open ? '0 0 0 3px rgba(6,182,212,0.15)' : 'none', transition: 'all 0.15s' }}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}>
        <svg className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          value={open ? query : ''}
          placeholder={selected ? selected.name : placeholder}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
          style={{ color: (open || selected) ? "var(--eb-text)" : "var(--eb-text-faint)" }} />
        {selected && !open && (
          <button onClick={e => { e.stopPropagation(); clear(); }}
            className="text-slate-500 dark:text-slate-400 hover:text-red-400 transition-colors flex-shrink-0" title="Clear">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        <svg className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 w-full mt-1.5 rounded-xl overflow-hidden shadow-2xl"
          style={{ background: 'var(--eb-surface-muted)', border: '1px solid rgba(6,182,212,0.3)',
            backdropFilter: 'blur(12px)', maxHeight: 220, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">No colleges match "{query}"</div>
          ) : (
            filtered.map((c, i) => (
              <div key={c.id}
                onMouseDown={e => { e.preventDefault(); select(c); }}
                onMouseEnter={() => setHighlighted(i)}
                className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors text-sm"
                style={{
                  background: i === highlighted ? 'rgba(6,182,212,0.12)' : 'transparent',
                  color: i === highlighted ? "var(--eb-text)" : "var(--eb-text-muted)",
                  borderLeft: i === highlighted ? '2px solid #06B6D4' : '2px solid transparent',
                }}>
                <span className="flex-1 truncate">{highlight(c.name)}</span>
                {value === c.id && (
                  <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#06B6D4' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}


/* ─── Slot status logic ───────────────────────────────────────────────────── */
/*
  Pending  — slot is in the future (startTime > now)
  Done     — slot has passed AND at least 1 submission exists for that examCode
  Not Done — slot has passed AND zero submissions
  Active   — currently within startTime..endTime window (shown as Pending visually until ended)
*/
const getSlotStatus = (exam, attendanceMap) => {
  const now = Date.now();
  const start = new Date(exam.startTime).getTime();
  const end   = new Date(exam.endTime).getTime();
  const submissions = attendanceMap[exam.examCode] || 0;

  if (now < start) return 'pending';       // hasn't started yet
  if (now >= start && now <= end) return 'active'; // currently running
  // past end
  return submissions > 0 ? 'done' : 'notdone';
};

const isExpiredCode = (exam) => Date.now() > new Date(exam.endTime).getTime();

/* ─── Status badge ────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  if (status === 'pending' || status === 'active') return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: 'rgba(251,191,36,0.12)', color: '#FBBF24', border: '1px solid rgba(251,191,36,0.25)' }}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Pending
    </span>
  );
  if (status === 'done') return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)' }}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      Done
    </span>
  );
  // notdone
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: 'rgba(248,113,113,0.12)', color: '#F87171', border: '1px solid rgba(248,113,113,0.25)' }}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      Not Done
    </span>
  );
}


/* ─── Edit Slot Modal ─────────────────────────────────────────────────────── */
function EditSlotModal({ exam, colleges, onSave, onCancel, saving }) {
  const college = colleges.find(c => c.id === exam.collegeId);
  const [date, setDate]           = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime]     = useState('');

  useEffect(() => {
    // TIMEZONE FIX: prefill using IST (see IST_TZ note above), not the
    // admin's browser-local timezone — otherwise opening "edit" on an
    // exam scheduled by an admin in IST, from a browser set to a
    // different timezone, would silently show (and on save, persist) the
    // wrong wall-clock time.
    const d = new Date(exam.date);
    setDate(d.toLocaleDateString('en-CA', { timeZone: IST_TZ }));
    const s = new Date(exam.startTime);
    const st = s.toLocaleTimeString('en-GB', { timeZone: IST_TZ, hour: '2-digit', minute: '2-digit', hour12: false });
    setStartTime(st);
    setEndTime(addSixtyMin(st));
  }, [exam]);

  const handleStartChange = (val) => { setStartTime(val); setEndTime(addSixtyMin(val)); };

  const inputBase = 'w-full px-3 py-2 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none';
  const inputStyle = { background: 'var(--eb-surface-muted)', border: '1px solid rgba(6,182,212,0.35)', colorScheme: 'light dark' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3"
          style={{ background: 'rgba(248,113,113,0.07)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)' }}>
            <svg className="w-4 h-4" style={{ color: '#F87171' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Reschedule Slot</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{college?.name || '—'} · Code: <span className="font-mono text-emerald-400">{exam.examCode}</span></p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">New Date</label>
            <input type="date" value={date} min={todayStr()} onChange={e => setDate(e.target.value)}
              className={inputBase} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Start Time</label>
              <input type="time" value={startTime}
                min={date === todayStr() ? nowTimeStr() : undefined}
                onChange={e => handleStartChange(e.target.value)}
                className={inputBase} style={inputStyle} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">End Time <span className="normal-case text-slate-600 dark:text-slate-300">(auto)</span></label>
              <input type="time" value={endTime} readOnly
                className={inputBase} style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">End time is locked at Start Time + 60 minutes.</p>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-3">
          <button onClick={onCancel} disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-medium">
            Cancel
          </button>
          <button onClick={() => onSave({ date, startTime, endTime })} disabled={saving || !date || !startTime}
            className="flex-1 px-4 py-2.5 rounded-xl text-slate-800 dark:text-slate-100 text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#F87171,#EF4444)' }}>
            {saving ? <><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />Saving…</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ─── Confirm schedule modal ──────────────────────────────────────────────── */
function ScheduleConfirmModal({ collegeId, colleges, testRows, onConfirm, onCancel, loading }) {
  const college = colleges.find(c => c.id === collegeId);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3"
          style={{ background: 'rgba(16,185,129,0.07)' }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
            <svg style={{ width: 18, height: 18, color: '#10B981' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Confirm Exam Schedule</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Review allocation before committing</p>
          </div>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(6,182,212,0.07)', border: '1px solid rgba(6,182,212,0.18)' }}>
            <span className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">College</span>
            <p className="text-slate-800 dark:text-slate-100 font-semibold mt-0.5">{college?.name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Test Distribution — {testRows.length} slot{testRows.length !== 1 ? 's' : ''}
            </p>
            <div className="space-y-2">
              {testRows.map((row, i) => (
                <div key={row.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl text-sm"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>{i + 1}</span>
                    <span className="text-slate-600 dark:text-slate-300 font-mono text-xs">{row.date || '—'}</span>
                    <span className="text-blue-600 dark:text-blue-400 font-mono text-xs">
                      {formatTime12Hr(row.startTime)} – {formatTime12Hr(row.endTime)}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-emerald-400 tracking-wider text-xs">{row.code}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', color: '#B45309' }}>
            Each exam code is unique and acts as the student's one-time login password for that slot.
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-medium">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl text-slate-800 dark:text-slate-100 text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#10B981,#059669)' }}>
            {loading
              ? <><span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />Scheduling…</>
              : 'Confirm & Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ─── Main component ──────────────────────────────────────────────────────── */
export default function ExamsView() {
  const { colleges, exams, loadingExams, fetchExams } = useAdminAuth();

  /* ── attendance map { examCode → submittedCount } ── */
  const [attendanceMap, setAttendanceMap] = useState({});
  const fetchAttendance = useCallback(async () => {
    try {
      const res = await axios.get(`${EXAMS_API}/attendance`);
      setAttendanceMap(res.data || {});
    } catch { /* silent — status degrades to pending */ }
  }, []);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  /* ── college filter for the exams list ── */
  const [filterCollegeId, setFilterCollegeId] = useState('');

  /* ── copy code ── */
  const [copiedCode, setCopiedCode] = useState(null);
  const handleCopy = (code, id) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  /* ── schedule form ── */
  const [collegeId, setCollegeId]   = useState('');
  const [testCount, setTestCount]   = useState(1);
  const [testRows, setTestRows]     = useState([{ id: 1, date: '', startTime: '', endTime: '', code: genCode() }]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [scheduling, setScheduling]   = useState(false);
  const [successMsg, setSuccessMsg]   = useState('');

  /* ── edit slot ── */
  const [editingExam, setEditingExam] = useState(null);
  const [savingEdit, setSavingEdit]   = useState(false);

  /* sync rows when count changes */
  useEffect(() => {
    setTestRows(prev => {
      if (testCount > prev.length) {
        const extras = Array.from({ length: testCount - prev.length }, (_, i) => ({
          id: prev.length + i + 1, date: '', startTime: '', endTime: '', code: genCode()
        }));
        return [...prev, ...extras];
      }
      return prev.slice(0, testCount);
    });
  }, [testCount]);

  const updateRow = (idx, key, val) =>
    setTestRows(rows => rows.map((r, i) => i === idx ? { ...r, [key]: val } : r));

  /* auto-fill end time when start time changes */
  const handleStartTimeChange = (idx, val) => {
    setTestRows(rows => rows.map((r, i) =>
      i === idx ? { ...r, startTime: val, endTime: addSixtyMin(val) } : r
    ));
  };

  const regenCode = (idx) =>
    setTestRows(rows => rows.map((r, i) => i === idx ? { ...r, code: genCode() } : r));


  /* ── validation & submit ── */
  const handleScheduleClick = () => {
    if (!collegeId) { alert('Please select a college.'); return; }
    const invalid = testRows.some(r => !r.date || !r.startTime || !r.endTime);
    if (invalid) { alert('Please fill in date and start time for every test slot.'); return; }
    // Prevent scheduling a start time in the past for today's date
    const today = todayStr();
    const now   = nowTimeStr();
    const pastTime = testRows.find(r => r.date === today && r.startTime < now);
    if (pastTime) {
      alert(`Start time ${formatTime12Hr(pastTime.startTime)} has already passed. Please choose a future time.`);
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setScheduling(true);
    try {
      await Promise.all(
        testRows.map(row =>
          axios.post(`${EXAMS_API}/schedule`, {
            collegeId, date: row.date,
            startTime: row.startTime, endTime: row.endTime,
            examCode: row.code,
          })
        )
      );
      setShowConfirm(false);
      setSuccessMsg(`${testRows.length} exam slot${testRows.length > 1 ? 's' : ''} scheduled successfully!`);
      setCollegeId(''); setTestCount(1);
      setTestRows([{ id: 1, date: '', startTime: '', endTime: '', code: genCode() }]);
      fetchExams();
      fetchAttendance();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err) {
      setShowConfirm(false);
      alert(err.response?.data?.message || 'Scheduling failed.');
    } finally { setScheduling(false); }
  };

  /* ── edit slot save ── */
  const handleEditSave = async ({ date, startTime, endTime }) => {
    setSavingEdit(true);
    try {
      await axios.put(`${EXAMS_API}/${editingExam.id}`, { date, startTime, endTime });
      setEditingExam(null);
      fetchExams();
      fetchAttendance();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update slot.');
    } finally { setSavingEdit(false); }
  };

  /* ── filtered exams ── */
  const filteredExams = filterCollegeId
    ? exams.filter(e => String(e.collegeId) === String(filterCollegeId))
    : exams;

  /* ── styles ── */
  const inputBase  = 'w-full px-3 py-2 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none transition-all';
  const inputStyle = { background: 'var(--eb-surface-muted)', border: '1px solid rgba(6,182,212,0.35)', colorScheme: 'light dark' };
  const inputFocus = { border: '1px solid #06B6D4', boxShadow: '0 0 0 3px rgba(6,182,212,0.15)' };


  return (
    <div className="space-y-6">

      {/* ── Page Header ── */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Exam Management</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Configure and schedule exam slots for colleges</p>
      </div>

      {/* ── Success toast ── */}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 rounded-xl border text-sm"
          style={{ background: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)', color: '#059669' }}>
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {successMsg}
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div className="flex gap-6 items-start">

        {/* LEFT — Schedule Panel */}
        <div className="flex-1 min-w-0 space-y-5 rounded-2xl p-6 border"
          style={{ background: 'var(--eb-surface-muted)', borderColor: 'rgba(100,116,139,0.3)' }}>

          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Schedule New Exam</h3>

          {/* College selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              College <span style={{ color: '#06B6D4' }}>*</span>
            </label>
            <CollegeSearchSelect
              colleges={colleges}
              value={collegeId}
              onChange={setCollegeId}
            />
          </div>

          {/* Number of tests */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Number of Tests to Conduct <span style={{ color: '#06B6D4' }}>*</span>
            </label>
            <div className="flex items-center gap-3">
              <button onClick={() => setTestCount(n => Math.max(1, n - 1))}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold transition-all hover:scale-105 flex-shrink-0"
                style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)', color: '#06B6D4' }}>
                −
              </button>
              <input type="number" min={1} max={10} value={testCount}
                onChange={e => setTestCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
                className="w-20 text-center px-3 py-2 rounded-xl text-base font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
                style={{ background: 'var(--eb-surface-muted)', border: '1px solid rgba(6,182,212,0.35)' }} />
              <button onClick={() => setTestCount(n => Math.min(10, n + 1))}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold transition-all hover:scale-105 flex-shrink-0"
                style={{ background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)', color: '#06B6D4' }}>
                +
              </button>
              <span className="text-slate-500 dark:text-slate-400 text-xs">slot{testCount !== 1 ? 's' : ''} (max 10)</span>
            </div>
          </div>


          {/* Dynamic test rows */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Test Slot Configuration</p>
            {testRows.map((row, idx) => (
              <div key={row.id} className="rounded-xl overflow-hidden"
                style={{ border: '1px solid rgba(6,182,212,0.2)', background: 'rgba(6,182,212,0.03)' }}>

                {/* Row header */}
                <div className="flex items-center justify-between px-4 py-2 border-b"
                  style={{ borderColor: 'rgba(6,182,212,0.15)', background: 'rgba(6,182,212,0.06)' }}>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Test {idx + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-400 text-xs tracking-wider">{row.code}</span>
                    <button onClick={() => regenCode(idx)} title="Regenerate code"
                      className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Date + time inputs */}
                <div className="grid grid-cols-3 gap-3 p-4">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Date</label>
                    <input type="date" value={row.date} min={todayStr()}
                      onChange={e => updateRow(idx, 'date', e.target.value)}
                      className={inputBase} style={inputStyle}
                      onFocus={e => Object.assign(e.target.style, inputFocus)}
                      onBlur={e => Object.assign(e.target.style, inputStyle)} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Start Time</label>
                    <input type="time" value={row.startTime}
                      min={row.date === todayStr() ? nowTimeStr() : undefined}
                      onChange={e => handleStartTimeChange(idx, e.target.value)}
                      className={inputBase} style={inputStyle}
                      onFocus={e => Object.assign(e.target.style, inputFocus)}
                      onBlur={e => Object.assign(e.target.style, inputStyle)} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                      End Time <span className="normal-case font-normal text-slate-600 dark:text-slate-300">(auto)</span>
                    </label>
                    <input type="time" value={row.endTime} readOnly
                      className={inputBase}
                      style={{ ...inputStyle, opacity: 0.55, cursor: 'not-allowed' }}
                      title="Auto-calculated: Start Time + 60 minutes" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Info pill */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.18)', color: '#B45309' }}>
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            End time is locked at Start Time + 60 minutes. Past dates are disabled.
          </div>

          {/* Schedule button */}
          <button onClick={handleScheduleClick}
            className="w-full py-3 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#10B981,#059669)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Schedule Exam
          </button>
        </div>


        {/* RIGHT — Scheduled exams list */}
        <div className="w-[50%] flex-shrink-0 space-y-3">

          {/* Header row with filter dropdown */}
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">Scheduled Exam Slots</h3>
            <div className="relative flex-1 max-w-[220px]">
              <select value={filterCollegeId} onChange={e => setFilterCollegeId(e.target.value)}
                className="w-full pl-3 pr-8 py-1.5 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none appearance-none"
                style={{ background: 'var(--eb-surface-muted)', border: '1px solid rgba(6,182,212,0.3)', colorScheme: 'light dark' }}>
                <option value="">All Colleges</option>
                {colleges.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 dark:text-slate-400"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Status legend pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-slate-600 dark:text-slate-300 uppercase tracking-wider">Status:</span>
            {[
              { label: 'Pending', bg: 'rgba(251,191,36,0.1)', color: '#FBBF24', border: 'rgba(251,191,36,0.2)' },
              { label: 'Done',    bg: 'rgba(34,197,94,0.1)',  color: '#22C55E', border: 'rgba(34,197,94,0.2)' },
              { label: 'Not Done',bg: 'rgba(248,113,113,0.1)',color: '#F87171', border: 'rgba(248,113,113,0.2)' },
            ].map(p => (
              <span key={p.label} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: p.bg, color: p.color, border: `1px solid ${p.border}` }}>
                {p.label}
              </span>
            ))}
          </div>

          {loadingExams ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            </div>
          ) : filteredExams.length === 0 ? (
            <div className="text-center py-14 text-slate-500 dark:text-slate-400 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700"
              style={{ background: 'var(--eb-surface-muted)' }}>
              <svg className="w-10 h-10 mx-auto mb-3 text-slate-700 dark:text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">{filterCollegeId ? 'No exams for selected college.' : 'No exams scheduled yet.'}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
              style={{ background: 'var(--eb-surface-muted)' }}>
              {/* Table header */}
              <div className="grid gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold"
                style={{ gridTemplateColumns: '1fr auto auto auto auto', background: 'var(--eb-surface-muted)' }}>
                <span>College</span>
                <span>Date</span>
                <span>Time Slot</span>
                <span>Code</span>
                <span>Status</span>
              </div>


              {/* Table rows */}
              <div className="divide-y divide-slate-700/30 max-h-[calc(100vh-320px)] overflow-y-auto">
                {filteredExams.map((exam) => {
                  const status  = getSlotStatus(exam, attendanceMap);
                  const expired = isExpiredCode(exam);
                  return (
                    <div key={exam.id}
                      className="grid gap-2 px-4 py-3 items-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      style={{ gridTemplateColumns: '1fr auto auto auto auto' }}>

                      {/* College name */}
                      <p className="text-slate-800 dark:text-slate-100 text-xs font-medium truncate">{exam.collegeName || '—'}</p>

                      {/* Date */}
                      <span className="text-slate-500 dark:text-slate-400 text-xs font-mono whitespace-nowrap">{formatDate(exam.date)}</span>

                      {/* Time slot */}
                      <span className="text-blue-600 dark:text-blue-400 text-xs font-mono whitespace-nowrap">
                        {formatTime12Hr(exam.startTime)} – {formatTime12Hr(exam.endTime)}
                      </span>

                      {/* Exam code — red strikethrough if expired */}
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-xs tracking-wider"
                          style={expired
                            ? { color: '#F87171', textDecoration: 'line-through', textDecorationColor: '#F87171' }
                            : { color: '#34D399' }}>
                          {exam.examCode}
                        </span>
                        <button onClick={() => handleCopy(exam.examCode, exam.id)}
                          className="p-1 rounded border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                          title="Copy code">
                          {copiedCode === exam.id
                            ? <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            : <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
                        </button>
                      </div>

                      {/* Status badge + edit button (server is authoritative on editability) */}
                      <div className="flex items-center gap-2">
                        <StatusBadge status={status} />
                        {exam.editable && (
                          <button onClick={() => setEditingExam(exam)}
                            title="Edit this slot — locks automatically once a student starts"
                            className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all hover:scale-105"
                            style={{ background: 'rgba(248,113,113,0.12)', color: '#F87171', border: '1px solid rgba(248,113,113,0.25)' }}>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit Slot
                          </button>
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Confirm modal ── */}
      {showConfirm && (
        <ScheduleConfirmModal
          collegeId={collegeId} colleges={colleges}
          testRows={testRows} loading={scheduling}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)} />
      )}

      {/* ── Edit slot modal ── */}
      {editingExam && (
        <EditSlotModal
          exam={editingExam} colleges={colleges}
          saving={savingEdit}
          onSave={handleEditSave}
          onCancel={() => setEditingExam(null)} />
      )}

    </div>
  );
}

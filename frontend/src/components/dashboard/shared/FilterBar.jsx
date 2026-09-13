import React, { useState, useEffect, useRef } from 'react';
import api from '../../../utils/api';

const DATE_PRESETS = [
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'last1y', label: 'Last 1 Year' },
  { value: 'custom', label: 'Custom Range' },
  { value: 'all', label: 'All Time' },
];

/** Computes {from, to} ISO strings for a preset - null/null for 'all'. */
/** Format a Date using its LOCAL wall-clock components (year/month/day/
 *  hour/minute/second as the browser's own clock reads them) - NOT
 *  toISOString(), which converts to UTC first. That UTC conversion was
 *  the actual bug: the backend treats these from/to strings as plain
 *  wall-clock time in the app's existing IST convention, so sending a
 *  UTC-shifted string silently shifted every "Last 30 Days"/"Last 1
 *  Year" boundary by the browser's UTC offset (e.g. -5:30 for a browser
 *  already set to IST) - a systematic, wrong-by-hours error. The
 *  "Custom Range" branch below never had this bug, which is exactly why
 *  Custom Range worked while the two relative presets didn't. */
function toLocalDateTimeString(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}-${m}-${d}T${h}:${mi}:${s}`;
}

export function resolveDateRange(preset, customFrom, customTo) {
  const now = new Date();
  if (preset === 'last30') {
    const from = new Date(now); from.setDate(from.getDate() - 30);
    return { from: toLocalDateTimeString(from), to: toLocalDateTimeString(now) };
  }
  if (preset === 'last1y') {
    const from = new Date(now); from.setFullYear(from.getFullYear() - 1);
    return { from: toLocalDateTimeString(from), to: toLocalDateTimeString(now) };
  }
  if (preset === 'custom' && customFrom && customTo) {
    return { from: `${customFrom}T00:00:00`, to: `${customTo}T23:59:59` };
  }
  return { from: null, to: null };
}

function ExamSearchSelect({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedLabel, setSelectedLabel] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!open) return;
      api.get('/admin/exams/search', { params: { search: query || undefined, size: 15 } })
        .then(res => setResults(res.data?.content || []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, open]);

  useEffect(() => {
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <label className="eb-label">Drive / Exam</label>
      <div className="relative">
        <input type="text"
          value={open ? query : selectedLabel}
          placeholder="All Drives"
          onFocus={() => { setOpen(true); setQuery(''); }}
          onChange={e => setQuery(e.target.value)}
          className="eb-input pr-8 text-sm" />
        {value && (
          <button onClick={() => { onChange(null); setSelectedLabel(''); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--eb-text-faint)' }}
            aria-label="Clear drive filter">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border shadow-xl"
          style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border-strong)' }}>
          {results.map(exam => (
            <li key={exam.examId}>
              <button type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const label = `${new Date(exam.startTime).toLocaleDateString('en-IN')} — ${exam.examCode} — ${exam.collegeName}`;
                  setSelectedLabel(label);
                  onChange(exam.examId);
                  setOpen(false);
                }}
                className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                style={{ color: 'var(--eb-text)' }}>
                <span className="font-medium">{exam.examCode}</span>
                <span style={{ color: 'var(--eb-text-faint)' }}> · {new Date(exam.startTime).toLocaleDateString('en-IN')} · {exam.collegeName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FilterBar({ datePreset, onDatePresetChange, customFrom, customTo, onCustomChange,
                                     examId, onExamChange, courseId, onCourseChange, courses }) {
  return (
    <div className="rounded-2xl p-3.5 border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5"
      style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
      <div>
        <label className="eb-label">Date Range</label>
        <select value={datePreset} onChange={e => onDatePresetChange(e.target.value)} className="eb-input text-sm">
          {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {datePreset === 'custom' && (
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="eb-label">From</label>
            <input type="date" value={customFrom} onChange={e => onCustomChange('from', e.target.value)} className="eb-input text-sm" />
          </div>
          <div className="flex-1">
            <label className="eb-label">To</label>
            <input type="date" value={customTo} onChange={e => onCustomChange('to', e.target.value)} className="eb-input text-sm" />
          </div>
        </div>
      )}

      <ExamSearchSelect value={examId} onChange={onExamChange} />

      <div>
        <label className="eb-label">Course</label>
        <select value={courseId || ''} onChange={e => onCourseChange(e.target.value || null)} className="eb-input text-sm">
          <option value="">All Courses</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
    </div>
  );
}

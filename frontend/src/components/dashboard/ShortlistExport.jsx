import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../utils/api';
import { notify } from '../../utils/notify';
import { downloadErrorMessage, filenameFromDisposition, saveBlob } from '../../utils/download';
import { RowSkeleton } from './shared/LoadingSkeleton.jsx';

/*
 * Shortlist & Export (opened from Drive Details).
 *
 * - Loads the submitted students of THIS drive once; every filter below runs
 *   in the browser on that list (no API call per checkbox).
 * - One domain at a time (mandatory).
 * - Nothing is saved: filters, protected students and renamed column headers
 *   only shape the downloaded feedback sheet.
 */

/* Column list - the table and the Excel use the same order. `manual` columns
 * stay empty (the interview panel fills them in Excel) and can be renamed. */
const COLUMNS = [
  { key: 'SL_NO', label: 'Sl.No' },
  { key: 'PANEL', label: 'Panel', manual: true },
  { key: 'NAME', label: 'Name' },
  { key: 'EMAIL', label: 'Email-id' },
  { key: 'PHONE', label: 'Ph No' },
  { key: 'BRANCH', label: 'Branch' },
  { key: 'ACADEMIC', label: 'Academic Score' },
  { key: 'SCORE', label: 'Exam Score' },
  { key: 'TECHNICAL', label: 'Technical Knowledge (10 Marks)', manual: true },
  { key: 'PRESENTATION', label: 'Presentation / Communication Skills (10 Marks)', manual: true },
  { key: 'TOTAL', label: 'Total (20 Marks)', manual: true },
  { key: 'TECH_REVIEW', label: 'Technical Review', manual: true },
  { key: 'HR', label: 'HR', manual: true },
];
const MANUAL_COLUMNS = COLUMNS.filter(c => c.manual);
const MAX_HEADER_LENGTH = 60;
const LOAD_SIZE = 10000;

const EMPTY_ACADEMIC = { selected: null, minCgpa: '', minPct: '' };
const EMPTY_TEST = { selected: null, min: '' };

/* ------------------------------------------------------------------------ */
/* Helpers                                                                   */
/* ------------------------------------------------------------------------ */

function fmtNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/** Academic score of one row: CGPA and percentage are kept apart (never compared to each other). */
function academicOf(r) {
  if (r.aggregateMarks === null || r.aggregateMarks === undefined || r.aggregateMarks === '') {
    return { key: 'BLANK', type: null, value: null, label: '' };
  }
  const value = Number(r.aggregateMarks);
  const cgpa = String(r.academicScoreType || '').toUpperCase() === 'CGPA';
  return {
    key: `${cgpa ? 'C' : 'P'}:${value}`,
    type: cgpa ? 'CGPA' : 'PCT',
    value,
    label: cgpa ? `${fmtNumber(value)} CGPA` : `${fmtNumber(value)}%`,
  };
}

function testKey(r) {
  return r.totalScore === null || r.totalScore === undefined ? 'BLANK' : `S:${r.totalScore}`;
}

function byName(a, b) {
  const c = String(a.fullName || '').localeCompare(String(b.fullName || ''), 'en', { sensitivity: 'base' });
  return c !== 0 ? c : (a.studentId || 0) - (b.studentId || 0);
}

/** Most common paper size (questions per student) of the domain - "Score /80". */
function paperSizeOf(rows) {
  const counts = new Map();
  rows.forEach(r => {
    if (r.paperSize > 0) counts.set(r.paperSize, (counts.get(r.paperSize) || 0) + 1);
  });
  let best = null;
  let bestCount = 0;
  counts.forEach((count, size) => {
    if (count > bestCount || (count === bestCount && size > best)) {
      best = size;
      bestCount = count;
    }
  });
  return best;
}

function parseMin(text) {
  if (text === '' || text === null || text === undefined) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/* ------------------------------------------------------------------------ */
/* Icons                                                                     */
/* ------------------------------------------------------------------------ */

const Ic = {
  Back: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  ),
  Download: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  ),
  Chevron: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  ),
  Funnel: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18l-7 8v6l-4 2v-8L3 4z" />
    </svg>
  ),
  Shield: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
    </svg>
  ),
  Pencil: () => (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.2 5.2l3.6 3.6M4 20l4-1 11-11-3-3L5 16l-1 4z" />
    </svg>
  ),
};

/* ------------------------------------------------------------------------ */
/* Excel-style filter popup                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Search + minimum input(s) + "Select All" + one checkbox per value
 * (+ "(Blanks)"), with Cancel / Apply - like an Excel column filter.
 * Changes only take effect on Apply.
 */
function FilterPopup({ title, groups, selected, mins, onApply, onClose }) {
  const allKeys = useMemo(() => groups.flatMap(g => g.items.map(i => i.key)), [groups]);
  const [draft, setDraft] = useState(() => new Set(selected ?? allKeys));
  const [minDraft, setMinDraft] = useState(() => Object.fromEntries(mins.map(m => [m.key, m.value ?? ''])));
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const visibleGroups = groups
    .map(g => ({ ...g, items: g.items.filter(i => !q || i.label.toLowerCase().includes(q)) }))
    .filter(g => g.items.length > 0);
  const visibleKeys = visibleGroups.flatMap(g => g.items.map(i => i.key));
  const checkedVisible = visibleKeys.filter(k => draft.has(k)).length;
  const allVisibleChecked = visibleKeys.length > 0 && checkedVisible === visibleKeys.length;
  const someVisibleChecked = checkedVisible > 0 && !allVisibleChecked;

  const toggle = key => {
    setDraft(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setError('');
  };

  const toggleAll = () => {
    setDraft(prev => {
      const next = new Set(prev);
      if (allVisibleChecked) visibleKeys.forEach(k => next.delete(k));
      else visibleKeys.forEach(k => next.add(k));
      return next;
    });
    setError('');
  };

  const apply = () => {
    for (const m of mins) {
      const raw = String(minDraft[m.key] ?? '').trim();
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || (m.max !== undefined && n > m.max)) {
        setError(`${m.label} must be between 0 and ${m.max ?? 'the maximum'}.`);
        return;
      }
    }
    if (allKeys.length > 0 && draft.size === 0) {
      setError('Select at least one value.');
      return;
    }
    const everything = allKeys.every(k => draft.has(k));
    const cleanMins = Object.fromEntries(mins.map(m => [m.key, String(minDraft[m.key] ?? '').trim()]));
    onApply({ selected: everything ? null : new Set(draft), mins: cleanMins });
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={`${title} filter`}
        className="fixed inset-x-4 top-24 z-50 sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-80 rounded-2xl border p-4 space-y-3 shadow-xl"
        style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}
      >
        <p className="text-sm font-semibold" style={{ color: 'var(--eb-text)' }}>{title}</p>

        <input
          className="eb-input !py-2 !px-3"
          placeholder="Search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />

        {mins.map(m => (
          <label key={m.key} className="flex items-center justify-between gap-3 text-sm" style={{ color: 'var(--eb-text-muted)' }}>
            <span>{m.label}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max={m.max}
              step={m.step || 'any'}
              className="eb-input !w-24 !py-1.5 !px-2.5 text-right"
              placeholder={m.placeholder || ''}
              value={minDraft[m.key] ?? ''}
              onChange={e => { setMinDraft(prev => ({ ...prev, [m.key]: e.target.value })); setError(''); }}
            />
          </label>
        ))}

        <div className="rounded-xl border max-h-64 overflow-y-auto py-1" style={{ borderColor: 'var(--eb-border)' }}>
          {visibleKeys.length === 0 ? (
            <p className="text-xs px-3 py-3" style={{ color: 'var(--eb-text-faint)' }}>No matching values.</p>
          ) : (
            <>
              <label className="flex items-center gap-2.5 px-3 py-1.5 text-sm font-medium cursor-pointer" style={{ color: 'var(--eb-text)' }}>
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--eb-blue)' }}
                  checked={allVisibleChecked}
                  ref={el => { if (el) el.indeterminate = someVisibleChecked; }}
                  onChange={toggleAll}
                />
                {q ? 'Select All Search Results' : 'Select All'}
              </label>
              {visibleGroups.map(g => (
                <div key={g.title || 'values'}>
                  {g.title && (
                    <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--eb-text-faint)' }}>
                      {g.title}
                    </p>
                  )}
                  {g.items.map(item => (
                    <label key={item.key} className="flex items-center gap-2.5 px-3 py-1.5 text-sm cursor-pointer" style={{ color: 'var(--eb-text)' }}>
                      <input
                        type="checkbox"
                        className="w-4 h-4"
                        style={{ accentColor: 'var(--eb-blue)' }}
                        checked={draft.has(item.key)}
                        onChange={() => toggle(item.key)}
                      />
                      <span className="flex-1">{item.label}</span>
                      <span className="text-xs font-mono" style={{ color: 'var(--eb-text-faint)' }}>{item.count}</span>
                    </label>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>

        {error && <p role="alert" className="text-xs" style={{ color: 'var(--eb-danger)' }}>{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="eb-btn-outline !w-auto !py-2 !px-4 text-xs">Cancel</button>
          <button type="button" onClick={apply} className="eb-btn !w-auto !py-2 !px-4 text-xs">Apply</button>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Centered modal shell                                                      */
/* ------------------------------------------------------------------------ */

function Modal({ title, subtitle, onClose, children, footer }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={title}
        className="w-full max-w-lg rounded-2xl border p-5 space-y-4 max-h-[90vh] flex flex-col"
        style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}
        onClick={e => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-semibold" style={{ color: 'var(--eb-text)' }}>{title}</h3>
          {subtitle && <p className="text-sm mt-1" style={{ color: 'var(--eb-text-muted)' }}>{subtitle}</p>}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Page                                                                      */
/* ------------------------------------------------------------------------ */

export default function ShortlistExport() {
  const { adminKey, collegeId, driveId } = useParams();
  const navigate = useNavigate();

  const [drive, setDrive] = useState(null);
  const [rows, setRows] = useState(null); // submitted students of this drive
  const [loadError, setLoadError] = useState('');
  const [truncated, setTruncated] = useState(false);

  const [domainId, setDomainId] = useState('');
  const [academic, setAcademic] = useState(EMPTY_ACADEMIC);
  const [test, setTest] = useState(EMPTY_TEST);
  const [protectedIds, setProtectedIds] = useState(() => new Set());
  const [headerNames, setHeaderNames] = useState({});

  const [openPopup, setOpenPopup] = useState(null); // 'ACADEMIC' | 'TEST' | 'PROTECTED' | 'HEADERS'
  const [exporting, setExporting] = useState(false);

  const drivePath = collegeId
    ? `/${adminKey}/admin/colleges/${collegeId}/drives/${driveId}`
    : `/${adminKey}/admin/drives/${driveId}`;

  /* ---------------------------------------------------------------------- */
  /* Load: drive + its submitted students (once)                            */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setLoadError('');
    Promise.all([
      axios.get(`/admin/drives/${driveId}`),
      axios.get(`/admin/drives/${driveId}/students`, {
        params: { submissionStatus: 'SUBMITTED', page: 1, size: LOAD_SIZE, sort: 'desc' },
      }),
    ])
      .then(([d, s]) => {
        if (cancelled) return;
        const content = Array.isArray(s.data?.content) ? s.data.content : [];
        setDrive(d.data);
        setRows(content.filter(r => r.submitted));
        setTruncated((s.data?.totalElements ?? content.length) > content.length);
      })
      .catch(err => {
        if (cancelled) return;
        setRows([]);
        setLoadError(err?.response?.data?.message || 'Could not load the students of this drive.');
      });
    return () => { cancelled = true; };
  }, [driveId]);

  const driveNotEnded = useMemo(() => {
    if (!drive?.endTime) return false;
    return Date.now() < new Date(drive.endTime).getTime();
  }, [drive]);

  /* ---------------------------------------------------------------------- */
  /* Domains                                                                */
  /* ---------------------------------------------------------------------- */

  const domains = useMemo(() => {
    const map = new Map();
    (rows || []).forEach(r => {
      if (r.courseId === null || r.courseId === undefined) return;
      const key = String(r.courseId);
      const cur = map.get(key) || { id: key, name: r.courseName || 'Unnamed domain', count: 0 };
      cur.count += 1;
      map.set(key, cur);
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  }, [rows]);

  // Only one domain in the drive -> pick it straight away.
  useEffect(() => {
    if (!domainId && domains.length === 1) setDomainId(domains[0].id);
  }, [domains, domainId]);

  const changeDomain = id => {
    setDomainId(id);
    setAcademic(EMPTY_ACADEMIC);
    setTest(EMPTY_TEST);
    setProtectedIds(new Set());
    setOpenPopup(null);
  };

  const domain = domains.find(d => d.id === domainId) || null;
  const domainRows = useMemo(
    () => (rows || []).filter(r => String(r.courseId) === domainId),
    [rows, domainId]
  );

  /* ---------------------------------------------------------------------- */
  /* Filter values (from this domain's real data)                            */
  /* ---------------------------------------------------------------------- */

  const academicGroups = useMemo(() => {
    const cgpa = new Map();
    const pct = new Map();
    let blanks = 0;
    domainRows.forEach(r => {
      const a = academicOf(r);
      if (a.type === null) { blanks += 1; return; }
      const target = a.type === 'CGPA' ? cgpa : pct;
      const cur = target.get(a.key) || { key: a.key, label: a.label, value: a.value, count: 0 };
      cur.count += 1;
      target.set(a.key, cur);
    });
    const sorted = m => [...m.values()].sort((x, y) => x.value - y.value);
    const groups = [];
    if (cgpa.size) groups.push({ title: 'CGPA', items: sorted(cgpa) });
    if (pct.size) groups.push({ title: 'Percentage', items: sorted(pct) });
    if (blanks) groups.push({ title: '', items: [{ key: 'BLANK', label: '(Blanks)', count: blanks }] });
    return groups;
  }, [domainRows]);

  const hasCgpa = academicGroups.some(g => g.title === 'CGPA');
  const hasPct = academicGroups.some(g => g.title === 'Percentage');

  const testGroups = useMemo(() => {
    const m = new Map();
    let blanks = 0;
    domainRows.forEach(r => {
      const k = testKey(r);
      if (k === 'BLANK') { blanks += 1; return; }
      const cur = m.get(k) || { key: k, label: String(r.totalScore), value: r.totalScore, count: 0 };
      cur.count += 1;
      m.set(k, cur);
    });
    const groups = [{ title: '', items: [...m.values()].sort((x, y) => x.value - y.value) }];
    if (blanks) groups.push({ title: '', items: [{ key: 'BLANK', label: '(Blanks)', count: blanks }] });
    return groups.filter(g => g.items.length);
  }, [domainRows]);

  const paperSize = useMemo(() => paperSizeOf(domainRows), [domainRows]);

  /* ---------------------------------------------------------------------- */
  /* Shortlist                                                               */
  /* ---------------------------------------------------------------------- */

  const academicActive = academic.selected !== null || academic.minCgpa !== '' || academic.minPct !== '';
  const testActive = test.selected !== null || test.min !== '';

  const shortlist = useMemo(() => {
    const minCgpa = parseMin(academic.minCgpa);
    const minPct = parseMin(academic.minPct);
    const minScore = parseMin(test.min);

    const passes = r => {
      const a = academicOf(r);
      if (academic.selected && !academic.selected.has(a.key)) return false;
      // A minimum only applies to students of the same unit; blanks follow the (Blanks) checkbox.
      if (a.type === 'CGPA' && minCgpa !== null && a.value < minCgpa) return false;
      if (a.type === 'PCT' && minPct !== null && a.value < minPct) return false;

      const k = testKey(r);
      if (test.selected && !test.selected.has(k)) return false;
      if (k !== 'BLANK' && minScore !== null && r.totalScore < minScore) return false;
      return true;
    };

    return domainRows
      .filter(r => protectedIds.has(r.studentId) || passes(r))
      .sort(byName);
  }, [domainRows, academic, test, protectedIds]);

  const protectedInList = shortlist.filter(r => protectedIds.has(r.studentId)).length;

  /* ---------------------------------------------------------------------- */
  /* Headers                                                                 */
  /* ---------------------------------------------------------------------- */

  const headerOf = col => {
    if (col.key === 'SCORE') return paperSize ? `Exam Score /${paperSize}` : 'Exam Score';
    if (col.manual) return (headerNames[col.key] || '').trim() || col.label;
    return col.label;
  };

  /* ---------------------------------------------------------------------- */
  /* Export                                                                  */
  /* ---------------------------------------------------------------------- */

  const handleExport = async () => {
    if (!domain || shortlist.length === 0 || exporting) return;
    setExporting(true);
    try {
      const headers = {};
      MANUAL_COLUMNS.forEach(c => {
        const v = (headerNames[c.key] || '').trim();
        if (v) headers[c.key] = v;
      });
      const res = await axios.post(
        `/admin/drives/${driveId}/shortlist/export`,
        { courseId: Number(domain.id), studentIds: shortlist.map(r => r.studentId), headers },
        { responseType: 'blob' }
      );
      const filename = filenameFromDisposition(res.headers?.['content-disposition'], 'Feedback_Sheet.xlsx');
      saveBlob(new Blob([res.data]), filename);
    } catch (err) {
      if (!err?.permissionHandled) notify(await downloadErrorMessage(err), 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* UI                                                                      */
  /* ---------------------------------------------------------------------- */

  const filterButton = (key, label, active, disabled) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setOpenPopup(openPopup === key ? null : key)}
      className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        background: active ? 'var(--eb-blue-soft)' : 'var(--eb-surface)',
        borderColor: active ? 'var(--eb-blue)' : 'var(--eb-border-strong)',
        color: active ? 'var(--eb-blue)' : 'var(--eb-text)',
      }}
    >
      {active && <Ic.Funnel />}
      {label}
      <Ic.Chevron />
    </button>
  );

  const clearFilters = () => {
    setAcademic(EMPTY_ACADEMIC);
    setTest(EMPTY_TEST);
  };

  const driveDate = drive?.date
    ? new Date(`${drive.date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate(drivePath)}
        className="flex items-center gap-1.5 text-sm font-medium"
        style={{ color: 'var(--eb-blue)' }}
      >
        <Ic.Back />
        Back to Drive Details
      </button>

      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--eb-text)' }}>Shortlist &amp; Export</h1>
        {drive && (
          <p className="text-sm mt-1" style={{ color: 'var(--eb-text-muted)' }}>
            {drive.examCode} · {drive.collegeName}{driveDate ? ` · ${driveDate}` : ''}
          </p>
        )}
      </div>

      {rows === null ? (
        <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
          <RowSkeleton rows={8} />
        </div>
      ) : loadError ? (
        <div className="rounded-2xl p-5 border text-sm" style={{ background: 'var(--eb-danger-soft)', borderColor: 'var(--eb-border)', color: 'var(--eb-danger)' }}>
          {loadError}
        </div>
      ) : driveNotEnded ? (
        <div className="rounded-2xl p-5 border text-sm" style={{ background: 'var(--eb-warning-soft)', borderColor: 'var(--eb-border)', color: 'var(--eb-warning)' }}>
          Shortlisting is available after the drive ends.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl p-5 border text-sm" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)', color: 'var(--eb-text-muted)' }}>
          No student has submitted the test in this drive.
        </div>
      ) : (
        <>
          {/* Filters ------------------------------------------------------ */}
          <div className="rounded-2xl p-4 sm:p-5 border space-y-4" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-full sm:w-64">
                <label className="eb-label" htmlFor="shortlist-domain">Domain</label>
                <select
                  id="shortlist-domain"
                  className="eb-input !py-2 !px-3"
                  value={domainId}
                  onChange={e => changeDomain(e.target.value)}
                >
                  <option value="">Select domain</option>
                  {domains.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.count})</option>
                  ))}
                </select>
              </div>

              <div className="relative">
                {filterButton('ACADEMIC', 'Academic Score', academicActive, !domain)}
                {openPopup === 'ACADEMIC' && (
                  <FilterPopup
                    title="Academic Score"
                    groups={academicGroups}
                    selected={academic.selected}
                    mins={[
                      ...(hasCgpa ? [{ key: 'minCgpa', label: 'Minimum CGPA', value: academic.minCgpa, max: 10, step: '0.01', placeholder: '7.0' }] : []),
                      ...(hasPct ? [{ key: 'minPct', label: 'Minimum Percentage', value: academic.minPct, max: 100, step: '0.01', placeholder: '70' }] : []),
                    ]}
                    onApply={({ selected, mins }) => {
                      setAcademic({ selected, minCgpa: mins.minCgpa ?? '', minPct: mins.minPct ?? '' });
                      setOpenPopup(null);
                    }}
                    onClose={() => setOpenPopup(null)}
                  />
                )}
              </div>

              <div className="relative">
                {filterButton('TEST', 'Test Score', testActive, !domain)}
                {openPopup === 'TEST' && (
                  <FilterPopup
                    title="Test Score"
                    groups={testGroups}
                    selected={test.selected}
                    mins={[{ key: 'min', label: 'Minimum', value: test.min, max: paperSize || undefined, step: '1', placeholder: '60' }]}
                    onApply={({ selected, mins }) => {
                      setTest({ selected, min: mins.min ?? '' });
                      setOpenPopup(null);
                    }}
                    onClose={() => setOpenPopup(null)}
                  />
                )}
              </div>

              <button
                type="button"
                disabled={!domain}
                onClick={() => setOpenPopup('PROTECTED')}
                className="flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: protectedIds.size ? 'var(--eb-orange-soft)' : 'var(--eb-surface)',
                  borderColor: protectedIds.size ? 'var(--eb-orange)' : 'var(--eb-border-strong)',
                  color: protectedIds.size ? 'var(--eb-orange)' : 'var(--eb-text)',
                }}
              >
                <Ic.Shield />
                Mandatory / Protected{protectedIds.size ? ` (${protectedIds.size})` : ''}
              </button>

              {(academicActive || testActive) && (
                <button type="button" onClick={clearFilters} className="text-sm font-medium px-1 py-2" style={{ color: 'var(--eb-blue)' }}>
                  Clear filters
                </button>
              )}
            </div>

            {truncated && (
              <p className="text-xs" style={{ color: 'var(--eb-warning)' }}>
                This drive has more than {LOAD_SIZE.toLocaleString('en-IN')} submitted students; only the first {LOAD_SIZE.toLocaleString('en-IN')} are loaded.
              </p>
            )}
          </div>

          {!domain ? (
            <div className="rounded-2xl p-6 border text-sm text-center" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)', color: 'var(--eb-text-muted)' }}>
              Select a domain to start shortlisting.
            </div>
          ) : (
            <div className="rounded-2xl p-4 sm:p-5 border space-y-4" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
              {/* Count + actions ------------------------------------------ */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-bold" style={{ color: 'var(--eb-text)' }}>
                    Showing <span style={{ color: 'var(--eb-blue)' }}>{shortlist.length}</span> of {domainRows.length} students
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--eb-text-muted)' }}>
                    {domain.name}
                    {protectedInList ? ` · includes ${protectedInList} protected` : ''}
                    {' · '}sorted by name
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenPopup('HEADERS')}
                    className="eb-btn-outline !w-auto !py-2 !px-3.5 text-xs flex items-center gap-1.5"
                  >
                    <Ic.Pencil />
                    Column names
                  </button>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={shortlist.length === 0 || exporting}
                    className="eb-btn !w-auto !py-2 !px-4 text-xs"
                  >
                    <Ic.Download />
                    {exporting ? 'Exporting…' : 'Export'}
                  </button>
                </div>
              </div>

              {/* Table -------------------------------------------------------- */}
              {shortlist.length === 0 ? (
                <p className="text-sm py-8 text-center" style={{ color: 'var(--eb-text-muted)' }}>
                  No students match these filters.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--eb-border)' }}>
                  <table className="w-full text-left text-sm min-w-[1400px]">
                    <thead>
                      <tr style={{ background: 'var(--eb-surface-muted)' }}>
                        {COLUMNS.map(col => (
                          <th
                            key={col.key}
                            className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide align-bottom"
                            style={{ color: 'var(--eb-text-muted)', borderBottom: '1px solid var(--eb-border)' }}
                          >
                            {headerOf(col)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shortlist.map((r, idx) => {
                        const isProtected = protectedIds.has(r.studentId);
                        const a = academicOf(r);
                        return (
                          <tr
                            key={r.studentId}
                            style={{
                              background: isProtected ? 'var(--eb-orange-soft)' : 'transparent',
                              borderTop: idx === 0 ? 'none' : '1px solid var(--eb-border)',
                            }}
                          >
                            <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--eb-text-muted)' }}>{idx + 1}</td>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" style={{ color: 'var(--eb-text)' }}>
                              <span className="font-medium">{r.fullName}</span>
                              {isProtected && (
                                <span
                                  className="ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                                  style={{ background: 'var(--eb-surface)', color: 'var(--eb-orange)', border: '1px solid var(--eb-orange)' }}
                                >
                                  <Ic.Shield /> Protected
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2" style={{ color: 'var(--eb-text-muted)' }}>{r.email}</td>
                            <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--eb-text-muted)' }}>{r.phoneNumber}</td>
                            <td className="px-3 py-2" style={{ color: 'var(--eb-text-muted)' }}>{r.branch}</td>
                            <td className="px-3 py-2" style={{ color: 'var(--eb-text)' }}>{a.label}</td>
                            <td className="px-3 py-2 font-semibold" style={{ color: 'var(--eb-text)' }}>{r.totalScore ?? ''}</td>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2" />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {openPopup === 'PROTECTED' && domain && (
        <ProtectedModal
          rows={domainRows}
          selected={protectedIds}
          onSave={ids => { setProtectedIds(ids); setOpenPopup(null); }}
          onClose={() => setOpenPopup(null)}
        />
      )}

      {openPopup === 'HEADERS' && (
        <HeaderNamesModal
          values={headerNames}
          onSave={v => { setHeaderNames(v); setOpenPopup(null); }}
          onClose={() => setOpenPopup(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Mandatory / Protected students                                            */
/* ------------------------------------------------------------------------ */

function ProtectedModal({ rows, selected, onSave, onClose }) {
  const [draft, setDraft] = useState(() => new Set(selected));
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const list = useMemo(() => {
    const sorted = [...rows].sort(byName);
    if (!q) return sorted;
    return sorted.filter(r =>
      String(r.fullName || '').toLowerCase().includes(q) ||
      String(r.email || '').toLowerCase().includes(q) ||
      String(r.phoneNumber || '').includes(q)
    );
  }, [rows, q]);

  const toggle = id => setDraft(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <Modal
      title="Mandatory / Protected students"
      subtitle="Protected students always stay in the shortlist, even if the filters would remove them."
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="eb-btn-outline !w-auto !py-2 !px-4 text-xs">Cancel</button>
          <button type="button" onClick={() => onSave(draft)} className="eb-btn !w-auto !py-2 !px-4 text-xs">
            Save ({draft.size})
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <input
          className="eb-input !py-2 !px-3"
          placeholder="Search by name, email or phone"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        <div className="rounded-xl border divide-y" style={{ borderColor: 'var(--eb-border)' }}>
          {list.length === 0 ? (
            <p className="text-xs px-3 py-3" style={{ color: 'var(--eb-text-faint)' }}>No matching students.</p>
          ) : list.map(r => {
            const on = draft.has(r.studentId);
            return (
              <label
                key={r.studentId}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer"
                style={{ background: on ? 'var(--eb-orange-soft)' : 'transparent', borderColor: 'var(--eb-border)' }}
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 flex-shrink-0"
                  style={{ accentColor: 'var(--eb-orange)' }}
                  checked={on}
                  onChange={() => toggle(r.studentId)}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate" style={{ color: 'var(--eb-text)' }}>{r.fullName}</span>
                  <span className="block text-xs truncate" style={{ color: 'var(--eb-text-muted)' }}>
                    {r.email}{r.phoneNumber ? ` · ${r.phoneNumber}` : ''}
                  </span>
                </span>
                <span className="text-xs text-right flex-shrink-0" style={{ color: 'var(--eb-text-muted)' }}>
                  Score {r.totalScore ?? '—'}
                  <span className="block">{academicOf(r).label || '—'}</span>
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------------ */
/* Rename the empty interview columns                                        */
/* ------------------------------------------------------------------------ */

function HeaderNamesModal({ values, onSave, onClose }) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(MANUAL_COLUMNS.map(c => [c.key, values[c.key] || c.label]))
  );

  const save = () => {
    const out = {};
    MANUAL_COLUMNS.forEach(c => {
      const v = String(draft[c.key] || '').replace(/\s+/g, ' ').trim().slice(0, MAX_HEADER_LENGTH);
      if (v && v !== c.label) out[c.key] = v;
    });
    onSave(out);
  };

  return (
    <Modal
      title="Column names"
      subtitle="Rename the empty columns for the exported sheet. A blank name goes back to the default."
      onClose={onClose}
      footer={(
        <>
          <button
            type="button"
            onClick={() => setDraft(Object.fromEntries(MANUAL_COLUMNS.map(c => [c.key, c.label])))}
            className="eb-btn-outline !w-auto !py-2 !px-4 text-xs mr-auto"
          >
            Reset to default
          </button>
          <button type="button" onClick={onClose} className="eb-btn-outline !w-auto !py-2 !px-4 text-xs">Cancel</button>
          <button type="button" onClick={save} className="eb-btn !w-auto !py-2 !px-4 text-xs">Save</button>
        </>
      )}
    >
      <div className="space-y-3">
        {MANUAL_COLUMNS.map(c => (
          <div key={c.key}>
            <label className="eb-label" htmlFor={`col-${c.key}`}>{c.label}</label>
            <input
              id={`col-${c.key}`}
              className="eb-input !py-2 !px-3"
              maxLength={MAX_HEADER_LENGTH}
              value={draft[c.key] ?? ''}
              placeholder={c.label}
              onChange={e => setDraft(prev => ({ ...prev, [c.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
    </Modal>
  );
}

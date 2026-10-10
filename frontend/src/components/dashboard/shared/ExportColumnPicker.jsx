import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../utils/api';

/* Same rule as the server: starts with a letter; letters, numbers, spaces, - _ ; 2–30 chars. */
const NAME_RULE = /^[A-Za-z][A-Za-z0-9 _-]{1,29}$/;

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Column picker for the export popups.
 *
 * - Click a column to add it; the click order is the Excel column order
 *   (S.No is always column 1). Click again to remove it.
 * - Nothing selected = the default columns are exported.
 * - Personal shortcuts (max 5 per export type): one click selects a saved
 *   column set. Create and delete only. Only the logged-in person sees them.
 *
 * Props:
 *   type            'DRIVE' | 'STUDENTS'
 *   courseFiltered  a course filter applies (Course is then not a default column)
 *   collegeFiltered a college filter applies (College is then not a default column)
 *   value/onChange  selected column keys, in order
 */
export default function ExportColumnPicker({ type, courseFiltered = false, collegeFiltered = false, value, onChange, disabled }) {
  const [fields, setFields] = useState([]);
  const [defaults, setDefaults] = useState([]);
  const [maxShortcuts, setMaxShortcuts] = useState(5);
  const [shortcuts, setShortcuts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [saving, setSaving] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState('');
  const [saveError, setSaveError] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // Only the first load shows "Loading"; later reloads (filter flags changed) keep the list on screen.
    if (!loadedOnce.current) setLoading(true);
    setLoadError('');
    Promise.all([
      api.get('/admin/export-columns', { params: { type, courseFiltered, collegeFiltered } }),
      api.get('/admin/export-shortcuts', { params: { type } }),
    ])
      .then(([cols, sc]) => {
        if (cancelled) return;
        setFields(cols.data?.fields || []);
        setDefaults(cols.data?.defaults || []);
        setMaxShortcuts(cols.data?.maxShortcuts || 5);
        setShortcuts(Array.isArray(sc.data) ? sc.data : []);
        loadedOnce.current = true;
      })
      .catch(() => { if (!cancelled) setLoadError('Could not load the column list. The default columns will be used.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type, courseFiltered, collegeFiltered]);

  const labelOf = useMemo(() => Object.fromEntries(fields.map(f => [f.key, f.label])), [fields]);
  const atLimit = shortcuts.length >= maxShortcuts;

  const toggle = key => {
    if (disabled) return;
    onChange(value.includes(key) ? value.filter(k => k !== key) : [...value, key]);
  };

  const applyShortcut = sc => {
    if (disabled) return;
    setConfirmDeleteId(null);
    onChange(sc.columns.filter(k => labelOf[k]));
  };

  const trimmedName = name.trim().replace(/\s+/g, ' ');
  const nameProblem = !trimmedName
    ? ''
    : !NAME_RULE.test(trimmedName)
      ? 'Start with a letter; use letters, numbers, spaces, - or _ (2–30 characters).'
      : shortcuts.some(s => s.name.toLowerCase() === trimmedName.toLowerCase())
        ? 'You already have a shortcut with this name.'
        : '';

  const saveShortcut = async () => {
    if (!trimmedName || nameProblem || !value.length || atLimit) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await api.post('/admin/export-shortcuts', { type, name: trimmedName, columns: value });
      setShortcuts(list => [...list, res.data]);
      setShowSave(false);
      setName('');
    } catch (e) {
      setSaveError(e.response?.data?.message || 'Could not save the shortcut.');
    } finally {
      setSaving(false);
    }
  };

  const deleteShortcut = async id => {
    setDeleting(true);
    try {
      await api.delete(`/admin/export-shortcuts/${id}`);
      setShortcuts(list => list.filter(s => s.id !== id));
      setConfirmDeleteId(null);
    } catch (e) {
      setSaveError(e.response?.data?.message || 'Could not delete the shortcut.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <p className="text-xs" style={{ color: 'var(--eb-text-faint)' }}>Loading columns…</p>;
  }
  if (loadError) {
    return <p className="text-xs" style={{ color: 'var(--eb-text-muted)' }}>{loadError}</p>;
  }

  const muted = { color: 'var(--eb-text-muted)' };
  const faint = { color: 'var(--eb-text-faint)' };

  return (
    <div className="space-y-4">
      {/* ── Shortcuts ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <p className="eb-label !mb-0">My shortcuts</p>
          <span className="text-[11px] tabular-nums" style={faint}>{shortcuts.length}/{maxShortcuts}</span>
        </div>
        {shortcuts.length === 0 ? (
          <p className="text-xs" style={faint}>No shortcuts yet. Pick columns below and save them as a shortcut.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {shortcuts.map(sc => {
              const active = sc.columns.length > 0 && sameList(sc.columns, value);
              if (confirmDeleteId === sc.id) {
                return (
                  <span key={sc.id} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
                    style={{ borderColor: 'var(--eb-danger)', background: 'var(--eb-danger-soft)', color: 'var(--eb-danger)' }}>
                    Delete “{sc.name}”?
                    <button type="button" className="font-semibold underline" disabled={deleting} onClick={() => deleteShortcut(sc.id)}>
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                    <button type="button" className="font-medium" disabled={deleting} onClick={() => setConfirmDeleteId(null)} style={muted}>Cancel</button>
                  </span>
                );
              }
              return (
                <span key={sc.id} className="inline-flex items-center rounded-full border text-xs overflow-hidden"
                  style={{
                    borderColor: active ? 'var(--eb-blue)' : 'var(--eb-border)',
                    background: active ? 'var(--eb-blue-soft)' : 'var(--eb-surface)',
                  }}>
                  <button type="button" disabled={disabled || sc.columns.length === 0} onClick={() => applyShortcut(sc)}
                    className="pl-3 pr-2 py-1 font-medium disabled:opacity-50"
                    style={{ color: active ? 'var(--eb-blue)' : 'var(--eb-text)' }}
                    title={sc.columns.map(k => labelOf[k]).filter(Boolean).join(' → ') || 'All columns of this shortcut were removed'}>
                    {sc.name}
                  </button>
                  <button type="button" disabled={disabled} onClick={() => setConfirmDeleteId(sc.id)}
                    className="pr-2.5 pl-1 py-1 leading-none" style={faint} aria-label={`Delete shortcut ${sc.name}`} title="Delete shortcut">
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Columns (click order = column order) ───────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <p className="eb-label !mb-0">Columns</p>
          {value.length > 0 && (
            <button type="button" className="text-[11px] font-medium" style={{ color: 'var(--eb-blue)' }} disabled={disabled} onClick={() => onChange([])}>
              Clear selection
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">
          {fields.map(f => {
            const pos = value.indexOf(f.key);
            const on = pos >= 0;
            return (
              <button key={f.key} type="button" onClick={() => toggle(f.key)} disabled={disabled} aria-pressed={on}
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
                style={{
                  borderColor: on ? 'var(--eb-blue)' : 'var(--eb-border)',
                  background: on ? 'var(--eb-blue-soft)' : 'var(--eb-surface)',
                  color: on ? 'var(--eb-blue)' : 'var(--eb-text)',
                }}>
                {on && (
                  <span className="min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] font-bold inline-flex items-center justify-center tabular-nums"
                    style={{ background: 'var(--eb-blue)', color: '#fff' }}>
                    {pos + 2}
                  </span>
                )}
                {f.label}
              </button>
            );
          })}
        </div>

        <p className="text-[11px] mt-2 leading-relaxed" style={faint}>
          {value.length === 0
            ? <>Nothing selected – the default columns will be exported: <span style={muted}>S.No, {defaults.map(k => labelOf[k]).filter(Boolean).join(', ')}</span></>
            : <>Column order: <span style={muted}>1 S.No, {value.map((k, i) => `${i + 2} ${labelOf[k] || k}`).join(', ')}</span></>}
        </p>
      </div>

      {/* ── Save as shortcut ───────────────────────────────────────── */}
      {!showSave ? (
        <div>
          <button type="button"
            disabled={disabled || atLimit || value.length === 0}
            onClick={() => { setShowSave(true); setSaveError(''); }}
            className="text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: 'var(--eb-blue)' }}>
            + Save these columns as a shortcut
          </button>
          {atLimit && <p className="text-[11px] mt-1" style={faint}>You have {maxShortcuts} shortcuts. Delete one to save a new one.</p>}
          {saveError && <p className="text-[11px] mt-1" style={{ color: 'var(--eb-danger)' }}>{saveError}</p>}
        </div>
      ) : (
        <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: 'var(--eb-border)', background: 'var(--eb-surface-muted)' }}>
          <label htmlFor="shortcut-name" className="eb-label !mb-0">Shortcut name</label>
          <div className="flex gap-2">
            <input id="shortcut-name" className="eb-input flex-1 !py-2" value={name} maxLength={30} autoFocus
              onChange={e => { setName(e.target.value); setSaveError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveShortcut(); } }}
              placeholder="e.g. Results short list" />
            <button type="button" className="eb-btn !w-auto !px-4 !py-2 text-xs"
              disabled={saving || !trimmedName || !!nameProblem} onClick={saveShortcut}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="text-xs font-medium px-2" style={muted}
              onClick={() => { setShowSave(false); setName(''); setSaveError(''); }}>
              Cancel
            </button>
          </div>
          {(nameProblem || saveError) && (
            <p className="text-[11px]" style={{ color: 'var(--eb-danger)' }}>{nameProblem || saveError}</p>
          )}
        </div>
      )}
    </div>
  );
}

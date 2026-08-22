import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../utils/api';

const Ic = {
  Back: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>),
  Trash: () => (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/></svg>),
  Undo: () => (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a5 5 0 015 5v1M3 10l4-4M3 10l4 4"/></svg>),
  Plus: () => (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>),
};

/* ── Text field row (brand panel heading/subtitle/features) ───────────── */
function TextFieldRow({ field, onSaved }) {
  const [value, setValue] = useState(field.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = value !== field.value;
  const isLong = field.key.endsWith('_DESC');

  const save = async () => {
    if (!value.trim()) { setError('Cannot be empty.'); return; }
    setBusy(true); setError('');
    try {
      await axios.put(`/admin/site-content/${field.key}`, { value: value.trim() });
      onSaved();
    } catch {
      setError('Save failed. Please try again.');
    } finally { setBusy(false); }
  };

  const reset = async () => {
    setBusy(true); setError('');
    try {
      await axios.delete(`/admin/site-content/${field.key}`);
      onSaved();
    } catch {
      setError('Could not reset this field.');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border p-3.5 space-y-2" style={{ background: 'var(--eb-surface-muted)', borderColor: 'var(--eb-border)' }}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold" style={{ color: 'var(--eb-text)' }}>{field.label}</label>
        {field.isCustom && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full" style={{ background: 'var(--eb-success-soft)', color: 'var(--eb-success)' }}>Custom</span>
        )}
      </div>
      {isLong ? (
        <textarea value={value} onChange={e => setValue(e.target.value)} rows={2}
          className="w-full text-sm px-3 py-2 rounded-lg resize-none"
          style={{ background: 'var(--eb-surface)', border: '1px solid var(--eb-border)', color: 'var(--eb-text)' }} />
      ) : (
        <input value={value} onChange={e => setValue(e.target.value)}
          className="w-full text-sm px-3 py-2 rounded-lg"
          style={{ background: 'var(--eb-surface)', border: '1px solid var(--eb-border)', color: 'var(--eb-text)' }} />
      )}
      {error && <p className="text-xs" style={{ color: 'var(--eb-danger)' }}>{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={busy || !dirty} className="eb-btn !w-auto !py-1.5 !px-3 text-xs disabled:opacity-40">
          {busy ? 'Saving…' : 'Save'}
        </button>
        {field.isCustom && (
          <button onClick={reset} disabled={busy} className="!w-auto !py-1.5 !px-3 text-xs rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-40" style={{ color: 'var(--eb-text-faint)' }}>
            <Ic.Undo /> Reset to default
          </button>
        )}
      </div>
    </div>
  );
}

/* ── One dropdown list (Domain / Qualification / Year of Passing) ─────── */
function DropdownListCard({ listKey, label, hint }) {
  const [options, setOptions] = useState(null);
  const [newValue, setNewValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    axios.get('/admin/dropdown-options', { params: { listKey } })
      .then(res => setOptions(Array.isArray(res.data) ? res.data : []))
      .catch(() => setOptions([]));
  }, [listKey]);

  useEffect(() => { load(); }, [load]);

  const addOption = async () => {
    if (!newValue.trim()) return;
    setBusy(true); setError('');
    try {
      await axios.post('/admin/dropdown-options', { listKey, value: newValue.trim() });
      setNewValue('');
      load();
    } catch {
      setError('Could not add this option.');
    } finally { setBusy(false); }
  };

  const removeOption = async (opt) => {
    // Options still showing the built-in defaults (id === null) can't be
    // deleted individually - deleting one default silently would leave
    // the others in an unclear "half customised" state. Adding any new
    // option first promotes the whole list to admin-managed, after which
    // every entry (including former defaults) gets a real id and can be
    // removed individually.
    if (opt.id == null) return;
    setBusy(true); setError('');
    try {
      await axios.delete(`/admin/dropdown-options/${opt.id}`);
      load();
    } catch {
      setError('Could not remove this option.');
    } finally { setBusy(false); }
  };

  const isDefaultPreview = options?.length > 0 && options[0].id == null;

  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
      <div>
        <h4 className="text-sm font-semibold" style={{ color: 'var(--eb-text)' }}>{label}</h4>
        <p className="text-xs mt-0.5" style={{ color: 'var(--eb-text-faint)' }}>{hint}</p>
      </div>

      {isDefaultPreview && (
        <p className="text-[11px] rounded-lg px-2.5 py-1.5" style={{ background: 'var(--eb-warning-soft)', color: 'var(--eb-warning)' }}>
          Showing built-in defaults — add an option below to start customising this list.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {options === null ? (
          <span className="text-xs" style={{ color: 'var(--eb-text-faint)' }}>Loading…</span>
        ) : options.length === 0 ? (
          <span className="text-xs" style={{ color: 'var(--eb-text-faint)' }}>No options yet.</span>
        ) : options.map((opt, i) => (
          <span key={opt.id ?? `default-${i}`}
            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full"
            style={{ background: 'var(--eb-surface-muted)', border: '1px solid var(--eb-border)', color: 'var(--eb-text)' }}>
            {opt.value}
            {opt.id != null && (
              <button onClick={() => removeOption(opt)} disabled={busy} aria-label={`Remove ${opt.value}`}
                style={{ color: 'var(--eb-danger)' }} className="disabled:opacity-40">
                <Ic.Trash />
              </button>
            )}
          </span>
        ))}
      </div>

      {error && <p className="text-xs" style={{ color: 'var(--eb-danger)' }}>{error}</p>}

      <div className="flex items-center gap-2">
        <input value={newValue} onChange={e => setNewValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addOption()}
          placeholder="Add a new option…"
          className="flex-1 text-sm px-3 py-2 rounded-lg"
          style={{ background: 'var(--eb-surface-muted)', border: '1px solid var(--eb-border)', color: 'var(--eb-text)' }} />
        <button onClick={addOption} disabled={busy || !newValue.trim()}
          className="eb-btn !w-auto !py-2 !px-3 text-xs flex items-center gap-1 disabled:opacity-40">
          <Ic.Plus /> Add
        </button>
      </div>
    </div>
  );
}

/**
 * Admin Registration Page Content - reachable via Profile drawer -> "Edit
 * Registration Page Data" (below "Edit Exam Banners", same placement
 * pattern). Manages the two things that were previously hardcoded in
 * Register.jsx/Login.jsx: the shared brand-panel text, and the three
 * Registration dropdown option lists (Domain, Qualification, Year of
 * Passing). Both pages read these live via public endpoints.
 */
export default function AdminRegistrationContent() {
  const { adminKey } = useParams();
  const navigate = useNavigate();
  const [fields, setFields] = useState(null);

  const loadFields = useCallback(() => {
    axios.get('/admin/site-content')
      .then(res => setFields(Array.isArray(res.data) ? res.data : []))
      .catch(() => setFields([]));
  }, []);

  useEffect(() => { loadFields(); }, [loadFields]);

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(`/${adminKey}/admin/overview`)} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--eb-blue)' }}>
        <Ic.Back /> Back to Overview
      </button>

      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--eb-text)' }}>Registration Page Content</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--eb-text-muted)' }}>
          Manage the text shown on the left side of the Register and Login pages, and the dropdown options
          students choose from during registration (Domain, Qualification, Year of Passing). Both pages
          reflect changes made here immediately — no code changes needed.
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--eb-text-faint)' }}>Brand Panel Text</h3>
        {fields === null ? (
          <p className="text-sm" style={{ color: 'var(--eb-text-muted)' }}>Loading…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fields.map(f => <TextFieldRow key={f.key} field={f} onSaved={loadFields} />)}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--eb-text-faint)' }}>Registration Dropdown Lists</h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <DropdownListCard listKey="DOMAIN" label="Domain / Branch" hint="Shown on the Registration form." />
          <DropdownListCard listKey="QUALIFICATION" label="Highest Qualification" hint="Shown on the Registration form." />
          <DropdownListCard listKey="YEAR_OF_PASSING" label="Year of Passing" hint="Students can still type a custom year via 'Other' on the form itself." />
        </div>
      </div>
    </div>
  );
}

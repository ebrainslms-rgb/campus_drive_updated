import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../utils/api';

const Ic = {
  Back: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>),
};

function SettingRow({ field, onSaved }) {
  const [value, setValue] = useState(field.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = value !== field.value;

  const save = async () => {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 1 || n > 30) { setError('Enter a whole number between 1 and 30.'); return; }
    setBusy(true); setError('');
    try {
      await axios.put(`/admin/exam-settings/${field.key}`, { value: String(n) });
      onSaved();
    } catch {
      setError('Save failed. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border p-5 space-y-3 max-w-md" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
      <div>
        <h4 className="text-sm font-semibold" style={{ color: 'var(--eb-text)' }}>{field.label}</h4>
        {field.isCustom && (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full inline-block mt-1" style={{ background: 'var(--eb-success-soft)', color: 'var(--eb-success)' }}>Custom</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input type="number" min="1" value={value} onChange={e => setValue(e.target.value)}
          className="w-24 text-sm px-3 py-2 rounded-lg"
          style={{ background: 'var(--eb-surface-muted)', border: '1px solid var(--eb-border)', color: 'var(--eb-text)' }} />
        <span className="text-xs" style={{ color: 'var(--eb-text-muted)' }}>minutes</span>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--eb-danger)' }}>{error}</p>}
      <button onClick={save} disabled={busy || !dirty} className="eb-btn !w-auto !py-2 !px-4 text-xs disabled:opacity-40">
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

/**
 * Admin Exam Settings - currently just the manual submit window (how many
 * minutes before the exam's scheduled end the manual "Submit" button
 * becomes available to students; was previously hardcoded to 5). Reachable
 * from the admin Profile drawer, same placement pattern as Exam Banners
 * and Registration Page Content.
 */
export default function AdminExamSettings() {
  const { adminKey } = useParams();
  const navigate = useNavigate();
  const [fields, setFields] = useState(null);

  const load = useCallback(() => {
    axios.get('/admin/exam-settings')
      .then(res => setFields(Array.isArray(res.data) ? res.data : []))
      .catch(() => setFields([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(`/${adminKey}/admin/overview`)} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--eb-blue)' }}>
        <Ic.Back /> Back to Overview
      </button>

      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--eb-text)' }}>Exam Settings</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--eb-text-muted)' }}>
          Controls exam-taking behaviour across every drive. Changes apply immediately to students currently taking an exam.
        </p>
      </div>

      {fields === null ? (
        <p className="text-sm" style={{ color: 'var(--eb-text-muted)' }}>Loading…</p>
      ) : (
        fields.map(f => <SettingRow key={f.key} field={f} onSaved={load} />)
      )}
    </div>
  );
}

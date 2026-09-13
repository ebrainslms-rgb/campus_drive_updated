import React, { useState, useEffect } from 'react';

/**
 * Export confirmation with three explicit scope choices - Current Page,
 * All Filtered Students, All Students. Nothing is pre-selected; the admin
 * must pick one before Confirm Export becomes clickable, so a click can
 * never silently default to "only the visible page" for a large dataset.
 *
 * `options`: [{ key: 'CURRENT_PAGE', label: 'Current Page', count: 50 }, ...]
 * `onConfirm(selectedKey)` - caller decides what each key means server-side.
 */
export default function ExportModal({ open, onClose, onConfirm, options = [], filterSummary = [] }) {
  const [selected, setSelected] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (open) setSelected(null); // never carry over a previous selection
  }, [open]);

  if (!open) return null;

  const handleDownload = async () => {
    if (!selected) return;
    setDownloading(true);
    try {
      await onConfirm(selected);
      onClose();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-2xl border shadow-2xl p-6 space-y-5"
        style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
        <div>
          <h3 className="text-base font-semibold" style={{ color: 'var(--eb-text)' }}>Export Students</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--eb-text-muted)' }}>
            Choose exactly what to export.
          </p>
        </div>

        <div className="space-y-2">
          {options.map((opt) => {
            const disabled = opt.count === 0;
            const isSelected = selected === opt.key;
            return (
              <label key={opt.key}
                className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors"
                style={{
                  background: isSelected ? 'var(--eb-blue-soft)' : 'var(--eb-surface-muted)',
                  borderColor: isSelected ? 'var(--eb-blue)' : 'var(--eb-border)',
                  opacity: disabled ? 0.5 : 1,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                }}>
                <input type="radio" name="export-mode" checked={isSelected} disabled={disabled}
                  onChange={() => setSelected(opt.key)}
                  style={{ accentColor: 'var(--eb-blue)' }} className="w-4 h-4 flex-shrink-0" />
                <div className="flex-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--eb-text)' }}>{opt.label}</span>
                  <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--eb-text-faint)' }}>
                    {opt.count} student{opt.count !== 1 ? 's' : ''}
                  </span>
                </div>
              </label>
            );
          })}
        </div>

        {filterSummary.length > 0 && (
          <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'var(--eb-surface-muted)' }}>
            {filterSummary.map((f, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span style={{ color: 'var(--eb-text-faint)' }}>{f.label}</span>
                <span className="font-medium" style={{ color: 'var(--eb-text)' }}>{f.value}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} disabled={downloading} className="eb-btn-outline !py-2.5">Cancel</button>
          <button onClick={handleDownload} disabled={downloading || !selected} className="eb-btn !py-2.5">
            {downloading ? <><span className="spinner" />Preparing…</> : 'Confirm Export'}
          </button>
        </div>
      </div>
    </div>
  );
}

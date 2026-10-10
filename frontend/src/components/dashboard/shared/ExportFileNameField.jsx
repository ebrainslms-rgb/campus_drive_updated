import React from 'react';
import { INVALID_FILENAME_CHARS } from '../../../utils/download';

/**
 * Optional export file name. Left empty, the server uses the default shown
 * underneath (Course - College code - Date).
 */
export default function ExportFileNameField({ value, onChange, defaultName, loadingDefault, disabled, hint }) {
  const hasInvalid = INVALID_FILENAME_CHARS.test(value);
  const defaultBase = (defaultName || '').replace(/\.xlsx$/i, '');

  return (
    <div>
      <label htmlFor="export-file-name" className="eb-label">File name (optional)</label>
      <div className="flex items-stretch rounded-xl border overflow-hidden focus-within:ring-2 focus-within:ring-blue-500"
        style={{ borderColor: hasInvalid ? 'var(--eb-danger)' : 'var(--eb-border)', background: 'var(--eb-surface)' }}>
        <input id="export-file-name" type="text" value={value} disabled={disabled} maxLength={150}
          onChange={e => onChange(e.target.value)}
          placeholder={defaultBase || 'Uses the default name'}
          className="flex-1 min-w-0 px-3 py-2.5 text-sm bg-transparent outline-none"
          style={{ color: 'var(--eb-text)' }}
          aria-describedby="export-file-name-help" autoComplete="off" />
        <span className="px-3 flex items-center text-sm border-l" style={{ color: 'var(--eb-text-faint)', borderColor: 'var(--eb-border)', background: 'var(--eb-surface-muted)' }}>.xlsx</span>
      </div>
      <p id="export-file-name-help" className="text-xs mt-1.5 leading-relaxed" style={{ color: hasInvalid ? 'var(--eb-danger)' : 'var(--eb-text-faint)' }}>
        {hasInvalid
          ? 'These characters are replaced with _ in the file name: \\ / : * ? " < > |'
          : hint || (loadingDefault
            ? 'Working out the default name…'
            : defaultBase ? <>Leave empty to use <span style={{ color: 'var(--eb-text-muted)' }}>{defaultBase}.xlsx</span></> : 'Choose an export option to see the default name.')}
      </p>
    </div>
  );
}

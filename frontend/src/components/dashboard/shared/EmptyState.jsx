import React from 'react';

export default function EmptyState({ message = 'No data available yet.', icon }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="w-11 h-11 rounded-full flex items-center justify-center mb-3"
        style={{ background: 'var(--eb-surface-muted)', color: 'var(--eb-text-faint)' }}>
        {icon || (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
        )}
      </div>
      <p className="text-sm" style={{ color: 'var(--eb-text-muted)' }}>{message}</p>
    </div>
  );
}

import React from 'react';

export default function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-2">
      <span className="text-xs font-medium" style={{ color: 'var(--eb-text-faint)' }}>Page {page} of {totalPages}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
          className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-30"
          style={{ borderColor: 'var(--eb-border)', color: 'var(--eb-text-muted)' }}>
          Prev
        </button>
        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors disabled:opacity-30"
          style={{ borderColor: 'var(--eb-border)', color: 'var(--eb-text-muted)' }}>
          Next
        </button>
      </div>
    </div>
  );
}

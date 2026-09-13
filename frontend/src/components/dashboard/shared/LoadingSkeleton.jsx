import React from 'react';

export function CardSkeleton({ height = 200 }) {
  return (
    <div className="rounded-2xl p-5 border animate-pulse" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)', height }}>
      <div className="h-3 w-24 rounded mb-4" style={{ background: 'var(--eb-surface-muted)' }} />
      <div className="h-full w-full rounded" style={{ background: 'var(--eb-surface-muted)' }} />
    </div>
  );
}

export function RowSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-11 rounded-lg" style={{ background: 'var(--eb-surface-muted)' }} />
      ))}
    </div>
  );
}

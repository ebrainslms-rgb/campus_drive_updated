import React from 'react';

/** Reusable KPI stat card - used across Main Overview and College Overview. */
export default function KpiCard({ label, value, icon, color = 'var(--eb-blue)', loading }) {
  return (
    <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--eb-text-faint)' }}>
          {label}
        </span>
        {icon && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}1A`, color }}>
            {icon}
          </div>
        )}
      </div>
      {loading ? (
        <div className="h-8 w-20 rounded-md animate-pulse" style={{ background: 'var(--eb-surface-muted)' }} />
      ) : (
        <p className="text-3xl font-bold" style={{ color: 'var(--eb-text)' }}>{value}</p>
      )}
    </div>
  );
}

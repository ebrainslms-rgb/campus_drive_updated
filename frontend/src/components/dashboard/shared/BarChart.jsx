import React from 'react';

/** Simple single-series bar chart. `bars` = [{ label, value, sublabel }]. */
export default function BarChart({ bars, maxValue = 100, unit = '%' }) {
  if (!bars || bars.length === 0) return null;
  const max = Math.max(maxValue, ...bars.map(b => b.value || 0));

  return (
    <div className="flex items-end justify-between gap-4" style={{ height: 160 }}>
      {bars.map((b, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
          <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--eb-blue)' }}>
            {b.value != null ? `${b.value.toFixed(0)}${unit}` : '—'}
          </span>
          <div className="w-full rounded-t-lg transition-all duration-500 ease-out"
            style={{
              height: b.value != null ? Math.max((b.value / max) * 110, 4) : 4,
              background: b.value != null
                ? 'linear-gradient(180deg, var(--eb-blue), var(--eb-blue-dark))'
                : 'var(--eb-border)',
            }} />
          <span className="text-[10px] font-medium text-center" style={{ color: 'var(--eb-text-muted)' }}>{b.label}</span>
          {b.sublabel && <span className="text-[9px]" style={{ color: 'var(--eb-text-faint)' }}>{b.sublabel}</span>}
        </div>
      ))}
    </div>
  );
}

import React from 'react';

/**
 * Generic multi-segment donut chart. `segments` = [{ label, value, color }].
 * Reused for both Performance Distribution and Students by Course - each
 * caller supplies its own segments/colors, this component just draws them.
 */
export default function DonutChart({ segments, centerLabel, centerValue }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  const C = 2 * Math.PI * 42;
  let offset = 0;
  const arcs = segments.map(s => {
    const pct = s.value / total;
    const arc = pct * C;
    const dashOffset = -offset;
    offset += arc;
    return { ...s, arc, dashOffset, pct };
  });

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div className="relative flex-shrink-0" style={{ width: 140, height: 140 }}>
        <svg viewBox="0 0 100 100" className="transform -rotate-90">
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--eb-border)" strokeWidth="12" />
          {arcs.map((a, i) => (
            <circle key={i} cx="50" cy="50" r="42" fill="none" stroke={a.color} strokeWidth="12"
              strokeDasharray={`${a.arc} ${C}`} strokeDashoffset={a.dashOffset} strokeLinecap="butt"
              style={{ transition: 'stroke-dasharray 0.6s ease' }} />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold" style={{ color: 'var(--eb-text)' }}>{centerValue}</span>
          <span className="text-[9px] uppercase tracking-wider mt-0.5 text-center px-2" style={{ color: 'var(--eb-text-faint)' }}>
            {centerLabel}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {arcs.map((a, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: a.color }} />
            <div className="flex flex-col">
              <span className="text-xs font-semibold" style={{ color: 'var(--eb-text)' }}>
                {a.value} <span style={{ color: 'var(--eb-text-faint)', fontWeight: 400 }}>({(a.pct * 100).toFixed(1)}%)</span>
              </span>
              <span className="text-[10px]" style={{ color: 'var(--eb-text-muted)' }}>{a.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

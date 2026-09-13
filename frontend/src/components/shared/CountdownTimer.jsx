import React, { useState, useEffect, useRef } from 'react';

/**
 * Server-anchored countdown: computes the target instant once from
 * (serverNow, targetTime) supplied by the backend, then ticks locally off
 * that fixed anchor — never off the client's own clock — so a skewed
 * device clock can't throw the countdown off. Same anchoring pattern as
 * the in-exam timer.
 */
export default function CountdownTimer({ serverNow, targetTime, onComplete, size = 'lg' }) {
  const anchorRef = useRef(null);
  const [remainingMs, setRemainingMs] = useState(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!serverNow || !targetTime) return;
    const target = new Date(targetTime).getTime();
    const server = new Date(serverNow).getTime();
    const localNowAtFetch = Date.now();
    // Offset between the server's clock and this device's clock at fetch time.
    const skew = server - localNowAtFetch;
    anchorRef.current = { target, skew };
    setRemainingMs(Math.max(0, target - server));
  }, [serverNow, targetTime]);

  useEffect(() => {
    if (remainingMs === null) return;
    const tick = () => {
      if (!anchorRef.current) return;
      const estimatedServerNow = Date.now() + anchorRef.current.skew;
      const left = Math.max(0, anchorRef.current.target - estimatedServerNow);
      setRemainingMs(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        onComplete && onComplete();
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [remainingMs === null]);

  if (remainingMs === null) {
    return <div className="spinner-dark mx-auto" />;
  }

  const totalSec = Math.ceil(remainingMs / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');

  const big = size === 'lg';

  return (
    <div className="text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--eb-text-muted)' }}>
        Exam Starts In
      </p>
      <div className={`font-bold tabular-nums ${big ? 'text-5xl' : 'text-2xl'}`} style={{ color: 'var(--eb-text)' }}>
        {mm} <span style={{ color: 'var(--eb-blue)' }}>:</span> {ss}
      </div>
      <p className="text-[11px] mt-1.5" style={{ color: 'var(--eb-text-faint)' }}>minutes / seconds</p>
    </div>
  );
}

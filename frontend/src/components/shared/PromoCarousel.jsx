import React, { useState, useEffect, useCallback } from 'react';

/**
 * Auto-rotating promotional banner. Content is passed in as plain data
 * (see content/promoContent.js) — this component only knows how to render
 * and rotate whatever cards it's given, so changing the copy/images later
 * never requires touching this file.
 */
export default function PromoCarousel({ cards, intervalMs = 5000 }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => setIndex(i => (i + 1) % cards.length), [cards.length]);
  const prev = useCallback(() => setIndex(i => (i - 1 + cards.length) % cards.length), [cards.length]);

  useEffect(() => {
    if (paused || cards.length <= 1) return;
    const t = setInterval(next, intervalMs);
    return () => clearInterval(t);
  }, [paused, next, intervalMs, cards.length]);

  if (!cards.length) return null;
  const card = cards[index];

  return (
    <div
      className="rounded-2xl p-5 flex flex-col justify-between h-full min-h-[180px] relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, var(--eb-blue) 0%, var(--eb-blue-dark) 100%)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="region"
      aria-label="EchoBrains promotional content"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/70 mb-2">
          Stay Updated with EchoBrains
        </p>
        <h4 className="text-lg font-bold text-white leading-snug">{card.title}</h4>
        <p className="text-sm text-white/75 mt-1.5 leading-relaxed">{card.description}</p>
      </div>

      {cards.length > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button onClick={prev} aria-label="Previous"
            className="w-7 h-7 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-1.5">
            {cards.map((_, i) => (
              <button key={i} onClick={() => setIndex(i)} aria-label={`Go to slide ${i + 1}`}
                className="rounded-full transition-all"
                style={{
                  width: i === index ? '16px' : '6px', height: '6px',
                  background: i === index ? '#fff' : 'rgba(255,255,255,0.4)',
                }} />
            ))}
          </div>
          <button onClick={next} aria-label="Next"
            className="w-7 h-7 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

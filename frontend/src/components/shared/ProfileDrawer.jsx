import React, { useState } from 'react';
import { useTheme } from '../../context/ThemeContext';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.36 6.36l-.7-.7M6.34 6.34l-.7-.7m12.02 0l-.7.7M6.34 17.66l-.7.7M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
  { value: 'dark',  label: 'Dark',  icon: 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1020.354 15.354z' },
  { value: 'system', label: 'System Default', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
];

function SettingsPanel() {
  const { mode, setMode } = useTheme();
  return (
    <div className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--eb-text-faint)' }}>
        Appearance
      </p>
      <div className="space-y-2">
        {THEME_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setMode(opt.value)}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-colors text-left"
            style={{
              borderColor: mode === opt.value ? 'var(--eb-blue)' : 'var(--eb-border)',
              background: mode === opt.value ? 'var(--eb-blue-soft)' : 'transparent',
            }}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24"
              stroke={mode === opt.value ? 'var(--eb-blue)' : 'var(--eb-text-muted)'} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
            </svg>
            <span className="text-sm flex-1" style={{ color: mode === opt.value ? 'var(--eb-blue)' : 'var(--eb-text)' }}>
              {opt.label}
            </span>
            {mode === opt.value && (
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--eb-blue)' }} />
            )}
          </button>
        ))}
      </div>
      <p className="text-xs" style={{ color: 'var(--eb-text-faint)' }}>
        Theme will be applied across the application and remembered next time you sign in.
      </p>
    </div>
  );
}

/**
 * Right-side profile drawer, shared shape for both the admin and student
 * headers. Pass whatever identity fields are actually available — never
 * invents data that doesn't exist. Includes a built-in Settings pane
 * (theme selector) reachable via the "Settings" link.
 */
export default function ProfileDrawer({ open, onClose, title, fields, onLogout, roleLabel, extraLinks = [] }) {
  const [view, setView] = useState('profile'); // 'profile' | 'settings'

  if (!open) return null;

  const close = () => { onClose(); setView('profile'); };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={close} />
      <div className="relative w-full max-w-xs h-full flex flex-col animate-slide-in"
        style={{ background: 'var(--eb-surface)' }}>

        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--eb-border)' }}>
          <div className="flex items-center gap-2">
            {view === 'settings' && (
              <button onClick={() => setView('profile')} className="p-1 -ml-1 rounded-lg" style={{ color: 'var(--eb-text-muted)' }} aria-label="Back">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h3 className="text-base font-semibold" style={{ color: 'var(--eb-text)' }}>
              {view === 'settings' ? 'Settings' : title}
            </h3>
          </div>
          <button onClick={close} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700" style={{ color: 'var(--eb-text-faint)' }} aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {view === 'settings' ? (
            <SettingsPanel />
          ) : (
            <>
              {roleLabel && <span className="eb-chip !py-1 !px-3 text-xs">{roleLabel}</span>}

              <div className="space-y-3">
                {fields.filter(f => f.value).map((f, i) => (
                  <div key={i}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--eb-text-faint)' }}>{f.label}</p>
                    <p className="text-sm mt-0.5 break-words" style={{ color: 'var(--eb-text)' }}>{f.value}</p>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t space-y-1" style={{ borderColor: 'var(--eb-border)' }}>
                <button onClick={() => setView('settings')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
                  style={{ color: 'var(--eb-text)' }}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Settings
                </button>
                {extraLinks.map((link, i) => (
                  <button key={i} onClick={link.onClick}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
                    style={{ color: 'var(--eb-text)' }}>
                    {link.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="p-5 border-t" style={{ borderColor: 'var(--eb-border)' }}>
          <button onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-medium text-sm transition-colors"
            style={{ background: 'var(--eb-danger-soft)', color: 'var(--eb-danger)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

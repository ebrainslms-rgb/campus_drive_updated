import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAdminAuth } from '../../context/AdminContext';
import axios from '../../utils/api';
import { notify, notifyError } from '../../utils/notify';

const EXAMS_API = '/admin/exams';

const IST_TZ = 'Asia/Kolkata';

const formatTime12Hr = (time) => {
  if (!time) return '';

  if (
    typeof time === 'string' &&
    (time.includes('AM') || time.includes('PM'))
  ) {
    return time;
  }

  if (
    typeof time === 'string' &&
    (time.includes('T') || time.length > 8)
  ) {
    const date = new Date(time);

    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-IN', {
        timeZone: IST_TZ,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }
  }

  const parts = time.split(':');
  const hour = Number.parseInt(parts[0], 10);
  const minute = parts[1] || '00';

  if (Number.isNaN(hour)) return time;

  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, '0')} ${ampm}`;
};

const formatDate = (value) => {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('en-IN', {
    timeZone: IST_TZ,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const todayStr = () =>
  new Date().toLocaleDateString('en-CA', {
    timeZone: IST_TZ,
  });

const nowTimeStr = () =>
  new Date().toLocaleTimeString('en-GB', {
    timeZone: IST_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

const addSixtyMin = (time) => {
  if (!time) return '';

  const [hours, minutes] = time.split(':').map(Number);
  const total = hours * 60 + minutes + 60;

  const newHours = Math.floor(total / 60) % 24;
  const newMinutes = total % 60;

  return `${String(newHours).padStart(2, '0')}:${String(
    newMinutes
  ).padStart(2, '0')}`;
};

const genCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  return Array.from({ length: 7 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
};

/* -------------------------------------------------------------------------- */
/* College Search                                                             */
/* -------------------------------------------------------------------------- */

function CollegeSearchSelect({
  colleges,
  value,
  onChange,
  placeholder = '— Select an active college —',
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = colleges.find(
    (college) => String(college.id) === String(value)
  );

  const filtered = (() => {
    if (!query.trim()) {
      return colleges;
    }

    const q = query.trim().toLowerCase();

    const startsWith = colleges.filter((college) =>
      college.name.toLowerCase().startsWith(q)
    );

    const contains = colleges.filter(
      (college) =>
        !college.name.toLowerCase().startsWith(q) &&
        college.name.toLowerCase().includes(q)
    );

    return [...startsWith, ...contains];
  })();

  useEffect(() => {
    const handler = (event) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);

    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, []);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  const selectCollege = (college) => {
    onChange(college.id);
    setQuery('');
    setOpen(false);
  };

  const clearSelection = () => {
    onChange('');
    setQuery('');

    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (event) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') {
        setOpen(true);
      }

      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();

      setHighlighted((current) =>
        Math.min(current + 1, Math.max(filtered.length - 1, 0))
      );
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();

      setHighlighted((current) =>
        Math.max(current - 1, 0)
      );
    }

    if (event.key === 'Enter') {
      event.preventDefault();

      if (filtered[highlighted]) {
        selectCollege(filtered[highlighted]);
      }
    }

    if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const highlightText = (name) => {
    if (!query.trim()) {
      return name;
    }

    const search = query.trim().toLowerCase();
    const index = name.toLowerCase().indexOf(search);

    if (index === -1) {
      return name;
    }

    return (
      <>
        {name.slice(0, index)}
        <span
          style={{
            color: '#06B6D4',
            fontWeight: 700,
          }}
        >
          {name.slice(index, index + search.length)}
        </span>
        {name.slice(index + search.length)}
      </>
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-text"
        style={{
          background: 'var(--eb-surface-muted)',
          border: `1px solid ${
            open
              ? '#06B6D4'
              : 'rgba(6,182,212,0.35)'
          }`,
          boxShadow: open
            ? '0 0 0 3px rgba(6,182,212,0.15)'
            : 'none',
          transition: 'all 0.15s',
        }}
        onClick={() => {
          setOpen(true);

          if (inputRef.current) {
            inputRef.current.focus();
          }
        }}
      >
        <svg
          className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>

        <input
          ref={inputRef}
          value={open ? query : ''}
          placeholder={selected ? selected.name : placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-sm focus:outline-none min-w-0"
          style={{
            color: 'var(--eb-text)',
          }}
        />

        {selected && !open && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              clearSelection();
            }}
            className="text-slate-500 dark:text-slate-400 hover:text-red-400 transition-colors flex-shrink-0"
            title="Clear"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}

        <svg
          className={`w-3.5 h-3.5 text-slate-500 dark:text-slate-400 flex-shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>

      {open && (
        <div
          className="absolute z-50 w-full mt-1.5 rounded-xl overflow-hidden shadow-2xl"
          style={{
            background: 'var(--eb-surface-muted)',
            border: '1px solid rgba(6,182,212,0.3)',
            backdropFilter: 'blur(12px)',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              No colleges match "{query}"
            </div>
          ) : (
            filtered.map((college, index) => (
              <div
                key={college.id}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectCollege(college);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer transition-colors text-sm"
                style={{
                  background:
                    index === highlighted
                      ? 'rgba(6,182,212,0.12)'
                      : 'transparent',
                  color:
                    index === highlighted
                      ? 'var(--eb-text)'
                      : 'var(--eb-text-muted)',
                  borderLeft:
                    index === highlighted
                      ? '2px solid #06B6D4'
                      : '2px solid transparent',
                }}
              >
                <span className="flex-1 truncate">
                  {highlightText(college.name)}
                </span>

                {String(value) === String(college.id) && (
                  <svg
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: '#06B6D4' }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

const getSlotStatus = (exam, attendanceMap) => {
  const now = Date.now();

  const start = new Date(exam.startTime).getTime();
  const end = new Date(exam.endTime).getTime();

  const submissions =
    attendanceMap[exam.examCode] || 0;

  if (now < start) {
    return 'pending';
  }

  if (now >= start && now <= end) {
    return 'active';
  }

  return submissions > 0 ? 'done' : 'notdone';
};

const isExpiredCode = (exam) =>
  Date.now() > new Date(exam.endTime).getTime();

function StatusBadge({ status }) {
  if (status === 'pending' || status === 'active') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
        style={{
          background: 'rgba(251,191,36,0.12)',
          color: '#FBBF24',
          border: '1px solid rgba(251,191,36,0.25)',
        }}
      >
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Pending
      </span>
    );
  }

  if (status === 'done') {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
        style={{
          background: 'rgba(34,197,94,0.12)',
          color: '#22C55E',
          border: '1px solid rgba(34,197,94,0.25)',
        }}
      >
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
        Done
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{
        background: 'rgba(248,113,113,0.12)',
        color: '#F87171',
        border: '1px solid rgba(248,113,113,0.25)',
      }}
    >
      <svg
        className="w-3 h-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={3}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
      Not Done
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Edit Slot Modal                                                            */
/* -------------------------------------------------------------------------- */

function EditSlotModal({
  exam,
  colleges,
  onSave,
  onCancel,
  saving,
}) {
  const college = colleges.find(
    (item) => String(item.id) === String(exam.collegeId)
  );

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  useEffect(() => {
    if (!exam) return;

    const examDate = new Date(exam.date);

    if (!Number.isNaN(examDate.getTime())) {
      setDate(
        examDate.toLocaleDateString('en-CA', {
          timeZone: IST_TZ,
        })
      );
    }

    const start = new Date(exam.startTime);

    if (!Number.isNaN(start.getTime())) {
      const time = start.toLocaleTimeString('en-GB', {
        timeZone: IST_TZ,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      setStartTime(time);
      setEndTime(addSixtyMin(time));
    }
  }, [exam]);

  const handleStartChange = (value) => {
    setStartTime(value);
    setEndTime(addSixtyMin(value));
  };

  const inputBase =
    'w-full px-3 py-2 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none';

  const inputStyle = {
    background: 'var(--eb-surface-muted)',
    border: '1px solid rgba(6,182,212,0.35)',
    colorScheme: 'light dark',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        <div
          className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3"
          style={{
            background: 'rgba(248,113,113,0.07)',
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(248,113,113,0.15)',
              border: '1px solid rgba(248,113,113,0.3)',
            }}
          >
            <svg
              className="w-4 h-4"
              style={{ color: '#F87171' }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </div>

          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Reschedule Slot
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {college?.name || '—'} · Code:{' '}
              <span className="font-mono text-emerald-400">
                {exam.examCode}
              </span>
            </p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              New Date
            </label>

            <input
              type="date"
              value={date}
              min={todayStr()}
              onChange={(event) => setDate(event.target.value)}
              className={inputBase}
              style={inputStyle}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Start Time
              </label>

              <input
                type="time"
                value={startTime}
                min={
                  date === todayStr()
                    ? nowTimeStr()
                    : undefined
                }
                onChange={(event) =>
                  handleStartChange(event.target.value)
                }
                className={inputBase}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                End Time
              </label>

              <input
                type="time"
                value={endTime}
                readOnly
                className={inputBase}
                style={{
                  ...inputStyle,
                  opacity: 0.6,
                  cursor: 'not-allowed',
                }}
              />
            </div>
          </div>

          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            End time is locked at Start Time + 60 minutes.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() =>
              onSave({
                date,
                startTime,
                endTime,
              })
            }
            disabled={saving || !date || !startTime}
            className="flex-1 px-4 py-2.5 rounded-xl text-slate-800 dark:text-slate-100 text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{
              background:
                'linear-gradient(135deg,#F87171,#EF4444)',
            }}
          >
            {saving ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Saving…
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Schedule Confirmation Modal                                                */
/* -------------------------------------------------------------------------- */

function ScheduleConfirmModal({
  collegeId,
  colleges,
  testRows,
  onConfirm,
  onCancel,
  loading,
}) {
  const college = colleges.find(
    (item) => String(item.id) === String(collegeId)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        background: 'rgba(0,0,0,0.78)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
        <div
          className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3"
          style={{
            background: 'rgba(16,185,129,0.07)',
          }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(16,185,129,0.15)',
              border: '1px solid rgba(16,185,129,0.3)',
            }}
          >
            <svg
              style={{
                width: 18,
                height: 18,
                color: '#10B981',
              }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>

          <div>
            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Confirm Exam Schedule
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Review allocation before committing
            </p>
          </div>
        </div>

        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <div
            className="p-3 rounded-xl text-sm"
            style={{
              background: 'rgba(6,182,212,0.07)',
              border: '1px solid rgba(6,182,212,0.18)',
            }}
          >
            <span className="text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
              College
            </span>

            <p className="text-slate-800 dark:text-slate-100 font-semibold mt-0.5">
              {college?.name || '—'}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Test Distribution — {testRows.length}{' '}
              {testRows.length !== 1 ? 'slots' : 'slot'}
            </p>

            <div className="space-y-2">
              {testRows.map((row, index) => (
                <div
                  key={row.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5 rounded-xl text-sm"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border:
                      '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0"
                      style={{
                        background:
                          'rgba(16,185,129,0.15)',
                        color: '#10B981',
                      }}
                    >
                      {index + 1}
                    </span>

                    <span className="text-slate-600 dark:text-slate-300 font-mono text-xs">
                      {row.date || '—'}
                    </span>

                    <span className="text-blue-600 dark:text-blue-400 font-mono text-xs">
                      {formatTime12Hr(row.startTime)} –{' '}
                      {formatTime12Hr(row.endTime)}
                    </span>
                  </div>

                  <span className="font-mono font-bold text-emerald-400 tracking-wider text-xs">
                    {row.code}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="p-3 rounded-xl text-xs"
            style={{
              background: 'rgba(251,191,36,0.06)',
              border:
                '1px solid rgba(251,191,36,0.2)',
              color: '#B45309',
            }}
          >
            Each exam code is unique and acts as the
            student's one-time login password for that slot.
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl text-slate-800 dark:text-slate-100 text-sm font-semibold transition-all flex items-center justify-center gap-2"
            style={{
              background:
                'linear-gradient(135deg,#10B981,#059669)',
            }}
          >
            {loading ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Scheduling…
              </>
            ) : (
              'Confirm & Schedule'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main Component                                                             */
/* -------------------------------------------------------------------------- */

export default function ExamsView() {
  const {
    colleges,
    exams,
    loadingExams,
    fetchExams,
  } = useAdminAuth();

  const [attendanceMap, setAttendanceMap] = useState({});

  const fetchAttendance = useCallback(async () => {
    try {
      const response = await axios.get(
        `${EXAMS_API}/attendance`
      );

      setAttendanceMap(response.data || {});
    } catch {
      setAttendanceMap({});
    }
  }, []);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const [filterCollegeId, setFilterCollegeId] =
    useState('');

  const [copiedCode, setCopiedCode] =
    useState(null);

  const handleCopy = async (code, id) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(id);

      setTimeout(() => {
        setCopiedCode(null);
      }, 2000);
    } catch {
      // Clipboard failure is harmless.
    }
  };

  const [collegeId, setCollegeId] = useState('');
  const [testCount, setTestCount] = useState(1);

  const [testRows, setTestRows] = useState([
    {
      id: 1,
      date: '',
      startTime: '',
      endTime: '',
      code: genCode(),
    },
  ]);

  const [showConfirm, setShowConfirm] =
    useState(false);

  const [scheduling, setScheduling] =
    useState(false);

  const [successMsg, setSuccessMsg] =
    useState('');

  const [editingExam, setEditingExam] =
    useState(null);

  const [savingEdit, setSavingEdit] =
    useState(false);

  useEffect(() => {
    setTestRows((previous) => {
      if (testCount > previous.length) {
        const extras = Array.from(
          {
            length:
              testCount - previous.length,
          },
          (_, index) => ({
            id:
              previous.length + index + 1,
            date: '',
            startTime: '',
            endTime: '',
            code: genCode(),
          })
        );

        return [...previous, ...extras];
      }

      return previous.slice(0, testCount);
    });
  }, [testCount]);

  const updateRow = (index, key, value) => {
    setTestRows((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              [key]: value,
            }
          : row
      )
    );
  };

  const handleStartTimeChange = (
    index,
    value
  ) => {
    setTestRows((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              startTime: value,
              endTime: addSixtyMin(value),
            }
          : row
      )
    );
  };

  const regenerateCode = (index) => {
    setTestRows((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              code: genCode(),
            }
          : row
      )
    );
  };

  const handleScheduleClick = () => {
    if (!collegeId) {
      notify('Please select a college.');
      return;
    }

    const invalid = testRows.some(
      (row) =>
        !row.date ||
        !row.startTime ||
        !row.endTime
    );

    if (invalid) {
      notify('Please fill in date and start time for every test slot.');
      return;
    }

    const today = todayStr();
    const now = nowTimeStr();

    const pastTime = testRows.find(
      (row) =>
        row.date === today &&
        row.startTime < now
    );

    if (pastTime) {
      notify(
        `Start time ${formatTime12Hr(
          pastTime.startTime
        )} has already passed. Please choose a future time.`
      );

      return;
    }

    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setScheduling(true);

    try {
      await Promise.all(
        testRows.map((row) =>
          axios.post(`${EXAMS_API}/schedule`, {
            collegeId,
            date: row.date,
            startTime: row.startTime,
            endTime: row.endTime,
            examCode: row.code,
          })
        )
      );

      setShowConfirm(false);

      setSuccessMsg(
        `${testRows.length} exam slot${
          testRows.length > 1 ? 's' : ''
        } scheduled successfully!`
      );

      setCollegeId('');
      setTestCount(1);

      setTestRows([
        {
          id: 1,
          date: '',
          startTime: '',
          endTime: '',
          code: genCode(),
        },
      ]);

      fetchExams();
      fetchAttendance();

      setTimeout(() => {
        setSuccessMsg('');
      }, 5000);
    } catch (error) {
      setShowConfirm(false);

      notifyError(error, 'Scheduling failed.', 'Scheduling failed');
    } finally {
      setScheduling(false);
    }
  };

  const handleEditSave = async ({
    date,
    startTime,
    endTime,
  }) => {
    setSavingEdit(true);

    try {
      await axios.put(
        `${EXAMS_API}/${editingExam.id}`,
        {
          date,
          startTime,
          endTime,
        }
      );

      setEditingExam(null);

      fetchExams();
      fetchAttendance();
    } catch (error) {
      notifyError(error, 'Failed to update slot.', 'Update failed');
    } finally {
      setSavingEdit(false);
    }
  };

  const filteredExams = filterCollegeId
    ? exams.filter(
        (exam) =>
          String(exam.collegeId) ===
          String(filterCollegeId)
      )
    : exams;

  const inputBase =
    'w-full px-3 py-2 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none transition-all';

  const inputStyle = {
    background: 'var(--eb-surface-muted)',
    border:
      '1px solid rgba(6,182,212,0.35)',
    colorScheme: 'light dark',
  };

  const inputFocus = {
    border: '1px solid #06B6D4',
    boxShadow:
      '0 0 0 3px rgba(6,182,212,0.15)',
  };

  return (
    <div className="space-y-6">
      {/* Header */}

      <div>
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Exam Management
        </h2>

        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Configure and schedule exam slots for colleges
        </p>
      </div>

      {/* Success */}

      {successMsg && (
        <div
          className="flex items-center gap-3 p-4 rounded-xl border text-sm"
          style={{
            background:
              'rgba(16,185,129,0.1)',
            borderColor:
              'rgba(16,185,129,0.3)',
            color: '#059669',
          }}
        >
          <svg
            className="w-5 h-5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>

          {successMsg}
        </div>
      )}

      {/* Main layout */}

      <div className="flex flex-col lg:flex-row gap-6 items-stretch lg:items-start">
        {/* Schedule panel */}

        <div
          className="w-full lg:flex-1 min-w-0 space-y-5 rounded-2xl p-4 sm:p-6 border"
          style={{
            background:
              'var(--eb-surface-muted)',
            borderColor:
              'rgba(100,116,139,0.3)',
          }}
        >
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
            Schedule New Exam
          </h3>

          {/* College */}

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              College{' '}
              <span style={{ color: '#06B6D4' }}>
                *
              </span>
            </label>

            <CollegeSearchSelect
              colleges={colleges}
              value={collegeId}
              onChange={setCollegeId}
            />
          </div>

          {/* Number of tests */}

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              Number of Tests to Conduct{' '}
              <span style={{ color: '#06B6D4' }}>
                *
              </span>
            </label>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setTestCount((value) =>
                    Math.max(1, value - 1)
                  )
                }
                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold transition-all hover:scale-105 flex-shrink-0"
                style={{
                  background:
                    'rgba(6,182,212,0.12)',
                  border:
                    '1px solid rgba(6,182,212,0.3)',
                  color: '#06B6D4',
                }}
              >
                −
              </button>

              <input
                type="number"
                min={1}
                max={10}
                value={testCount}
                onChange={(event) =>
                  setTestCount(
                    Math.max(
                      1,
                      Math.min(
                        10,
                        Number.parseInt(
                          event.target.value,
                          10
                        ) || 1
                      )
                    )
                  )
                }
                className="w-20 text-center px-3 py-2 rounded-xl text-base font-bold text-slate-800 dark:text-slate-100 focus:outline-none"
                style={{
                  background:
                    'var(--eb-surface-muted)',
                  border:
                    '1px solid rgba(6,182,212,0.35)',
                }}
              />

              <button
                type="button"
                onClick={() =>
                  setTestCount((value) =>
                    Math.min(10, value + 1)
                  )
                }
                className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-bold transition-all hover:scale-105 flex-shrink-0"
                style={{
                  background:
                    'rgba(6,182,212,0.12)',
                  border:
                    '1px solid rgba(6,182,212,0.3)',
                  color: '#06B6D4',
                }}
              >
                +
              </button>

              <span className="text-slate-500 dark:text-slate-400 text-xs">
                slot
                {testCount !== 1 ? 's' : ''} (max 10)
              </span>
            </div>
          </div>

          {/* Test rows */}

          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Test Slot Configuration
            </p>

            {testRows.map((row, index) => (
              <div
                key={row.id}
                className="rounded-xl overflow-hidden"
                style={{
                  border:
                    '1px solid rgba(6,182,212,0.2)',
                  background:
                    'rgba(6,182,212,0.03)',
                }}
              >
                <div
                  className="flex items-center justify-between px-4 py-2 border-b"
                  style={{
                    borderColor:
                      'rgba(6,182,212,0.15)',
                    background:
                      'rgba(6,182,212,0.06)',
                  }}
                >
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                    Test {index + 1}
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-400 text-xs tracking-wider">
                      {row.code}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        regenerateCode(index)
                      }
                      title="Regenerate code"
                      className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 transition-colors"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                      Date
                    </label>

                    <input
                      type="date"
                      value={row.date}
                      min={todayStr()}
                      onChange={(event) =>
                        updateRow(
                          index,
                          'date',
                          event.target.value
                        )
                      }
                      className={inputBase}
                      style={inputStyle}
                      onFocus={(event) =>
                        Object.assign(
                          event.target.style,
                          inputFocus
                        )
                      }
                      onBlur={(event) =>
                        Object.assign(
                          event.target.style,
                          inputStyle
                        )
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                      Start Time
                    </label>

                    <input
                      type="time"
                      value={row.startTime}
                      min={
                        row.date === todayStr()
                          ? nowTimeStr()
                          : undefined
                      }
                      onChange={(event) =>
                        handleStartTimeChange(
                          index,
                          event.target.value
                        )
                      }
                      className={inputBase}
                      style={inputStyle}
                      onFocus={(event) =>
                        Object.assign(
                          event.target.style,
                          inputFocus
                        )
                      }
                      onBlur={(event) =>
                        Object.assign(
                          event.target.style,
                          inputStyle
                        )
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                      End Time{' '}
                      <span className="normal-case font-normal text-slate-600 dark:text-slate-300">
                        (auto)
                      </span>
                    </label>

                    <input
                      type="time"
                      value={row.endTime}
                      readOnly
                      className={inputBase}
                      style={{
                        ...inputStyle,
                        opacity: 0.55,
                        cursor: 'not-allowed',
                      }}
                      title="Auto-calculated: Start Time + 60 minutes"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Info */}

          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{
              background:
                'rgba(251,191,36,0.07)',
              border:
                '1px solid rgba(251,191,36,0.18)',
              color: '#B45309',
            }}
          >
            <svg
              className="w-3.5 h-3.5 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>

            End time is locked at Start Time + 60 minutes.
            Past dates are disabled.
          </div>

          {/* Schedule */}

          <button
            type="button"
            onClick={handleScheduleClick}
            className="w-full py-3 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
            style={{
              background:
                'linear-gradient(135deg,#10B981,#059669)',
            }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>

            Schedule Exam
          </button>
        </div>

        {/* Scheduled exams */}

        <div className="w-full lg:w-[50%] flex-shrink-0 min-w-0 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
              Scheduled Exam Slots
            </h3>

            <div className="relative w-full sm:flex-1 sm:max-w-[220px]">
              <select
                value={filterCollegeId}
                onChange={(event) =>
                  setFilterCollegeId(
                    event.target.value
                  )
                }
                className="w-full pl-3 pr-8 py-1.5 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none appearance-none"
                style={{
                  background:
                    'var(--eb-surface-muted)',
                  border:
                    '1px solid rgba(6,182,212,0.3)',
                  colorScheme: 'light dark',
                }}
              >
                <option value="">
                  All Colleges
                </option>

                {colleges.map((college) => (
                  <option
                    key={college.id}
                    value={college.id}
                  >
                    {college.name}
                  </option>
                ))}
              </select>

              <svg
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 dark:text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>

          {/* Legend */}

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              Status:
            </span>

            {[
              {
                label: 'Pending',
                bg: 'rgba(251,191,36,0.1)',
                color: '#FBBF24',
                border:
                  'rgba(251,191,36,0.2)',
              },
              {
                label: 'Done',
                bg: 'rgba(34,197,94,0.1)',
                color: '#22C55E',
                border:
                  'rgba(34,197,94,0.2)',
              },
              {
                label: 'Not Done',
                bg: 'rgba(248,113,113,0.1)',
                color: '#F87171',
                border:
                  'rgba(248,113,113,0.2)',
              },
            ].map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{
                  background: item.bg,
                  color: item.color,
                  border: `1px solid ${item.border}`,
                }}
              >
                {item.label}
              </span>
            ))}
          </div>

          {/* Exam list */}

          {loadingExams ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            </div>
          ) : filteredExams.length === 0 ? (
            <div
              className="text-center py-14 text-slate-500 dark:text-slate-400 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700"
              style={{
                background:
                  'var(--eb-surface-muted)',
              }}
            >
              <svg
                className="w-10 h-10 mx-auto mb-3 text-slate-700 dark:text-slate-200"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5v12a2 2 0 002 2z"
                />
              </svg>

              <p className="text-sm">
                {filterCollegeId
                  ? 'No exams for selected college.'
                  : 'No exams scheduled yet.'}
              </p>
            </div>
          ) : (
            <div
              className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
              style={{
                background:
                  'var(--eb-surface-muted)',
              }}
            >
              <div className="overflow-x-auto">
                {/* Header */}

                <div
                  className="min-w-[620px] grid gap-2 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold"
                  style={{
                    gridTemplateColumns:
                      'minmax(180px,1fr) auto auto auto auto',
                    background:
                      'var(--eb-surface-muted)',
                  }}
                >
                  <span>College</span>
                  <span>Date</span>
                  <span>Time Slot</span>
                  <span>Code</span>
                  <span>Status</span>
                </div>

                {/* Rows */}

                <div className="min-w-[620px] divide-y divide-slate-700/30 max-h-[calc(100vh-320px)] overflow-y-auto">
                  {filteredExams.map((exam) => {
                    const status = getSlotStatus(
                      exam,
                      attendanceMap
                    );

                    const expired =
                      isExpiredCode(exam);

                    return (
                      <div
                        key={exam.id}
                        className="grid gap-2 px-4 py-3 items-center hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        style={{
                          gridTemplateColumns:
                            'minmax(180px,1fr) auto auto auto auto',
                        }}
                      >
                        <p className="text-slate-800 dark:text-slate-100 text-xs font-medium truncate">
                          {exam.collegeName || '—'}
                        </p>

                        <span className="text-slate-500 dark:text-slate-400 text-xs font-mono whitespace-nowrap">
                          {formatDate(exam.date)}
                        </span>

                        <span className="text-blue-600 dark:text-blue-400 text-xs font-mono whitespace-nowrap">
                          {formatTime12Hr(
                            exam.startTime
                          )}{' '}
                          –{' '}
                          {formatTime12Hr(
                            exam.endTime
                          )}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-mono font-bold text-xs tracking-wider"
                            style={
                              expired
                                ? {
                                    color: '#F87171',
                                    textDecoration:
                                      'line-through',
                                    textDecorationColor:
                                      '#F87171',
                                  }
                                : {
                                    color: '#34D399',
                                  }
                            }
                          >
                            {exam.examCode}
                          </span>

                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                exam.examCode,
                                exam.id
                              )
                            }
                            className="p-1 rounded border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
                            title="Copy code"
                          >
                            {copiedCode === exam.id ? (
                              <svg
                                className="w-3 h-3 text-emerald-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2.5}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            ) : (
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2"
                                />
                              </svg>
                            )}
                          </button>
                        </div>

                        <div className="flex items-center gap-2">
                          <StatusBadge
                            status={status}
                          />

                          {exam.editable && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingExam(exam)
                              }
                              title="Edit this slot — locks automatically once a student starts"
                              className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all hover:scale-105"
                              style={{
                                background:
                                  'rgba(248,113,113,0.12)',
                                color: '#F87171',
                                border:
                                  '1px solid rgba(248,113,113,0.25)',
                              }}
                            >
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2.5}
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>

                              Edit Slot
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Schedule confirmation */}

      {showConfirm && (
        <ScheduleConfirmModal
          collegeId={collegeId}
          colleges={colleges}
          testRows={testRows}
          loading={scheduling}
          onConfirm={handleConfirm}
          onCancel={() =>
            setShowConfirm(false)
          }
        />
      )}

      {/* Edit modal */}

      {editingExam && (
        <EditSlotModal
          exam={editingExam}
          colleges={colleges}
          saving={savingEdit}
          onSave={handleEditSave}
          onCancel={() =>
            setEditingExam(null)
          }
        />
      )}
    </div>
  );
}
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../utils/api';
import EmptyState from './shared/EmptyState.jsx';
import Pagination from './shared/Pagination.jsx';
import { RowSkeleton } from './shared/LoadingSkeleton.jsx';

/**
 * Global Drives page
 *
 * Ongoing Drives:
 * - Shows ONLY currently live drives.
 * - Uses the existing /admin/drives/ongoing endpoint.
 * - Opens the same DriveDetails.jsx page.
 *
 * Completed Drives:
 * - Shows ONLY drives whose endTime is already past.
 * - Uses /admin/drives/completed.
 * - Server-side paginated.
 * - Opens the same DriveDetails.jsx page.
 */
const PAGE_SIZE = 50;

export default function AllDrivesGlobal() {
  const { adminKey } = useParams();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);

  const [ongoing, setOngoing] = useState([]);
  const [completed, setCompleted] = useState(null);

  const [view, setView] = useState('ongoing');

  /**
   * Load completed drives.
   * This is intentionally separate from the ongoing-drive logic.
   */
  const loadCompleted = useCallback(() => {
    axios
      .get('/admin/drives/completed', {
        params: {
          page,
          size: PAGE_SIZE,
        },
      })
      .then((res) => {
        setCompleted(res.data);
      })
      .catch(() => {
        setCompleted({
          content: [],
          totalPages: 0,
          totalElements: 0,
        });
      });
  }, [page]);

  /**
   * Load completed drives only when the Completed Drives
   * tab is selected.
   */
  useEffect(() => {
    if (view !== 'completed') return;

    setCompleted(null);
    loadCompleted();
  }, [view, loadCompleted]);

  /**
   * Existing ongoing-drive behavior.
   * Do not change this logic.
   */
  useEffect(() => {
    axios
      .get('/admin/drives/ongoing')
      .then((res) => {
        setOngoing(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        setOngoing([]);
      });
  }, []);

  /**
   * When changing between tabs, always start pagination
   * from page 1.
   */
  const handleViewChange = (nextView) => {
    setView(nextView);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      {/* Page heading */}
      <div>
        <h1
          className="text-xl font-bold"
          style={{ color: 'var(--eb-text)' }}
        >
          Drives
        </h1>

        <p
          className="text-sm mt-1"
          style={{ color: 'var(--eb-text-muted)' }}
        >
          View ongoing and completed examination drives across all colleges.
        </p>
      </div>

      {/* View switcher */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleViewChange('ongoing')}
          className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{
            background:
              view === 'ongoing'
                ? 'var(--eb-blue)'
                : 'var(--eb-surface)',
            color:
              view === 'ongoing'
                ? '#fff'
                : 'var(--eb-text-muted)',
            border: '1px solid var(--eb-border)',
          }}
        >
          Ongoing Drives
        </button>

        <button
          onClick={() => handleViewChange('completed')}
          className="px-4 py-2 rounded-xl text-sm font-semibold"
          style={{
            background:
              view === 'completed'
                ? 'var(--eb-blue)'
                : 'var(--eb-surface)',
            color:
              view === 'completed'
                ? '#fff'
                : 'var(--eb-text-muted)',
            border: '1px solid var(--eb-border)',
          }}
        >
          Completed Drives
        </button>
      </div>

      {/* ============================================================
          ONGOING DRIVES
          ============================================================ */}
      {view === 'ongoing' ? (
        <div
          className="rounded-2xl p-5 border"
          style={{
            background: 'var(--eb-surface)',
            borderColor: 'var(--eb-border)',
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3
                className="text-sm font-semibold"
                style={{ color: 'var(--eb-text)' }}
              >
                Ongoing Drives
              </h3>

              <p
                className="text-xs mt-1"
                style={{ color: 'var(--eb-text-faint)' }}
              >
                Open a drive to monitor live examination sessions and control
                student access.
              </p>
            </div>

            <span
              className="text-[11px] px-2 py-1 rounded-full"
              style={{
                background: 'var(--eb-success-soft)',
                color: 'var(--eb-success)',
              }}
            >
              {ongoing.length} LIVE
            </span>
          </div>

          {ongoing.length ? (
            <div className="space-y-2">
              {ongoing.map((d) => (
                <button
                  key={d.examId}
                  onClick={() =>
                    navigate(
                      `/${adminKey}/admin/drives/${d.examId}`
                    )
                  }
                  className="w-full text-left rounded-xl border p-4 hover:bg-slate-50 dark:hover:bg-slate-700"
                  style={{
                    borderColor: 'var(--eb-border)',
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div
                        className="font-mono text-xs font-semibold"
                        style={{ color: 'var(--eb-blue)' }}
                      >
                        {d.examCode}
                      </div>

                      <div
                        className="text-sm font-semibold mt-1"
                        style={{ color: 'var(--eb-text)' }}
                      >
                        {d.collegeName}
                      </div>
                    </div>

                    <div className="text-right">
                      <div
                        className="text-xs"
                        style={{ color: 'var(--eb-text-muted)' }}
                      >
                        {new Date(d.startTime).toLocaleTimeString(
                          'en-IN',
                          {
                            hour: 'numeric',
                            minute: '2-digit',
                          }
                        )}{' '}
                        –{' '}
                        {new Date(d.endTime).toLocaleTimeString(
                          'en-IN',
                          {
                            hour: 'numeric',
                            minute: '2-digit',
                          }
                        )}
                      </div>

                      <div
                        className="text-xs mt-1"
                        style={{
                          color: 'var(--eb-text-faint)',
                        }}
                      >
                        {d.registered} registered
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState message="No examination drives are running right now." />
          )}
        </div>
      ) : (
        /* ============================================================
           COMPLETED DRIVES
           ============================================================ */
        <div
          className="rounded-2xl p-5 border"
          style={{
            background: 'var(--eb-surface)',
            borderColor: 'var(--eb-border)',
          }}
        >
          <h3
            className="text-sm font-semibold mb-4"
            style={{ color: 'var(--eb-text)' }}
          >
            Completed Drives
            {completed
              ? ` (${completed.totalElements})`
              : ''}
          </h3>

          {completed === null ? (
            <RowSkeleton rows={8} />
          ) : completed.content.length > 0 ? (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr
                      className="text-[11px] uppercase tracking-wide"
                      style={{
                        color: 'var(--eb-text-faint)',
                      }}
                    >
                      <th className="py-2 pr-4">
                        S.No
                      </th>

                      <th className="py-2 pr-4">
                        Drive Code
                      </th>

                      <th className="py-2 pr-4">
                        Date
                      </th>

                      <th className="py-2 pr-4">
                        Time
                      </th>

                      <th className="py-2 pr-4">
                        College Name
                      </th>

                      <th className="py-2 pr-4">
                        Registered Students
                      </th>
                    </tr>
                  </thead>

                  <tbody
                    className="divide-y"
                    style={{
                      borderColor: 'var(--eb-border)',
                    }}
                  >
                    {completed.content.map((d, i) => (
                      <tr
                        key={d.examId}
                        onClick={() =>
                          navigate(
                            `/${adminKey}/admin/drives/${d.examId}`
                          )
                        }
                        className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
                      >
                        <td
                          className="py-2.5 pr-4"
                          style={{
                            color: 'var(--eb-text-faint)',
                          }}
                        >
                          {(page - 1) * PAGE_SIZE + i + 1}
                        </td>

                        <td
                          className="py-2.5 pr-4 font-mono text-xs font-semibold"
                          style={{
                            color: 'var(--eb-blue)',
                          }}
                        >
                          {d.examCode}
                        </td>

                        <td
                          className="py-2.5 pr-4"
                          style={{
                            color: 'var(--eb-text)',
                          }}
                        >
                          {new Date(
                            d.startTime
                          ).toLocaleDateString(
                            'en-IN',
                            {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            }
                          )}
                        </td>

                        <td
                          className="py-2.5 pr-4"
                          style={{
                            color:
                              'var(--eb-text-muted)',
                          }}
                        >
                          {new Date(
                            d.startTime
                          ).toLocaleTimeString(
                            'en-IN',
                            {
                              hour: 'numeric',
                              minute: '2-digit',
                            }
                          )}
                          {' – '}
                          {new Date(
                            d.endTime
                          ).toLocaleTimeString(
                            'en-IN',
                            {
                              hour: 'numeric',
                              minute: '2-digit',
                            }
                          )}
                        </td>

                        <td
                          className="py-2.5 pr-4 font-medium"
                          style={{
                            color: 'var(--eb-text)',
                          }}
                        >
                          {d.collegeName}
                        </td>

                        <td
                          className="py-2.5 pr-4"
                          style={{
                            color:
                              'var(--eb-text-muted)',
                          }}
                        >
                          {d.registered}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={page}
                totalPages={completed.totalPages}
                onChange={setPage}
              />
            </div>
          ) : (
            <EmptyState message="No completed drives found." />
          )}
        </div>
      )}
    </div>
  );
}
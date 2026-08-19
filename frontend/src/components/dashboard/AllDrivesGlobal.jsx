import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../utils/api';
import EmptyState from './shared/EmptyState.jsx';
import Pagination from './shared/Pagination.jsx';
import { RowSkeleton } from './shared/LoadingSkeleton.jsx';

/**
 * Global Drives page (new sidebar item) - every drive across every
 * college, server-side paginated (50/page), newest scheduled date/time
 * first. Clicking a row opens the exact same DriveDetails.jsx used by
 * the existing Overview -> College -> Drive path - no separate/duplicate
 * drive-details implementation, just a different route into it (no
 * collegeId segment, since this list isn't scoped to one college).
 */
const PAGE_SIZE = 50;

export default function AllDrivesGlobal() {
  const { adminKey } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    axios.get('/admin/drives', { params: { page, size: PAGE_SIZE } })
      .then(res => setData(res.data))
      .catch(() => setData({ content: [], totalPages: 0, totalElements: 0 }));
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--eb-text)' }}>Drives</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--eb-text-muted)' }}>
          Every scheduled drive across all colleges, newest first.
        </p>
      </div>

      <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--eb-text)' }}>
          Drives {data ? `(${data.totalElements})` : ''}
        </h3>

        {data === null ? <RowSkeleton rows={8} /> : data.content.length > 0 ? (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--eb-text-faint)' }}>
                    <th className="py-2 pr-4">S.No</th>
                    <th className="py-2 pr-4">Drive Code</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">College Name</th>
                    <th className="py-2 pr-4">Registered Students</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--eb-border)' }}>
                  {data.content.map((d, i) => (
                    <tr key={d.examId} onClick={() => navigate(`/${adminKey}/admin/drives/${d.examId}`)}
                      className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700">
                      <td className="py-2.5 pr-4" style={{ color: 'var(--eb-text-faint)' }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs font-semibold" style={{ color: 'var(--eb-blue)' }}>{d.examCode}</td>
                      <td className="py-2.5 pr-4" style={{ color: 'var(--eb-text)' }}>
                        {new Date(d.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="py-2.5 pr-4" style={{ color: 'var(--eb-text-muted)' }}>
                        {new Date(d.startTime).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                      </td>
                      <td className="py-2.5 pr-4 font-medium" style={{ color: 'var(--eb-text)' }}>{d.collegeName}</td>
                      <td className="py-2.5 pr-4" style={{ color: 'var(--eb-text-muted)' }}>{d.registered}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
          </div>
        ) : (
          <EmptyState message="No drives have been scheduled yet." />
        )}
      </div>
    </div>
  );
}

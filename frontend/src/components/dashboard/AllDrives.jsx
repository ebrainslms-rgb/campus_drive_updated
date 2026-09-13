import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from '../../utils/api';
import EmptyState from './shared/EmptyState.jsx';
import Pagination from './shared/Pagination.jsx';
import { RowSkeleton } from './shared/LoadingSkeleton.jsx';

const Ic = { Back: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>) };

export default function AllDrives() {
  const { adminKey, collegeId } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const size = 10;

  const load = useCallback(() => {
    axios.get(`/admin/colleges/${collegeId}/drives`, { params: { page, size } })
      .then(res => setData(res.data))
      .catch(() => setData({ content: [], totalPages: 0 }));
  }, [collegeId, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(`/${adminKey}/admin/colleges/${collegeId}`)} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--eb-blue)' }}>
        <Ic.Back /> Back to College Overview
      </button>
      <h1 className="text-xl font-bold" style={{ color: 'var(--eb-text)' }}>All Drives</h1>

      <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
        {data === null ? <RowSkeleton rows={6} /> : data.content.length > 0 ? (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--eb-text-faint)' }}>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Exam Code</th>
                    <th className="py-2 pr-4">Registered</th>
                    <th className="py-2 pr-4">Attempted</th>
                    <th className="py-2 pr-4">Avg Score</th>
                    <th className="py-2 pr-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--eb-border)' }}>
                  {data.content.map(d => (
                    <tr key={d.examId}>
                      <td className="py-2.5 pr-4 font-medium" style={{ color: 'var(--eb-text)' }}>
                        {new Date(d.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs" style={{ color: 'var(--eb-text-muted)' }}>{d.examCode}</td>
                      <td className="py-2.5 pr-4" style={{ color: 'var(--eb-text-muted)' }}>{d.registered}</td>
                      <td className="py-2.5 pr-4" style={{ color: 'var(--eb-text-muted)' }}>{d.attempted}</td>
                      <td className="py-2.5 pr-4" style={{ color: 'var(--eb-text-muted)' }}>
                        {d.averageScorePercent != null ? `${d.averageScorePercent.toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-2.5 pr-4 text-right">
                        <Link to={`/${adminKey}/admin/colleges/${collegeId}/drives/${d.examId}`} className="text-xs font-semibold" style={{ color: 'var(--eb-blue)' }}>
                          View Details
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
          </div>
        ) : (
          <EmptyState message="No drives conducted for this college yet." />
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import axios from '../../utils/api';
import KpiCard from './shared/KpiCard.jsx';
import DonutChart from './shared/DonutChart.jsx';
import BarChart from './shared/BarChart.jsx';
import EmptyState from './shared/EmptyState.jsx';
import { CardSkeleton, RowSkeleton } from './shared/LoadingSkeleton.jsx';

const PERFORMANCE_COLORS = {
  excellent: '#10B981', good: '#3B82F6', average: '#F59E0B', belowAverage: '#F97316', poor: '#EF4444',
};
const COURSE_PALETTE = ['#3B82F6', '#10B981', '#A855F7', '#F97316', '#06B6D4', '#EC4899', '#84CC16'];

const Ic = {
  Back: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>),
  ChevronLeft: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>),
  ChevronRight: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>),
  Arrow: () => (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>),
};

export default function CollegeOverview() {
  const { adminKey, collegeId } = useParams();
  const navigate = useNavigate();

  const [year, setYear] = useState('');
  const [overview, setOverview] = useState(null);
  const [drivesPage, setDrivesPage] = useState(0); // 0-indexed page of 4
  const [drives, setDrives] = useState(null);
  const [drivesTotal, setDrivesTotal] = useState(0);
  const [topPerformers, setTopPerformers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(() => {
    setLoading(true);
    setError('');
    axios.get(`/admin/colleges/${collegeId}/overview`, { params: { year: year || undefined } })
      .then(res => setOverview(res.data))
      .catch(() => setError('Could not load this college. It may not exist.'))
      .finally(() => setLoading(false));
  }, [collegeId, year]);

  const loadDrives = useCallback((pageIdx) => {
    axios.get(`/admin/colleges/${collegeId}/drives`, { params: { page: pageIdx + 1, size: 4 } })
      .then(res => {
        setDrives(res.data.content || []);
        setDrivesTotal(res.data.totalElements || 0);
      })
      .catch(() => setDrives([]));
  }, [collegeId]);

  const loadTopPerformers = useCallback(() => {
    axios.get(`/admin/colleges/${collegeId}/students`, { params: { page: 1, size: 5, sort: 'score,desc' } })
      .then(res => setTopPerformers(res.data.content || []))
      .catch(() => setTopPerformers([]));
  }, [collegeId]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadDrives(drivesPage); }, [loadDrives, drivesPage]);
  useEffect(() => { loadTopPerformers(); }, [loadTopPerformers]);

  if (error) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate(`/${adminKey}/admin/colleges`)} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--eb-blue)' }}>
          <Ic.Back /> Back to Colleges
        </button>
        <EmptyState message={error} />
      </div>
    );
  }

  const dist = overview?.performanceDistribution;
  const performanceSegments = dist ? [
    { label: 'Excellent (≥80%)', value: dist.excellent, color: PERFORMANCE_COLORS.excellent },
    { label: 'Good (60–79%)', value: dist.good, color: PERFORMANCE_COLORS.good },
    { label: 'Average (40–59%)', value: dist.average, color: PERFORMANCE_COLORS.average },
    { label: 'Below Average (20–39%)', value: dist.belowAverage, color: PERFORMANCE_COLORS.belowAverage },
    { label: 'Poor (<20%)', value: dist.poor, color: PERFORMANCE_COLORS.poor },
  ] : [];

  const courseSegments = (overview?.courseInterest || []).map((c, i) => ({
    label: c.courseName, value: c.studentCount, color: COURSE_PALETTE[i % COURSE_PALETTE.length],
  }));

  const driveBars = (drives || []).map(d => ({
    label: new Date(d.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    value: d.averageScorePercent,
    sublabel: d.examCode,
  }));

  const maxDrivePage = Math.max(0, Math.ceil(drivesTotal / 4) - 1);

  return (
    <div className="space-y-6">
      <div>
        <button onClick={() => navigate(`/${adminKey}/admin/colleges`)} className="flex items-center gap-1.5 text-sm font-medium mb-2" style={{ color: 'var(--eb-blue)' }}>
          <Ic.Back /> Back to Colleges
        </button>
        {loading ? (
          <div className="h-8 w-64 rounded animate-pulse" style={{ background: 'var(--eb-surface-muted)' }} />
        ) : (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--eb-text)' }}>{overview?.collegeName}</h1>
              <p className="text-sm mt-0.5" style={{ color: 'var(--eb-text-muted)' }}>
                {overview?.collegeCode} · {overview?.location}, {overview?.state}
              </p>
            </div>
            {overview?.availableYears?.length > 0 && (
              <select value={year} onChange={e => setYear(e.target.value)} className="eb-input text-sm w-auto">
                <option value="">All Years</option>
                {overview.availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Total Students" value={overview?.totalStudents ?? 0} loading={loading} />
        <KpiCard label="Attempted" value={overview?.attempted ?? 0} color="#10B981" loading={loading} />
        <KpiCard label="Not Attempted" value={overview?.notAttempted ?? 0} color="#EF4444" loading={loading} />
        <KpiCard label="Total Drives" value={overview?.totalDrivesConducted ?? 0} color="var(--eb-blue)" loading={loading} />
        <KpiCard label="Avg Score" value={overview?.averageScorePercent != null ? `${overview.averageScorePercent.toFixed(1)}%` : '—'} color="var(--eb-orange)" loading={loading} />
        <KpiCard label="Highest Score" value={overview?.highestScorePercent != null ? `${overview.highestScorePercent.toFixed(1)}%` : '—'} color="#A855F7" loading={loading} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--eb-text)' }}>Performance Distribution</h3>
          {loading ? <CardSkeleton height={160} /> : performanceSegments.some(s => s.value > 0)
            ? <DonutChart segments={performanceSegments} centerValue={dist.totalScored} centerLabel="Scored" />
            : <EmptyState message="No scored attempts yet for this college." />}
        </div>
        <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--eb-text)' }}>Course-wise Interest</h3>
          {loading ? <CardSkeleton height={160} /> : courseSegments.length > 0
            ? <DonutChart segments={courseSegments} centerValue={courseSegments.reduce((s, c) => s + c.value, 0)} centerLabel="Students" />
            : <EmptyState message="No course registrations yet." />}
        </div>
      </div>

      {/* Test-wise performance */}
      <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--eb-text)' }}>Test-wise Performance (Latest Drives)</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setDrivesPage(p => Math.min(maxDrivePage, p + 1))} disabled={drivesPage >= maxDrivePage}
              title="Older drives" className="p-1.5 rounded-lg border disabled:opacity-30" style={{ borderColor: 'var(--eb-border)', color: 'var(--eb-text-muted)' }}>
              <Ic.ChevronLeft />
            </button>
            <button onClick={() => setDrivesPage(p => Math.max(0, p - 1))} disabled={drivesPage === 0}
              title="Newer drives" className="p-1.5 rounded-lg border disabled:opacity-30" style={{ borderColor: 'var(--eb-border)', color: 'var(--eb-text-muted)' }}>
              <Ic.ChevronRight />
            </button>
          </div>
        </div>
        {drives === null ? <CardSkeleton height={140} /> : driveBars.length > 0
          ? <BarChart bars={driveBars} />
          : <EmptyState message="No drives conducted for this college yet." />}
      </div>

      {/* Recent drives table */}
      <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--eb-text)' }}>Recent Drives Conducted</h3>
          <Link to={`/${adminKey}/admin/colleges/${collegeId}/drives`} className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--eb-blue)' }}>
            View all <Ic.Arrow />
          </Link>
        </div>
        {drives === null ? <RowSkeleton rows={4} /> : drives.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--eb-text-faint)' }}>
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Registered</th>
                  <th className="py-2 pr-4">Attempted</th>
                  <th className="py-2 pr-4">Avg Score</th>
                  <th className="py-2 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--eb-border)' }}>
                {drives.slice(0, 4).map((d, i) => (
                  <tr key={d.examId}>
                    <td className="py-2.5 pr-4" style={{ color: 'var(--eb-text-faint)' }}>{i + 1}</td>
                    <td className="py-2.5 pr-4 font-medium" style={{ color: 'var(--eb-text)' }}>
                      {new Date(d.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
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
        ) : (
          <EmptyState message="No drives conducted for this college yet." />
        )}
      </div>

      {/* Top performers */}
      <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--eb-text)' }}>Top Performers</h3>
          <Link to={`/${adminKey}/admin/colleges/${collegeId}/drives`} className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--eb-blue)' }}>
            View all students <Ic.Arrow />
          </Link>
        </div>
        {topPerformers === null ? <RowSkeleton rows={5} /> : topPerformers.length > 0 ? (
          <div className="divide-y" style={{ borderColor: 'var(--eb-border)' }}>
            {topPerformers.map((s, i) => (
              <button key={s.studentId} onClick={() => navigate(`/${adminKey}/admin/students/${s.studentId}`)}
                className="w-full flex items-center justify-between py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 -mx-2 px-2 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: 'var(--eb-blue-soft)', color: 'var(--eb-blue)' }}>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--eb-text)' }}>{s.fullName}</p>
                    <p className="text-[11px]" style={{ color: 'var(--eb-text-faint)' }}>{s.courseName}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--eb-blue)' }}>
                  {s.scorePercent != null ? `${s.scorePercent.toFixed(1)}%` : '—'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState message="No submitted attempts yet for this college." />
        )}
      </div>
    </div>
  );
}

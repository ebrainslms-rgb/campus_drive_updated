import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../utils/api';
import KpiCard from './shared/KpiCard.jsx';
import DonutChart from './shared/DonutChart.jsx';
import EmptyState from './shared/EmptyState.jsx';
import { CardSkeleton, RowSkeleton } from './shared/LoadingSkeleton.jsx';
import FilterBar, { resolveDateRange } from './shared/FilterBar.jsx';

const PERFORMANCE_COLORS = {
  excellent: '#10B981', good: '#3B82F6', average: '#F59E0B', belowAverage: '#F97316', poor: '#EF4444',
};
const COURSE_PALETTE = ['#3B82F6', '#10B981', '#A855F7', '#F97316', '#06B6D4', '#EC4899', '#84CC16'];

const Ic = {
  Building: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>),
  Users: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>),
  Check: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>),
  Star: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>),
  Arrow: () => (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>),
};

export default function Overview() {
  const navigate = useNavigate();
  const { adminKey } = useParams();

  const [courses, setCourses] = useState([]);
  const [datePreset, setDatePreset] = useState('last30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [examId, setExamId] = useState(null);
  const [courseId, setCourseId] = useState(null);

  const [kpis, setKpis] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [courseInterest, setCourseInterest] = useState(null);
  const [topColleges, setTopColleges] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get('/admin/courses', { params: { isActive: true } })
      .then(res => setCourses(Array.isArray(res.data) ? res.data : []))
      .catch(() => setCourses([]));
  }, []);

  const { from, to } = useMemo(() => resolveDateRange(datePreset, customFrom, customTo), [datePreset, customFrom, customTo]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = { examId: examId || undefined, courseId: courseId || undefined, from: from || undefined, to: to || undefined };

    Promise.all([
      axios.get('/admin/dashboard/overview/kpis', { params }),
      axios.get('/admin/dashboard/overview/performance-distribution', { params }),
      axios.get('/admin/dashboard/overview/course-interest', { params: { examId: params.examId, courseId: params.courseId, from: params.from, to: params.to } }),
      axios.get('/admin/dashboard/overview/top-colleges', { params: { ...params, limit: 5 } }),
    ]).then(([kpiRes, perfRes, courseRes, collegeRes]) => {
      setKpis(kpiRes.data);
      setPerformance(perfRes.data);
      setCourseInterest(courseRes.data);
      setTopColleges(collegeRes.data);
    }).catch(() => {
      setError('Could not load dashboard data. Please try again.');
    }).finally(() => setLoading(false));
  }, [examId, courseId, from, to]);

  useEffect(() => { load(); }, [load]);

  const performanceSegments = performance ? [
    { label: 'Excellent (≥80%)', value: performance.excellent, color: PERFORMANCE_COLORS.excellent },
    { label: 'Good (60–79%)', value: performance.good, color: PERFORMANCE_COLORS.good },
    { label: 'Average (40–59%)', value: performance.average, color: PERFORMANCE_COLORS.average },
    { label: 'Below Average (20–39%)', value: performance.belowAverage, color: PERFORMANCE_COLORS.belowAverage },
    { label: 'Poor (<20%)', value: performance.poor, color: PERFORMANCE_COLORS.poor },
  ] : [];

  const courseSegments = (courseInterest || []).map((c, i) => ({
    label: c.courseName, value: c.studentCount, color: COURSE_PALETTE[i % COURSE_PALETTE.length],
  }));

  return (
    <div className="space-y-4">

      <FilterBar
        datePreset={datePreset} onDatePresetChange={setDatePreset}
        customFrom={customFrom} customTo={customTo}
        onCustomChange={(k, v) => k === 'from' ? setCustomFrom(v) : setCustomTo(v)}
        examId={examId} onExamChange={setExamId}
        courseId={courseId} onCourseChange={setCourseId}
        courses={courses}
      />

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--eb-danger-soft)', color: 'var(--eb-danger)' }}>
          {error}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Registered Colleges" value={kpis?.registeredColleges ?? 0} icon={<Ic.Building />} color="var(--eb-blue)" loading={loading} />
        <KpiCard label="Total Registered Students" value={kpis?.totalRegisteredStudents ?? 0} icon={<Ic.Users />} color="#10B981" loading={loading} />
        <KpiCard label="Exams Attempted" value={kpis?.examsAttempted ?? 0} icon={<Ic.Check />} color="#A855F7" loading={loading} />
        <KpiCard label="Average Score" value={kpis?.averageScorePercent != null ? `${kpis.averageScorePercent.toFixed(1)}%` : '—'} icon={<Ic.Star />} color="var(--eb-orange)" loading={loading} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl p-5 pb-6 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--eb-text)' }}>Student Performance Distribution</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--eb-text-faint)' }}>Based on percentage score of submitted attempts</p>
          {loading ? <CardSkeleton height={160} /> : performance && performance.totalScored > 0
            ? <DonutChart segments={performanceSegments} centerValue={performance.totalScored} centerLabel="Scored" />
            : <EmptyState message="No scored attempts yet for the selected filters." />}
        </div>

        <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--eb-text)' }}>Students by Course</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--eb-text-faint)' }}>Course selected at registration</p>
          {loading ? <CardSkeleton height={160} /> : courseSegments.length > 0
            ? <DonutChart segments={courseSegments} centerValue={courseSegments.reduce((s, c) => s + c.value, 0)} centerLabel="Students" />
            : <EmptyState message="No students registered for the selected filters." />}
        </div>
      </div>

      {/* Top colleges */}
      <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--eb-text)' }}>Top Colleges by Registered Students</h3>
          <button onClick={() => navigate(`/${adminKey}/admin/colleges`)}
            className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--eb-blue)' }}>
            View all <Ic.Arrow />
          </button>
        </div>
        {loading ? <RowSkeleton rows={5} /> : (topColleges && topColleges.length > 0) ? (
          <div className="divide-y" style={{ borderColor: 'var(--eb-border)' }}>
            {topColleges.map((c, i) => (
              <button key={c.collegeId} onClick={() => navigate(`/${adminKey}/admin/colleges/${c.collegeId}`)}
                className="w-full flex items-center justify-between py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 -mx-2 px-2 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: 'var(--eb-blue-soft)', color: 'var(--eb-blue)' }}>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--eb-text)' }}>{c.collegeName}</p>
                    {c.collegeCode && <p className="text-[11px]" style={{ color: 'var(--eb-text-faint)' }}>{c.collegeCode}</p>}
                  </div>
                </div>
                <span className="text-sm font-semibold flex-shrink-0" style={{ color: 'var(--eb-blue)' }}>{c.studentCount}</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState message="No colleges match the selected filters." />
        )}
      </div>
    </div>
  );
}

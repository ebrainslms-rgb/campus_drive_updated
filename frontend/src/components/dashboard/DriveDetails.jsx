import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../utils/api';
import EmptyState from './shared/EmptyState.jsx';
import Pagination from './shared/Pagination.jsx';
import ExportModal from './shared/ExportModal.jsx';
import { RowSkeleton } from './shared/LoadingSkeleton.jsx';

const Ic = {
  Back: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>),
  Download: () => (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>),
};

const PAGE_SIZE = 15;

/** Reads the actual filename the backend computed (Content-Disposition),
 *  falling back to a generic name only if that header is somehow missing -
 *  the point of the dynamic filename feature is lost if the frontend just
 *  makes up its own name instead of using this. */
function filenameFromDisposition(headerValue, fallback) {
  if (!headerValue) return fallback;
  const match = headerValue.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i);
  if (match && match[1]) {
    try { return decodeURIComponent(match[1]); } catch { return match[1]; }
  }
  return fallback;
}

export default function DriveDetails() {
  // collegeId is only present when this page was reached via
  // Overview -> College -> Drive (the existing path). Reached via the new
  // global Overview -> Drives -> Drive Details entry point, collegeId is
  // simply undefined - both paths render the exact same component/data,
  // only the "Back" destination differs.
  const { adminKey, collegeId, driveId } = useParams();
  const navigate = useNavigate();

  const [drive, setDrive] = useState(null);
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [scoreMin, setScoreMin] = useState('');
  const [scoreMax, setScoreMax] = useState('');
  const [sort, setSort] = useState('desc');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [showExport, setShowExport] = useState(false);

  useEffect(() => {
    axios.get(`/admin/drives/${driveId}`).then(res => setDrive(res.data)).catch(() => setDrive(null));
    axios.get('/admin/courses').then(res => setCourses(Array.isArray(res.data) ? res.data : [])).catch(() => setCourses([]));
  }, [driveId]);

  const filterParams = {
    courseId: courseId || undefined,
    scoreMin: scoreMin !== '' ? scoreMin : undefined,
    scoreMax: scoreMax !== '' ? scoreMax : undefined,
    sort,
  };

  const load = useCallback(() => {
    axios.get(`/admin/drives/${driveId}/students`, { params: { ...filterParams, page, size: PAGE_SIZE } })
      .then(res => setData(res.data))
      .catch(() => setData({ content: [], totalPages: 0, totalElements: 0 }));
    // eslint-disable-next-line
  }, [driveId, courseId, scoreMin, scoreMax, sort, page]);

  useEffect(() => { load(); }, [load]);

  const exportOptions = [
    { key: 'CURRENT_PAGE', label: 'Current Page', count: data?.content?.length ?? 0 },
    { key: 'ALL_FILTERED', label: 'All Filtered Students', count: data?.totalElements ?? 0 },
    { key: 'ALL_STUDENTS', label: 'All Students', count: drive?.registered ?? 0 },
  ];

  const handleExportConfirm = async (mode) => {
    const res = await axios.get(`/admin/drives/${driveId}/export`, {
      params: { ...filterParams, mode, currentPage: page, currentSize: PAGE_SIZE },
      responseType: 'blob',
    });
    const filename = filenameFromDisposition(res.headers?.['content-disposition'], `drive-${driveId}-students.xlsx`);
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const courseName = courses.find(c => String(c.id) === String(courseId))?.name;
  const filterSummary = [
    { label: 'Drive', value: drive?.examCode || driveId },
    { label: 'College', value: drive?.collegeName || '—' },
    ...(courseName ? [{ label: 'Course', value: courseName }] : []),
    { label: 'Sort', value: sort === 'desc' ? 'Score descending' : 'Score ascending' },
  ];

  const backTarget = collegeId
    ? { path: `/${adminKey}/admin/colleges/${collegeId}`, label: 'Back to College Overview' }
    : { path: `/${adminKey}/admin/drives`, label: 'Back to Drives' };

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(backTarget.path)} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--eb-blue)' }}>
        <Ic.Back /> {backTarget.label}
      </button>

      {drive && (
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--eb-text)' }}>Drive Details</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--eb-text-muted)' }}>
            {drive.examCode} · {new Date(drive.startTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {drive.collegeName}
          </p>
        </div>
      )}

      {/* Filters - Course / Score Min / Score Max / Sort only, per requirement
          (Attempt Status and Submission Status removed from this UI). */}
      <div className="rounded-2xl p-4 border grid grid-cols-2 sm:grid-cols-4 gap-3"
        style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
        <div>
          <label className="eb-label">Course</label>
          <select value={courseId} onChange={e => { setCourseId(e.target.value); setPage(1); }} className="eb-input text-sm">
            <option value="">All</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="eb-label">Score Min %</label>
          <input type="number" min="0" max="100" value={scoreMin} onChange={e => { setScoreMin(e.target.value); setPage(1); }} className="eb-input text-sm" />
        </div>
        <div>
          <label className="eb-label">Score Max %</label>
          <input type="number" min="0" max="100" value={scoreMax} onChange={e => { setScoreMax(e.target.value); setPage(1); }} className="eb-input text-sm" />
        </div>
        <div>
          <label className="eb-label">Sort by Score</label>
          <select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }} className="eb-input text-sm">
            <option value="desc">Highest → Lowest</option>
            <option value="asc">Lowest → Highest</option>
          </select>
        </div>
      </div>

      <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--eb-text)' }}>
            Students {data ? `(${data.totalElements})` : ''}
          </h3>
          <button onClick={() => setShowExport(true)} disabled={!data || data.totalElements === 0}
            className="eb-btn-outline !w-auto !py-2 !px-3.5 text-xs flex items-center gap-1.5 disabled:opacity-40">
            <Ic.Download /> Export
          </button>
        </div>

        {data === null ? <RowSkeleton rows={8} /> : data.content.length > 0 ? (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--eb-text-faint)' }}>
                    <th className="py-2 pr-4">S.No</th>
                    <th className="py-2 pr-4">Student</th>
                    <th className="py-2 pr-4">Course</th>
                    <th className="py-2 pr-4">College</th>
                    <th className="py-2 pr-4">Score</th>
                    <th className="py-2 pr-4">Percentage</th>
                    <th className="py-2 pr-4">Attempted</th>
                    <th className="py-2 pr-4">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--eb-border)' }}>
                  {data.content.map((s, i) => (
                    <tr key={s.studentId} onClick={() => navigate(`/${adminKey}/admin/students/${s.studentId}`)}
                      className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700">
                      <td className="py-2.5 pr-4" style={{ color: 'var(--eb-text-faint)' }}>{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td className="py-2.5 pr-4 font-medium" style={{ color: 'var(--eb-text)' }}>{s.fullName}</td>
                      <td className="py-2.5 pr-4" style={{ color: 'var(--eb-text-muted)' }}>{s.courseName}</td>
                      <td className="py-2.5 pr-4" style={{ color: 'var(--eb-text-muted)' }}>{s.collegeName || drive?.collegeName || '—'}</td>
                      <td className="py-2.5 pr-4 font-semibold" style={{ color: 'var(--eb-blue)' }}>{s.totalScore ?? '—'}</td>
                      <td className="py-2.5 pr-4 font-semibold" style={{ color: 'var(--eb-blue)' }}>
                        {s.scorePercent != null ? `${s.scorePercent.toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="eb-badge" style={{ background: s.attempted ? 'var(--eb-success-soft)' : 'var(--eb-surface-muted)', color: s.attempted ? 'var(--eb-success)' : 'var(--eb-text-faint)' }}>
                          {s.attempted ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4" style={{ color: 'var(--eb-text-muted)' }}>{s.submitted ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
          </div>
        ) : (
          <EmptyState message="No students match the selected filters." />
        )}
      </div>

      <ExportModal open={showExport} onClose={() => setShowExport(false)} onConfirm={handleExportConfirm}
        options={exportOptions} filterSummary={filterSummary} />
    </div>
  );
}

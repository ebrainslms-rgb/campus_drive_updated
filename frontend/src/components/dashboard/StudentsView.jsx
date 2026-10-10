import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminContext';
import axios from '../../utils/api';
import EmptyState from './shared/EmptyState.jsx';
import { RowSkeleton } from './shared/LoadingSkeleton.jsx';
import Pagination from './shared/Pagination.jsx';
import StudentFormModal from './StudentFormModal.jsx';
import BulkStudentModal from './BulkStudentModal.jsx';
import ExportFileNameField from './shared/ExportFileNameField.jsx';
import ExportColumnPicker from './shared/ExportColumnPicker.jsx';
import { filenameFromDisposition, saveBlob, downloadErrorMessage } from '../../utils/download';

const PAGE_SIZE = 50;

const Ic = {
  Download: () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4-4m-4 4l-4-4M4 21h16" /></svg>,
  Users: () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-4-4h-1m-3 6H6v-2a4 4 0 014-4h4a4 4 0 014 4v2zM12 10a4 4 0 100-8 4 4 0 000 8zM17 8a3 3 0 012.83 2M7 8a3 3 0 00-2.83 2" /></svg>,
};

function statusLabel(student) {
  return student.testWritten ? 'Test Written' : 'Registered';
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ExportModal({ open, onClose, onExport, allCount, filteredCount, filteredSummary, getDefaultFilename, collegeFilterActive, courseFilterActive }) {
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fileName, setFileName] = useState('');
  const [defaultName, setDefaultName] = useState('');
  const [loadingDefault, setLoadingDefault] = useState(false);
  const [error, setError] = useState('');

  const [columns, setColumns] = useState([]);   // click order = Excel column order; [] = defaults

  useEffect(() => { if (open) { setSelected(null); setFileName(''); setDefaultName(''); setError(''); setColumns([]); } }, [open]);

  // Default name depends on the option: "all students" ignores the college filter.
  useEffect(() => {
    if (!open || !selected) return;
    let cancelled = false;
    setLoadingDefault(true);
    getDefaultFilename(selected)
      .then(name => { if (!cancelled) setDefaultName(name || ''); })
      .catch(() => { if (!cancelled) setDefaultName(''); })
      .finally(() => { if (!cancelled) setLoadingDefault(false); });
    return () => { cancelled = true; };
  }, [open, selected, getDefaultFilename]);

  if (!open) return null;

  const submit = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    try { await onExport(selected, fileName.trim(), columns); onClose(); }
    catch (e) { setError(await downloadErrorMessage(e)); }
    finally { setLoading(false); }
  };

  const options = [
    { key: 'ALL', title: 'Export all students', count: allCount, desc: 'Every student in the database. Filters are ignored.' },
    { key: 'ALL_FILTERED', title: 'Export all students with current filter', count: filteredCount, desc: filteredSummary || 'All students matching the current filters.' },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.58)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border shadow-2xl p-6 space-y-5" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
        <div>
          <h3 className="text-lg font-semibold" style={{ color: 'var(--eb-text)' }}>Export Students</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--eb-text-muted)' }}>Choose the complete dataset you want to export.</p>
        </div>
        <div className="space-y-3">
          {options.map(opt => {
            const active = selected === opt.key;
            return (
              <label key={opt.key} className="block rounded-xl border p-4 cursor-pointer transition-colors" style={{ background: active ? 'var(--eb-blue-soft)' : 'var(--eb-surface-muted)', borderColor: active ? 'var(--eb-blue)' : 'var(--eb-border)' }}>
                <div className="flex items-start gap-3">
                  <input type="radio" name="student-export" className="mt-1 w-4 h-4" style={{ accentColor: 'var(--eb-blue)' }} checked={active} onChange={() => setSelected(opt.key)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold" style={{ color: 'var(--eb-text)' }}>{opt.title}</span>
                      <span className="text-xs font-mono whitespace-nowrap" style={{ color: 'var(--eb-text-faint)' }}>{opt.count.toLocaleString()} students</span>
                    </div>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--eb-text-muted)' }}>{opt.desc}</p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--eb-border)' }}>
          {/* The college filter only applies to "filtered" exports. */}
          <ExportColumnPicker type="STUDENTS"
            collegeFiltered={selected === 'ALL_FILTERED' && !!collegeFilterActive}
            courseFiltered={selected === 'ALL_FILTERED' && !!courseFilterActive}
            value={columns} onChange={setColumns} disabled={loading} />
        </div>
        <ExportFileNameField value={fileName} onChange={setFileName} defaultName={defaultName}
          loadingDefault={loadingDefault} disabled={loading} />
        {error && <p role="alert" className="text-sm" style={{ color: 'var(--eb-danger)' }}>{error}</p>}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} disabled={loading} className="eb-btn-outline !py-2.5">Cancel</button>
          <button onClick={submit} disabled={!selected || loading} className="eb-btn !py-2.5">
            {loading ? <><span className="spinner" />Preparing…</> : 'Export Excel'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StudentsView() {
  const { adminKey } = useParams();
  const navigate = useNavigate();
  const [colleges, setColleges] = useState([]);
  const [years, setYears] = useState([]);
  const { courses = [] } = useAdminAuth();
  // Filters can arrive pre-applied from another page (College page "View all" / count cards).
  const [searchParams] = useSearchParams();
  const [collegeId, setCollegeId] = useState(() => searchParams.get('collegeId') || '');
  const [courseId, setCourseId] = useState(() => searchParams.get('courseId') || '');
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [testStatus, setTestStatus] = useState(() => {
    const v = searchParams.get('testStatus');
    return v === 'REGISTERED' || v === 'TEST_WRITTEN' ? v : '';
  });
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showExport, setShowExport] = useState(false);

  useEffect(() => { const id = setTimeout(() => setSearch(searchInput.trim()), 350); return () => clearTimeout(id); }, [searchInput]);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);

  useEffect(() => {
    axios.get('/admin/colleges', { params: { all: true } })
      .then(res => setColleges(Array.isArray(res.data?.colleges) ? res.data.colleges : []))
      .catch(() => setColleges([]));
  }, []);

  const params = useMemo(() => ({
    collegeId: collegeId || undefined,
    courseId: courseId || undefined,
    year: year || undefined,
    month: month || undefined,
    testStatus: testStatus || undefined,
    search: search.trim() || undefined,
    page,
  }), [collegeId, courseId, year, month, testStatus, search, page]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    axios.get('/admin/students', { params })
      .then(res => {
        setData(res.data);
        setYears(Array.isArray(res.data?.registrationYears) ? res.data.registrationYears : []);
      })
      .catch(() => {
        setError('Could not load students. Please try again.');
        setData({ students: [], totalPages: 0, totalStudents: 0, totalAllStudents: 0 });
      })
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(() => { load(); }, [load]);

  const updateFilter = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  const selectedCollege = colleges.find(c => String(c.id) === String(collegeId));
  const selectedCourse = courses.find(c => String(c.id) === String(courseId));
  const selectedYear = year ? String(year) : '';
  const selectedMonth = month ? new Date(2000, Number(month) - 1, 1).toLocaleString('en-US', { month: 'long' }) : '';
  const filterSummary = [
    selectedCollege?.name ? `College: ${selectedCollege.name}` : null,
    selectedCourse?.name ? `Course: ${selectedCourse.name}` : null,
    selectedYear ? `Year: ${selectedYear}` : null,
    selectedMonth ? `Month: ${selectedMonth}` : null,
    testStatus === 'REGISTERED' ? 'Status: Test not written' : null,
    testStatus === 'TEST_WRITTEN' ? 'Status: Test written only' : null,
    search.trim() ? `Search: ${search.trim()}` : null,
  ].filter(Boolean).join(' · ');

  const handleExport = async (mode, fileName, columns = []) => {
    const filtered = mode === 'ALL_FILTERED';
    const res = await axios.get('/admin/students/export', {
      params: {
        mode,
        collegeId: filtered ? (collegeId || undefined) : undefined,
        courseId: filtered ? (courseId || undefined) : undefined,
        year: filtered ? (year || undefined) : undefined,
        month: filtered ? (month || undefined) : undefined,
        testStatus: filtered ? (testStatus || undefined) : undefined,
        search: filtered ? (search.trim() || undefined) : undefined,
        filename: fileName || undefined,
        // Columns picked in the popup, in click order; none = default columns.
        columns: columns.length ? columns.join(',') : undefined,
      },
      responseType: 'blob',
    });
    const filename = filenameFromDisposition(res.headers?.['content-disposition'], `students-${mode.toLowerCase()}.xlsx`);
    saveBlob(new Blob([res.data]), filename);
  };

  // Default name for the popup hint, built from the applied filters (same rule as the real export):
  // All Domains - College code (or All Colleges) - Month-Year / Year / today [- Status] [- Search].
  const getDefaultExportFilename = useCallback(async (mode) => {
    const filtered = mode === 'ALL_FILTERED';
    const res = await axios.get('/admin/students/export/filename', {
      params: {
        mode,
        collegeId: filtered ? (collegeId || undefined) : undefined,
        courseId: filtered ? (courseId || undefined) : undefined,
        year: filtered ? (year || undefined) : undefined,
        month: filtered ? (month || undefined) : undefined,
        testStatus: filtered ? (testStatus || undefined) : undefined,
        search: filtered ? (search.trim() || undefined) : undefined,
      },
    });
    return res.data?.filename || '';
  }, [collegeId, courseId, year, month, testStatus, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--eb-text)' }}>Students</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--eb-text-muted)' }}>Browse and export every registered student.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={() => setShowStudentForm(true)} className="eb-btn !w-auto px-4 py-3">+ Add Student</button>
          <button onClick={() => setShowBulk(true)} className="eb-btn-outline !w-auto px-4 py-3">Bulk Upload</button>
          <button onClick={() => setShowExport(true)} className="eb-btn !w-auto px-4 py-3 flex items-center gap-2 flex-shrink-0"><Ic.Download /> Export</button>
        </div>
      </div>

      <div className="rounded-2xl p-4 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
        <div className="mb-3">
          <label className="eb-label">Search Student</label>
          <input value={searchInput} onChange={e => { setSearchInput(e.target.value); setPage(1); }} placeholder="Search by name, email, mobile number or course..." className="eb-input text-sm" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="eb-label">College Name</label>
            <select value={collegeId} onChange={updateFilter(setCollegeId)} className="eb-input text-sm">
              <option value="">All Colleges</option>
              {colleges.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="eb-label">Course</label>
            <select value={courseId} onChange={updateFilter(setCourseId)} className="eb-input text-sm">
              <option value="">All Courses</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="eb-label">Registration Year</label>
            <input type="number" inputMode="numeric" min="1900" max="2100" list="registration-years" value={year}
              onChange={updateFilter(setYear)} placeholder="All years / enter year" className="eb-input text-sm" />
            <datalist id="registration-years">
              {years.map(y => <option key={y} value={y} />)}
            </datalist>
          </div>
          <div>
            <label className="eb-label">Registration Month</label>
            <select value={month} onChange={updateFilter(setMonth)} className="eb-input text-sm">
              <option value="">All Months</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString('en-US', { month: 'long' })}</option>)}
            </select>
          </div>
          <div>
            <label className="eb-label">Test Status</label>
            <select value={testStatus} onChange={updateFilter(setTestStatus)} className="eb-input text-sm">
              <option value="">All Students</option>
              <option value="REGISTERED">Registered — Test not written</option>
              <option value="TEST_WRITTEN">Test Written</option>
            </select>
          </div>
        </div>
        {(collegeId || courseId || year || month || testStatus || searchInput) && (
          <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t" style={{ borderColor: 'var(--eb-border)' }}>
            <p className="text-xs" style={{ color: 'var(--eb-text-muted)' }}>Current filter: <span className="font-medium" style={{ color: 'var(--eb-text)' }}>{filterSummary}</span></p>
            <button onClick={() => { setCollegeId(''); setCourseId(''); setYear(''); setMonth(''); setTestStatus(''); setSearchInput(''); setSearch(''); setPage(1); }} className="text-xs font-semibold" style={{ color: 'var(--eb-blue)' }}>Clear filters</button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'var(--eb-blue-soft)', color: 'var(--eb-blue)' }}><Ic.Users /></div>
          <div>
            <p className="text-sm font-semibold" style={{ color: 'var(--eb-text)' }}>{(data?.totalStudents ?? 0).toLocaleString()} students</p>
            <p className="text-xs" style={{ color: 'var(--eb-text-faint)' }}>Showing up to {PAGE_SIZE} per page</p>
          </div>
        </div>
      </div>

      {error ? <EmptyState message={error} /> : (
        <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--eb-border)' }}>
                  {['Student', 'College', 'Course', 'Branch', 'Registration Date', 'Test Status', 'Score', ''].map((h, i) => <th key={i} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--eb-text-faint)' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? <RowSkeleton rows={8} /> : (data?.students || []).length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-sm" style={{ color: 'var(--eb-text-muted)' }}>No students match the selected filters.</td></tr>
                ) : (data.students || []).map(s => (
                  <tr key={s.id} onClick={() => navigate(`/${adminKey}/admin/students/${s.id}`)} className="border-b last:border-b-0 cursor-pointer hover:opacity-95" style={{ borderColor: 'var(--eb-border)' }}>
                    <td className="px-4 py-3"><div className="font-medium text-sm" style={{ color: 'var(--eb-text)' }}>{s.name}</div><div className="text-xs mt-0.5" style={{ color: 'var(--eb-text-faint)' }}>{s.email}</div></td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--eb-text)' }}>{s.collegeName || '—'}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--eb-text)' }}>{s.courseName || '—'}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--eb-text-muted)' }}>{s.branch || '—'}</td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--eb-text-muted)' }}>{formatDate(s.registrationDate)}</td>
                    <td className="px-4 py-3"><span className="inline-flex px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: s.testWritten ? 'var(--eb-success-soft)' : 'var(--eb-warning-soft)', color: s.testWritten ? 'var(--eb-success)' : 'var(--eb-warning)' }}>{statusLabel(s)}</span></td>
                    <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--eb-text)' }}>{s.testSubmitted ? s.totalScore ?? '0' : '—'}</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold" style={{ color: 'var(--eb-blue)' }}>View</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!error && data && <Pagination page={data.page || page} totalPages={data.totalPages || 0} onChange={setPage} />}

      <ExportModal open={showExport} onClose={() => setShowExport(false)} onExport={handleExport} getDefaultFilename={getDefaultExportFilename} collegeFilterActive={!!collegeId} courseFilterActive={!!courseId}
        allCount={data?.totalAllStudents ?? 0} filteredCount={data?.totalStudents ?? 0}
        filteredSummary={filterSummary || 'No filters selected — this is the complete student list.'} />
      <StudentFormModal open={showStudentForm} onClose={() => setShowStudentForm(false)} onSaved={load} />
      <BulkStudentModal open={showBulk} onClose={() => setShowBulk(false)} onComplete={load} />
    </div>
  );
}

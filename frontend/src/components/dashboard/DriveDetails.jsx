import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../utils/api';
import { notify, notifyError } from '../../utils/notify';
import { filenameFromDisposition, saveBlob } from '../../utils/download';
import EmptyState from './shared/EmptyState.jsx';
import Pagination from './shared/Pagination.jsx';
import ExportModal from './shared/ExportModal.jsx';
import { RowSkeleton } from './shared/LoadingSkeleton.jsx';

const Ic = {
  Back: () => (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19l-7-7 7-7"
      />
    </svg>
  ),

  Download: () => (
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
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  ),
};

const PAGE_SIZE = 15;

/* -------------------------------------------------------------------------- */
/* Filename helper                                                            */
/* -------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------- */
/* Main component                                                             */
/* -------------------------------------------------------------------------- */

export default function DriveDetails() {
  const { adminKey, collegeId, driveId } = useParams();
  const navigate = useNavigate();

  const [drive, setDrive] = useState(null);
  const [courses, setCourses] = useState([]);

  /*
   * These filters are ONLY for completed-drive results.
   * They are intentionally not shown for ongoing/live drives.
   */
  const [courseId, setCourseId] = useState('');
  const [scoreMin, setScoreMin] = useState('');
  const [scoreMax, setScoreMax] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('desc');
  const [page, setPage] = useState(1);

  const [data, setData] = useState(null);
  const [showExport, setShowExport] = useState(false);

  const [liveStudents, setLiveStudents] = useState([]);
  const [liveSearch, setLiveSearch] = useState('');
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveError, setLiveError] = useState('');

  /* ---------------------------------------------------------------------- */
  /* Completed-drive search debounce                                        */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
    }, 350);

    return () => clearTimeout(id);
  }, [searchInput]);

  /* ---------------------------------------------------------------------- */
  /* Load drive details                                                     */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    axios
      .get(`/admin/drives/${driveId}`)
      .then(res => setDrive(res.data))
      .catch(() => setDrive(null));
  }, [driveId]);

  /* ---------------------------------------------------------------------- */
  /* Determine whether this drive is currently live                         */
  /* ---------------------------------------------------------------------- */

  const isOngoing = useMemo(() => {
    if (!drive?.startTime || !drive?.endTime) {
      return false;
    }

    const now = Date.now();

    const startMs = new Date(drive.startTime).getTime();
    const endMs = new Date(drive.endTime).getTime();

    return now >= startMs && now <= endMs;
  }, [drive]);

  /* ---------------------------------------------------------------------- */
  /* Courses are needed only for completed-drive result filters              */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!drive || isOngoing) {
      return;
    }

    axios
      .get('/admin/courses')
      .then(res => {
        setCourses(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        setCourses([]);
      });
  }, [drive, isOngoing]);

  /* ---------------------------------------------------------------------- */
  /* Completed-drive filter parameters                                       */
  /* ---------------------------------------------------------------------- */

  const filterParams = {
    courseId: courseId || undefined,
    scoreMin: scoreMin !== '' ? scoreMin : undefined,
    scoreMax: scoreMax !== '' ? scoreMax : undefined,
    search: search.trim() || undefined,
    sort,
  };

  /* ---------------------------------------------------------------------- */
  /* Load completed-drive students                                           */
  /*                                                                      */
  /* IMPORTANT: This API is NOT called for ongoing drives.                  */
  /* ---------------------------------------------------------------------- */

  const load = useCallback(() => {
    if (!drive || isOngoing) {
      return;
    }

    axios
      .get(`/admin/drives/${driveId}/students`, {
        params: {
          ...filterParams,
          page,
          size: PAGE_SIZE,
        },
      })
      .then(res => {
        setData(res.data);
      })
      .catch(() => {
        setData({
          content: [],
          totalPages: 0,
          totalElements: 0,
        });
      });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    drive,
    isOngoing,
    driveId,
    courseId,
    scoreMin,
    scoreMax,
    search,
    sort,
    page,
  ]);

  useEffect(() => {
    if (!isOngoing) {
      load();
    } else {
      /*
       * Ongoing drive does not use the normal student-results data.
       */
      setData(null);
      setShowExport(false);
    }
  }, [isOngoing, load]);

  /* ---------------------------------------------------------------------- */
  /* LIVE EXAMINATION CONTROL                                               */
  /*                                                                      */
  /* Refreshes live state every 5 seconds while drive is active.            */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (!drive || !isOngoing) {
      setLiveStudents([]);
      setLiveError('');
      return undefined;
    }

    let timer;
    let cancelled = false;

    const refreshLive = async () => {
      try {
        const res = await axios.get(
          `/admin/drives/${driveId}/live/students`
        );

        if (cancelled) {
          return;
        }

        setLiveStudents(
          Array.isArray(res.data) ? res.data : []
        );

        setLiveError('');
      } catch (e) {
        if (cancelled) {
          return;
        }

        setLiveError(
          e.response?.data?.message ||
            'Live exam state is temporarily unavailable.'
        );
      }
    };

    /*
     * Load immediately.
     */
    refreshLive();

    /*
     * Then keep live state refreshed.
     */
    timer = setInterval(refreshLive, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [drive, driveId, isOngoing]);

  /* ---------------------------------------------------------------------- */
  /* Live action                                                             */
  /* ---------------------------------------------------------------------- */

  const handleLiveAction = async (
    studentId,
    action,
    reason
  ) => {
    setLiveBusy(true);

    try {
      await axios.post(
        `/admin/drives/${driveId}/live/students/${studentId}/${action}`,
        { reason }
      );

      /*
       * Immediately refresh after admin action.
       */
      const res = await axios.get(
        `/admin/drives/${driveId}/live/students`
      );

      setLiveStudents(
        Array.isArray(res.data) ? res.data : []
      );
    } catch (e) {
      notifyError(e, 'Unable to update examination access.', 'Update failed');
    } finally {
      setLiveBusy(false);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* LIVE STUDENT SEARCH                                                     */
  /* ---------------------------------------------------------------------- */
  /*
   * Search is local against the students already returned by the live
   * examination endpoint. No API request is made for every keystroke.
   * Name/email are searched as text. Mobile numbers are normalized so
   * spaces, +91, hyphens, etc. do not prevent a match when the response
   * contains a phone/mobile field.
   */
  const filteredLiveStudents = useMemo(() => {
    const rawTerm = liveSearch.trim().toLowerCase();
    if (!rawTerm) return liveStudents;

    const normalizedTerm = rawTerm.replace(/\D/g, '');

    return liveStudents.filter(student => {
      const textValues = [
        student.fullName,
        student.email,
      ];

      const textMatch = textValues.some(value =>
        String(value ?? '').toLowerCase().includes(rawTerm)
      );

      if (textMatch) return true;
      if (!normalizedTerm) return false;

      const phoneValues = [
        student.phone,
        student.phoneNumber,
        student.mobileNumber,
        student.mobile,
      ];

      return phoneValues.some(value =>
        String(value ?? '').replace(/\D/g, '').includes(normalizedTerm)
      );
    });
  }, [liveStudents, liveSearch]);

  /* ---------------------------------------------------------------------- */
  /* Export                                                                  */
  /* ---------------------------------------------------------------------- */

  const exportOptions = [
    {
      key: 'CURRENT_PAGE',
      label: 'Current Page',
      count: data?.content?.length ?? 0,
    },
    {
      key: 'ALL_FILTERED',
      label: 'All Filtered Students',
      count: data?.totalElements ?? 0,
    },
    {
      key: 'ALL_STUDENTS',
      label: 'All Students',
      count: drive?.registered ?? 0,
    },
  ];

  const handleExportConfirm = async (mode, fileName, columns = []) => {
    const res = await axios.get(
      `/admin/drives/${driveId}/export`,
      {
        params: {
          ...filterParams,
          mode,
          currentPage: page,
          currentSize: PAGE_SIZE,
          filename: fileName || undefined,
          // Columns picked in the popup, in click order; none = default columns.
          columns: columns.length ? columns.join(',') : undefined,
        },
        responseType: 'blob',
      }
    );

    const filename = filenameFromDisposition(
      res.headers?.['content-disposition'],
      `drive-${driveId}-students.xlsx`
    );

    saveBlob(new Blob([res.data]), filename);
  };

  // Default name for the popup hint, built from the applied filters (same rule as the real export):
  // Course (or All Domains) - College code - Drive date [- Score] [- Search] [- Page].
  const getDefaultExportFilename = useCallback(async mode => {
    const res = await axios.get(`/admin/drives/${driveId}/export/filename`, {
      params: {
        mode,
        courseId: courseId || undefined,
        scoreMin: scoreMin !== '' ? scoreMin : undefined,
        scoreMax: scoreMax !== '' ? scoreMax : undefined,
        search: search.trim() || undefined,
        currentPage: page,
      },
    });
    return res.data?.filename || '';
  }, [driveId, courseId, scoreMin, scoreMax, search, page]);

  /* ---------------------------------------------------------------------- */
  /* Completed-drive filter summary                                          */
  /* ---------------------------------------------------------------------- */

  const courseName = courses.find(
    course =>
      String(course.id) === String(courseId)
  )?.name;

  const filterSummary = [
    {
      label: 'Drive',
      value: drive?.examCode || driveId,
    },

    {
      label: 'College',
      value: drive?.collegeName || '—',
    },

    ...(courseName
      ? [
          {
            label: 'Course',
            value: courseName,
          },
        ]
      : []),

    ...(search
      ? [
          {
            label: 'Search',
            value: search,
          },
        ]
      : []),

    {
      label: 'Sort',
      value:
        sort === 'desc'
          ? 'Score descending'
          : 'Score ascending',
    },
  ];

  /* ---------------------------------------------------------------------- */
  /* Back navigation                                                         */
  /* ---------------------------------------------------------------------- */

  const backTarget = collegeId
    ? {
        path: `/${adminKey}/admin/colleges/${collegeId}`,
        label: 'Back to College Overview',
      }
    : {
        path: `/${adminKey}/admin/drives`,
        label: 'Back to Drives',
      };

  /* ====================================================================== */
  /* UI                                                                      */
  /* ====================================================================== */

  return (
    <div className="space-y-5">

      {/* ------------------------------------------------------------------ */}
      {/* Back button                                                        */}
      {/* ------------------------------------------------------------------ */}

      <button
        onClick={() =>
          navigate(backTarget.path)
        }
        className="flex items-center gap-1.5 text-sm font-medium"
        style={{
          color: 'var(--eb-blue)',
        }}
      >
        <Ic.Back />
        {backTarget.label}
      </button>

      {/* ------------------------------------------------------------------ */}
      {/* Drive heading                                                      */}
      {/* ------------------------------------------------------------------ */}

      {drive && (
        <div>
          <h1
            className="text-xl font-bold"
            style={{
              color: 'var(--eb-text)',
            }}
          >
            Drive Details
          </h1>

          <p
            className="text-sm mt-1"
            style={{
              color: 'var(--eb-text-muted)',
            }}
          >
            {drive.examCode} ·{' '}

            {new Date(
              drive.startTime
            ).toLocaleDateString(
              'en-IN',
              {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }
            )}

            {' '}· {drive.collegeName}
          </p>
        </div>
      )}

      {/* ================================================================== */}
      {/* ONGOING DRIVE — LIVE EXAMINATION CONTROL ONLY                       */}
      {/* ================================================================== */}

      {drive && isOngoing && (
        <div
          className="rounded-2xl p-4 sm:p-5 border"
          style={{
            background: 'var(--eb-surface)',
            borderColor: 'var(--eb-border)',
          }}
        >

          {/* Live heading -------------------------------------------------- */}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">

            <div>
              <h3
                className="text-base font-semibold"
                style={{
                  color: 'var(--eb-text)',
                }}
              >
                Live Examination Control
              </h3>

              <p
                className="text-xs mt-1"
                style={{
                  color: 'var(--eb-text-faint)',
                }}
              >
                Live session control for the active examination.
              </p>
            </div>

            <span
              className="self-start sm:self-auto text-[11px] font-semibold px-2.5 py-1 rounded-full"
              style={{
                background:
                  'var(--eb-success-soft)',
                color:
                  'var(--eb-success)',
              }}
            >
              LIVE
            </span>

          </div>

          {/* Live student search ----------------------------------------- */}

          <div className="mb-4">
            <label className="eb-label">
              Search Student
            </label>

            <input
              value={liveSearch}
              onChange={e => setLiveSearch(e.target.value)}
              placeholder="Search by name, mobile or email"
              className="eb-input text-sm w-full"
              autoComplete="off"
              aria-label="Search live student by name, mobile or email"
            />

            <p
              className="text-[11px] mt-1"
              style={{ color: 'var(--eb-text-faint)' }}
            >
              Search students currently shown in Live Examination Control.
            </p>
          </div>

          {/* Live error --------------------------------------------------- */}

          {liveError && (
            <p
              className="text-xs mb-3"
              style={{
                color: '#dc2626',
              }}
            >
              {liveError}
            </p>
          )}

          {/* ============================================================= */}
          {/* DESKTOP LIVE TABLE                                             */}
          {/* ============================================================= */}

          <div className="hidden md:block overflow-x-auto">

            <table className="w-full text-left text-sm min-w-[760px]">

              <thead>
                <tr
                  className="text-[11px] uppercase tracking-wide"
                  style={{
                    color:
                      'var(--eb-text-faint)',
                  }}
                >
                  <th className="py-2 pr-4">
                    Student
                  </th>

                  <th className="py-2 pr-4">
                    Status
                  </th>

                  <th className="py-2 pr-4">
                    Progress
                  </th>

                  <th className="py-2 pr-4">
                    Violations
                  </th>

                  <th className="py-2 pr-4">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody
                className="divide-y"
                style={{
                  borderColor:
                    'var(--eb-border)',
                }}
              >

                {filteredLiveStudents.map(
                  student => (
                    <tr
                      key={student.studentId}
                    >

                      <td className="py-3 pr-4">

                        <div
                          className="font-medium"
                          style={{
                            color:
                              'var(--eb-text)',
                          }}
                        >
                          {student.fullName}
                        </div>

                        <div
                          className="text-xs"
                          style={{
                            color:
                              'var(--eb-text-faint)',
                          }}
                        >
                          {student.email}
                        </div>

                      </td>

                      <td className="py-3 pr-4">
                        <LiveStatusBadge
                          status={
                            student.status
                          }
                        />
                      </td>

                      <td
                        className="py-3 pr-4"
                        style={{
                          color:
                            'var(--eb-text-muted)',
                        }}
                      >
                        {student.answeredCount}/
                        {student.totalQuestions}
                      </td>

                      <td
                        className="py-3 pr-4"
                        style={{
                          color:
                            'var(--eb-text-muted)',
                        }}
                      >
                        {
                          student.tabSwitchViolations
                        }
                      </td>

                      <td className="py-3 pr-4">

                        <LiveActions
                          student={student}
                          liveBusy={liveBusy}
                          onAction={
                            handleLiveAction
                          }
                        />

                      </td>

                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>

          {/* ============================================================= */}
          {/* MOBILE LIVE CARDS                                              */}
          {/* ============================================================= */}

          <div className="md:hidden space-y-3">

            {filteredLiveStudents.map(
              student => (

                <div
                  key={student.studentId}
                  className="rounded-xl border p-3"
                  style={{
                    borderColor:
                      'var(--eb-border)',
                    background:
                      'var(--eb-surface-muted)',
                  }}
                >

                  <div className="flex items-start justify-between gap-3">

                    <div className="min-w-0">

                      <div
                        className="font-semibold truncate"
                        style={{
                          color:
                            'var(--eb-text)',
                        }}
                      >
                        {student.fullName}
                      </div>

                      <div
                        className="text-xs mt-0.5 break-all"
                        style={{
                          color:
                            'var(--eb-text-faint)',
                        }}
                      >
                        {student.email}
                      </div>

                    </div>

                    <LiveStatusBadge
                      status={
                        student.status
                      }
                    />

                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">

                    <div>

                      <span
                        style={{
                          color:
                            'var(--eb-text-faint)',
                        }}
                      >
                        Progress
                      </span>

                      <div
                        className="font-semibold mt-0.5"
                        style={{
                          color:
                            'var(--eb-text)',
                        }}
                      >
                        {student.answeredCount}/
                        {student.totalQuestions}
                      </div>

                    </div>

                    <div>

                      <span
                        style={{
                          color:
                            'var(--eb-text-faint)',
                        }}
                      >
                        Violations
                      </span>

                      <div
                        className="font-semibold mt-0.5"
                        style={{
                          color:
                            'var(--eb-text)',
                        }}
                      >
                        {
                          student.tabSwitchViolations
                        }
                      </div>

                    </div>

                  </div>

                  <div
                    className="mt-3 pt-3 border-t"
                    style={{
                      borderColor:
                        'var(--eb-border)',
                    }}
                  >

                    <LiveActions
                      student={student}
                      liveBusy={liveBusy}
                      onAction={
                        handleLiveAction
                      }
                      mobile
                    />

                  </div>

                </div>

              )
            )}

          </div>

          {/* No live students / no search result ------------------------- */}

          {filteredLiveStudents.length === 0 && (
            <div
              className="rounded-xl border p-5 text-center mt-3"
              style={{
                borderColor:
                  'var(--eb-border)',
                color:
                  'var(--eb-text-muted)',
              }}
            >
              {liveStudents.length === 0
                ? 'No students are currently active in this drive.'
                : 'No live student matches your search.'}
            </div>
          )}

        </div>
      )}

      {/* ================================================================== */}
      {/* COMPLETED DRIVE                                                    */}
      {/* ================================================================== */}

      {drive && !isOngoing && (
        <>

          {/* ---------------------------------------------------------------- */}
          {/* Completed-drive filters                                          */}
          {/* ---------------------------------------------------------------- */}

          <div
            className="rounded-2xl p-4 border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
            style={{
              background:
                'var(--eb-surface)',
              borderColor:
                'var(--eb-border)',
            }}
          >

            {/* Search ----------------------------------------------------- */}

            <div>

              <label className="eb-label">
                Search Student
              </label>

              <input
                value={searchInput}
                onChange={e => {
                  setSearchInput(
                    e.target.value
                  );
                  setPage(1);
                }}
                placeholder="Name, email or mobile"
                className="eb-input text-sm"
              />

            </div>

            {/* Course ----------------------------------------------------- */}

            <div>

              <label className="eb-label">
                Course
              </label>

              <select
                value={courseId}
                onChange={e => {
                  setCourseId(
                    e.target.value
                  );
                  setPage(1);
                }}
                className="eb-input text-sm"
              >

                <option value="">
                  All
                </option>

                {courses.map(course => (
                  <option
                    key={course.id}
                    value={course.id}
                  >
                    {course.name}
                  </option>
                ))}

              </select>

            </div>

            {/* Score minimum --------------------------------------------- */}

            <div>

              <label className="eb-label">
                Score Min %
              </label>

              <input
                type="number"
                min="0"
                max="100"
                value={scoreMin}
                onChange={e => {
                  setScoreMin(
                    e.target.value
                  );
                  setPage(1);
                }}
                className="eb-input text-sm"
              />

            </div>

            {/* Score maximum --------------------------------------------- */}

            <div>

              <label className="eb-label">
                Score Max %
              </label>

              <input
                type="number"
                min="0"
                max="100"
                value={scoreMax}
                onChange={e => {
                  setScoreMax(
                    e.target.value
                  );
                  setPage(1);
                }}
                className="eb-input text-sm"
              />

            </div>

            {/* Sort ------------------------------------------------------- */}

            <div>

              <label className="eb-label">
                Sort by Score
              </label>

              <select
                value={sort}
                onChange={e => {
                  setSort(
                    e.target.value
                  );
                  setPage(1);
                }}
                className="eb-input text-sm"
              >

                <option value="desc">
                  Highest → Lowest
                </option>

                <option value="asc">
                  Lowest → Highest
                </option>

              </select>

            </div>

          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Completed-drive students                                        */}
          {/* ---------------------------------------------------------------- */}

          <div
            className="rounded-2xl p-4 sm:p-5 border"
            style={{
              background:
                'var(--eb-surface)',
              borderColor:
                'var(--eb-border)',
            }}
          >

            <div className="flex items-center justify-between gap-3 mb-4">

              <h3
                className="text-sm font-semibold"
                style={{
                  color:
                    'var(--eb-text)',
                }}
              >
                Students{' '}
                {data
                  ? `(${data.totalElements})`
                  : ''}
              </h3>

              <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() =>
                  setShowExport(true)
                }
                disabled={
                  !data ||
                  data.totalElements === 0
                }
                className="eb-btn-outline !w-auto !py-2 !px-3.5 text-xs flex items-center gap-1.5 disabled:opacity-40"
              >
                <Ic.Download />
                Export
              </button>

              <button
                onClick={() =>
                  navigate(
                    collegeId
                      ? `/${adminKey}/admin/colleges/${collegeId}/drives/${driveId}/shortlist`
                      : `/${adminKey}/admin/drives/${driveId}/shortlist`
                  )
                }
                disabled={
                  !data ||
                  data.totalElements === 0
                }
                className="eb-btn !w-auto !py-2 !px-3.5 text-xs flex items-center gap-1.5 disabled:opacity-40"
              >
                Shortlist &amp; Export
              </button>
              </div>

            </div>

            {/* Loading --------------------------------------------------- */}

            {data === null ? (
              <RowSkeleton rows={8} />

            ) : data.content.length > 0 ? (

              <div className="space-y-4">

                <div className="overflow-x-auto">

                  <table className="w-full text-left text-sm min-w-[850px]">

                    <thead>

                      <tr
                        className="text-[11px] uppercase tracking-wide"
                        style={{
                          color:
                            'var(--eb-text-faint)',
                        }}
                      >

                        <th className="py-2 pr-4">
                          S.No
                        </th>

                        <th className="py-2 pr-4">
                          Student
                        </th>

                        <th className="py-2 pr-4">
                          Course
                        </th>

                        <th className="py-2 pr-4">
                          College
                        </th>

                        <th className="py-2 pr-4">
                          Score
                        </th>

                        <th className="py-2 pr-4">
                          Percentage
                        </th>

                        <th className="py-2 pr-4">
                          Attempted
                        </th>

                        <th className="py-2 pr-4">
                          Submitted
                        </th>

                      </tr>

                    </thead>

                    <tbody
                      className="divide-y"
                      style={{
                        borderColor:
                          'var(--eb-border)',
                      }}
                    >

                      {data.content.map(
                        (student, i) => (

                          <tr
                            key={
                              student.studentId
                            }
                            onClick={() =>
                              navigate(
                                `/${adminKey}/admin/students/${student.studentId}`
                              )
                            }
                            className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
                          >

                            <td
                              className="py-2.5 pr-4"
                              style={{
                                color:
                                  'var(--eb-text-faint)',
                              }}
                            >
                              {(page - 1) *
                                PAGE_SIZE +
                                i +
                                1}
                            </td>

                            <td
                              className="py-2.5 pr-4 font-medium"
                              style={{
                                color:
                                  'var(--eb-text)',
                              }}
                            >
                              {student.fullName}
                            </td>

                            <td
                              className="py-2.5 pr-4"
                              style={{
                                color:
                                  'var(--eb-text-muted)',
                              }}
                            >
                              {student.courseName}
                            </td>

                            <td
                              className="py-2.5 pr-4"
                              style={{
                                color:
                                  'var(--eb-text-muted)',
                              }}
                            >
                              {student.collegeName ||
                                drive?.collegeName ||
                                '—'}
                            </td>

                            <td
                              className="py-2.5 pr-4 font-semibold"
                              style={{
                                color:
                                  'var(--eb-blue)',
                              }}
                            >
                              {student.totalScore ??
                                '—'}
                            </td>

                            <td
                              className="py-2.5 pr-4 font-semibold"
                              style={{
                                color:
                                  'var(--eb-blue)',
                              }}
                            >
                              {student.scorePercent !=
                              null
                                ? `${student.scorePercent.toFixed(
                                    1
                                  )}%`
                                : '—'}
                            </td>

                            <td className="py-2.5 pr-4">

                              <span
                                className="eb-badge"
                                style={{
                                  background:
                                    student.attempted
                                      ? 'var(--eb-success-soft)'
                                      : 'var(--eb-surface-muted)',

                                  color:
                                    student.attempted
                                      ? 'var(--eb-success)'
                                      : 'var(--eb-text-faint)',
                                }}
                              >
                                {student.attempted
                                  ? 'Yes'
                                  : 'No'}
                              </span>

                            </td>

                            <td
                              className="py-2.5 pr-4"
                              style={{
                                color:
                                  'var(--eb-text-muted)',
                              }}
                            >
                              {student.submitted
                                ? 'Yes'
                                : 'No'}
                            </td>

                          </tr>

                        )
                      )}

                    </tbody>

                  </table>

                </div>

                <Pagination
                  page={page}
                  totalPages={
                    data.totalPages
                  }
                  onChange={setPage}
                />

              </div>

            ) : (

              <EmptyState
                message="No students match the selected filters."
              />

            )}

          </div>

          {/* Export ------------------------------------------------------ */}

          <ExportModal
            open={showExport}
            onClose={() =>
              setShowExport(false)
            }
            onConfirm={
              handleExportConfirm
            }
            options={exportOptions}
            filterSummary={
              filterSummary
            }
            getDefaultFilename={
              getDefaultExportFilename
            }
            columnType="DRIVE"
            courseFiltered={!!courseId}
            collegeFiltered
          />

        </>
      )}

    </div>
  );
}

/* ========================================================================== */
/* Live status badge                                                          */
/* ========================================================================== */

function LiveStatusBadge({ status }) {
  const style = {
    background:
      status === 'ACTIVE'
        ? 'var(--eb-success-soft)'
        : status === 'RESTRICTED'
          ? 'rgba(245,158,11,.12)'
          : status === 'TERMINATED'
            ? 'rgba(239,68,68,.12)'
            : 'var(--eb-surface-muted)',

    color:
      status === 'ACTIVE'
        ? 'var(--eb-success)'
        : status === 'RESTRICTED'
          ? '#d97706'
          : status === 'TERMINATED'
            ? '#dc2626'
            : 'var(--eb-text-muted)',
  };

  return (
    <span
      className="eb-badge whitespace-nowrap"
      style={style}
    >
      {status}
    </span>
  );
}

/* ========================================================================== */
/* Live actions                                                               */
/* ========================================================================== */

function LiveActions({
  student,
  liveBusy,
  onAction,
  mobile = false,
}) {
  if (
    student.status === 'COMPLETED' ||
    student.submitted
  ) {
    return (
      <span
        className="text-xs"
        style={{
          color:
            'var(--eb-text-faint)',
        }}
      >
        No action required
      </span>
    );
  }

  const buttonClass = mobile
    ? 'text-xs font-semibold px-3 py-2 rounded-lg flex-1 sm:flex-none'
    : 'text-xs font-semibold px-3 py-1.5 rounded-lg';

  return (
    <div
      className={`flex ${
        mobile
          ? 'flex-col sm:flex-row'
          : 'items-center'
      } gap-2 sm:gap-3`}
    >

      {/* Allow Resume ---------------------------------------------------- */}

      {student.status === 'RESTRICTED' && (
        <button
          disabled={liveBusy}
          onClick={() => {

            if (
              window.confirm(
                `Allow ${student.fullName} to resume the exam?`
              )
            ) {

              const reason =
                window.prompt(
                  `Reason for allowing ${student.fullName} to resume the exam?`,
                  'Admin allowed exam resume.'
                );

              if (reason !== null) {
                onAction(
                  student.studentId,
                  'resume',
                  reason
                );
              }
            }

          }}
          className={buttonClass}
          style={{
            color: '#b45309',
            background:
              'rgba(245,158,11,.12)',
            border:
              '1px solid rgba(245,158,11,.30)',
          }}
        >
          Allow Resume
        </button>
      )}

      {/* Force Submit --------------------------------------------------- */}

      <button
        disabled={liveBusy}
        onClick={() => {

          if (
            window.confirm(
              `Force submit ${student.fullName}'s exam?`
            )
          ) {

            const reason =
              window.prompt(
                `Reason for force submitting ${student.fullName}'s exam?`,
                'Admin-directed submission.'
              );

            if (reason !== null) {
              onAction(
                student.studentId,
                'force-submit',
                reason
              );
            }
          }

        }}
        className={buttonClass}
        style={{
          color: '#dc2626',
          border: mobile
            ? '1px solid rgba(239,68,68,.25)'
            : undefined,
          background: mobile
            ? 'rgba(239,68,68,.06)'
            : undefined,
        }}
      >
        Force Submit
      </button>

    </div>
  );
}
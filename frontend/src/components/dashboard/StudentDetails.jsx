import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../utils/api';
import EmptyState from './shared/EmptyState.jsx';
import { CardSkeleton } from './shared/LoadingSkeleton.jsx';

const Ic = { Back: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>) };

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--eb-text-faint)' }}>{label}</p>
      <p className="text-sm mt-0.5 font-medium" style={{ color: 'var(--eb-text)' }}>{value ?? '—'}</p>
    </div>
  );
}

export default function StudentDetails() {
  const { adminKey, studentId } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`/admin/students/${studentId}`)
      .then(res => setStudent(res.data))
      .catch(() => setError('Could not load this student. They may not exist.'));
  }, [studentId]);

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--eb-blue)' }}>
        <Ic.Back /> Back
      </button>

      {error ? (
        <EmptyState message={error} />
      ) : !student ? (
        <CardSkeleton height={320} />
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--eb-text)' }}>{student.fullName}</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--eb-text-muted)' }}>{student.collegeName}</p>
          </div>

          <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--eb-text)' }}>Personal & Academic</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              <Field label="Email" value={student.email} />
              <Field label="Phone" value={student.phoneNumber} />
              <Field label="College" value={student.collegeName} />
              <Field label="Course" value={student.courseName} />
              <Field label="Branch" value={student.branch} />
              <Field label="Qualification" value={student.highestQualification} />
              <Field label="Aggregate %" value={student.aggregateMarks != null ? `${student.aggregateMarks}%` : null} />
              <Field label="Year of Passing" value={student.yearOfPassing} />
            </div>
          </div>

          <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--eb-text)' }}>Exam & Result</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              <Field label="Exam Code" value={student.examCode} />
              <Field label="Exam Date" value={student.examDate ? new Date(student.examDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null} />
              <Field label="Attempted" value={student.attempted ? 'Yes' : 'No'} />
              <Field label="Submitted" value={student.submitted ? 'Yes' : 'No'} />
              <Field label="Score" value={student.totalScore != null ? `${student.totalScore} / ${student.paperSize}` : null} />
              <Field label="Score %" value={student.scorePercent != null ? `${student.scorePercent.toFixed(1)}%` : null} />
              <Field label="Submission Type" value={student.submissionType} />
              <Field label="Submission Time" value={student.submissionTime ? new Date(student.submissionTime).toLocaleString('en-IN') : null} />
              <Field label="Attempt Duration" value={student.attemptDurationSeconds != null ? `${Math.round(student.attemptDurationSeconds / 60)} min` : null} />
              <Field label="Tab Switch Violations" value={student.tabSwitchViolations} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

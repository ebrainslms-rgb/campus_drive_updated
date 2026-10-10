import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../utils/api';
import EmptyState from './shared/EmptyState.jsx';
import { CardSkeleton } from './shared/LoadingSkeleton.jsx';
import StudentFormModal from './StudentFormModal.jsx';

const Ic = { Back: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>) };

function Field({ label, value }) {
  return <div><p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--eb-text-faint)' }}>{label}</p><p className="text-sm mt-0.5 font-medium" style={{ color: 'var(--eb-text)' }}>{value ?? '—'}</p></div>;
}

export default function StudentDetails() {
  const { adminKey, studentId } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    axios.get(`/admin/students/${studentId}`)
      .then(res => { setStudent(res.data); setError(''); })
      .catch(() => setError('Could not load this student. They may not exist.'));
  };

  useEffect(() => { load(); }, [studentId]);

  const deleteStudent = async () => {
    setDeleting(true);
    try {
      await axios.delete(`/admin/students/${studentId}`);
      navigate(`/${adminKey}/admin/students`, { replace: true });
    } catch (e) {
      setError(e.response?.data?.message || 'Could not delete this student.');
      setDeleteOpen(false);
    } finally { setDeleting(false); }
  };

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--eb-blue)' }}><Ic.Back /> Back</button>

      {error ? <EmptyState message={error} /> : !student ? <CardSkeleton height={320} /> : (
        <>
          <div className="flex items-start justify-between gap-4">
            <div><h1 className="text-2xl font-bold" style={{ color: 'var(--eb-text)' }}>{student.fullName}</h1><p className="text-sm mt-1" style={{ color: 'var(--eb-text-muted)' }}>{student.collegeName}</p></div>
            <div className="flex gap-2"><button onClick={() => setEditOpen(true)} className="eb-btn !w-auto px-4 py-2.5">Edit Student</button><button onClick={() => setDeleteOpen(true)} className="eb-btn-outline !w-auto px-4 py-2.5" style={{ color: '#DC2626', borderColor: 'rgba(220,38,38,.35)' }}>Delete</button></div>
          </div>

          <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--eb-text)' }}>Personal & Academic</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              <Field label="Email" value={student.email} /><Field label="Phone" value={student.phoneNumber} /><Field label="Gender" value={student.gender} />
              <Field label="Date of Birth" value={student.dob ? new Date(student.dob).toLocaleDateString('en-IN') : null} />
              <Field label="College" value={student.collegeName} /><Field label="Location" value={student.location} />
              <Field label="State" value={student.state} /><Field label="Domain (Course)" value={student.courseName} /><Field label="Branch" value={student.branch} />
              <Field label="Qualification" value={student.highestQualification} />
              <Field label={student.academicScoreType === 'CGPA' ? 'CGPA' : 'Aggregate %'} value={student.aggregateMarks != null ? (student.academicScoreType === 'CGPA' ? `${student.aggregateMarks}` : `${student.aggregateMarks}%`) : null} />
              <Field label="Year of Passing" value={student.yearOfPassing} />
            </div>
          </div>

          <div className="rounded-2xl p-5 border" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--eb-text)' }}>Exam & Result</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
              <Field label="Exam Code" value={student.examCode} /><Field label="Exam Date" value={student.examDate ? new Date(student.examDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null} />
              <Field label="Attempted" value={student.attempted ? 'Yes' : 'No'} /><Field label="Submitted" value={student.submitted ? 'Yes' : 'No'} />
              <Field label="Score" value={student.totalScore != null ? `${student.totalScore} / ${student.paperSize}` : null} /><Field label="Score %" value={student.scorePercent != null ? `${student.scorePercent.toFixed(1)}%` : null} />
              <Field label="Submission Type" value={student.submissionType} /><Field label="Submission Time" value={student.submissionTime ? new Date(student.submissionTime).toLocaleString('en-IN') : null} />
              <Field label="Attempt Duration" value={student.attemptDurationSeconds != null ? `${Math.round(student.attemptDurationSeconds / 60)} min` : null} /><Field label="Tab Switch Violations" value={student.tabSwitchViolations} />
            </div>
          </div>
        </>
      )}

      <StudentFormModal open={editOpen} onClose={() => setEditOpen(false)} initialStudent={student} onSaved={load} />

      {deleteOpen && student && <div className="fixed inset-0 z-[130] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.60)', backdropFilter: 'blur(4px)' }}>
        <div className="w-full max-w-md rounded-2xl border shadow-2xl p-6" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)', color: 'var(--eb-text)' }}>
          <h3 className="text-lg font-semibold">Delete student?</h3>
          <p className="text-sm mt-2" style={{ color: 'var(--eb-text-muted)' }}>This permanently removes <b>{student.fullName}</b>, their registration record, exam answers and related activity logs. Other students and drives are not affected.</p>
          <div className="flex gap-3 justify-end mt-6"><button onClick={() => setDeleteOpen(false)} disabled={deleting} className="eb-btn-outline !w-auto px-4 py-2.5">Cancel</button><button onClick={deleteStudent} disabled={deleting} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: '#DC2626' }}>{deleting ? 'Deleting…' : 'Delete Student'}</button></div>
        </div>
      </div>}
    </div>
  );
}

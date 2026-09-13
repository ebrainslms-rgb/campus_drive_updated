import React, { useState, useEffect, useCallback } from 'react';
import axios from '../../utils/api';
import QuestionPreview from './QuestionPreview.jsx';

const TYPE_OPTIONS = ['aptitude', 'logical', 'programming', 'frontend'];
const ANSWER_OPTIONS = ['A', 'B', 'C', 'D'];

function EditQuestionForm({ q, style, locked, onSaved, onCancel }) {
  const [form, setForm] = useState({
    type: q.type, question: q.question,
    optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD,
    correctAnswer: q.correctAnswer,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!form.question.trim() || !form.optionA.trim() || !form.optionB.trim() || !form.optionC.trim() || !form.optionD.trim()) {
      setError('Question and all four options are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const res = await axios.put(`/admin/questions/${q.id}`, form);
      onSaved(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update question. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ background: 'var(--eb-surface-muted)', borderColor: style.color + '55' }}>
      <div>
        <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--eb-text-faint)' }}>Question</label>
        <textarea value={form.question} onChange={e => set('question', e.target.value)} rows={4} disabled={locked}
          className="w-full text-sm px-3 py-2 rounded-lg font-mono resize-y"
          style={{ background: 'var(--eb-surface)', border: '1px solid var(--eb-border)', color: 'var(--eb-text)', whiteSpace: 'pre-wrap' }} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {['optionA', 'optionB', 'optionC', 'optionD'].map((key, i) => (
          <div key={key}>
            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--eb-text-faint)' }}>Option {ANSWER_OPTIONS[i]}</label>
            <textarea value={form[key]} onChange={e => set(key, e.target.value)} rows={2} disabled={locked}
              className="w-full text-sm px-3 py-2 rounded-lg font-mono resize-y"
              style={{ background: 'var(--eb-surface)', border: '1px solid var(--eb-border)', color: 'var(--eb-text)', whiteSpace: 'pre-wrap' }} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4">
        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--eb-text-faint)' }}>Correct Answer</label>
          <select value={form.correctAnswer} onChange={e => set('correctAnswer', e.target.value)} disabled={locked}
            className="text-sm px-3 py-2 rounded-lg" style={{ background: 'var(--eb-surface)', border: '1px solid var(--eb-border)', color: 'var(--eb-text)' }}>
            {ANSWER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--eb-text-faint)' }}>Section</label>
          <select value={form.type} onChange={e => set('type', e.target.value)} disabled={locked}
            className="text-sm px-3 py-2 rounded-lg" style={{ background: 'var(--eb-surface)', border: '1px solid var(--eb-border)', color: 'var(--eb-text)' }}>
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--eb-danger)' }}>{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving || locked} className="eb-btn !w-auto !py-2 !px-4 text-xs disabled:opacity-40">
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button onClick={onCancel} disabled={saving} className="!w-auto !py-2 !px-4 text-xs rounded-lg border" style={{ borderColor: 'var(--eb-border)', color: 'var(--eb-text-faint)' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function QuestionRow({ q, index, style, locked, onSaved }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <EditQuestionForm q={q} style={style} locked={locked}
      onSaved={(updated) => { setEditing(false); onSaved(updated); }}
      onCancel={() => setEditing(false)} />;
  }

  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-bold px-2 py-0.5 rounded-md flex-shrink-0" style={{ background: style.bg, color: style.color }}>Q{index + 1}</span>
        <p className="flex-1 text-sm" style={{ color: 'var(--eb-text)', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{q.question}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-3 ml-9">
        {[['A', q.optionA], ['B', q.optionB], ['C', q.optionC], ['D', q.optionD]].map(([letter, text]) => (
          <div key={letter} className="text-xs flex gap-2" style={{ color: q.correctAnswer === letter ? 'var(--eb-success)' : 'var(--eb-text-muted)' }}>
            <span className="font-bold flex-shrink-0">{letter}.</span>
            <span style={{ whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{text}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 ml-9">
        <span className="text-[11px] font-semibold" style={{ color: 'var(--eb-success)' }}>Correct Answer: {q.correctAnswer}</span>
        <button onClick={() => setEditing(true)} disabled={locked}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg border disabled:opacity-40"
          style={{ borderColor: style.color + '55', color: style.color }}>
          Edit
        </button>
      </div>
    </div>
  );
}

function AddQuestionForm({ courseId, locked, onAdded, onCancel }) {
  const [form, setForm] = useState({ type: 'aptitude', question: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'A' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!form.question.trim() || !form.optionA.trim() || !form.optionB.trim() || !form.optionC.trim() || !form.optionD.trim()) {
      setError('Question and all four options are required.'); return;
    }
    setSaving(true); setError('');
    try {
      const res = await axios.post('/admin/questions', { ...form, courseId });
      onAdded(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add question. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-dashed p-5 space-y-3" style={{ background: 'var(--eb-surface-muted)', borderColor: 'var(--eb-border)' }}>
      <h4 className="text-sm font-semibold" style={{ color: 'var(--eb-text)' }}>Add a New Question</h4>
      <textarea value={form.question} onChange={e => set('question', e.target.value)} rows={4} disabled={locked}
        placeholder="Question text…"
        className="w-full text-sm px-3 py-2 rounded-lg font-mono resize-y"
        style={{ background: 'var(--eb-surface)', border: '1px solid var(--eb-border)', color: 'var(--eb-text)', whiteSpace: 'pre-wrap' }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {['optionA', 'optionB', 'optionC', 'optionD'].map((key, i) => (
          <textarea key={key} value={form[key]} onChange={e => set(key, e.target.value)} rows={2} disabled={locked}
            placeholder={`Option ${ANSWER_OPTIONS[i]}`}
            className="w-full text-sm px-3 py-2 rounded-lg font-mono resize-y"
            style={{ background: 'var(--eb-surface)', border: '1px solid var(--eb-border)', color: 'var(--eb-text)' }} />
        ))}
      </div>
      <div className="flex items-center gap-4">
        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--eb-text-faint)' }}>Correct Answer</label>
          <select value={form.correctAnswer} onChange={e => set('correctAnswer', e.target.value)} disabled={locked}
            className="text-sm px-3 py-2 rounded-lg" style={{ background: 'var(--eb-surface)', border: '1px solid var(--eb-border)', color: 'var(--eb-text)' }}>
            {ANSWER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--eb-text-faint)' }}>Section</label>
          <select value={form.type} onChange={e => set('type', e.target.value)} disabled={locked}
            className="text-sm px-3 py-2 rounded-lg" style={{ background: 'var(--eb-surface)', border: '1px solid var(--eb-border)', color: 'var(--eb-text)' }}>
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--eb-danger)' }}>{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving || locked} className="eb-btn !w-auto !py-2 !px-4 text-xs disabled:opacity-40">
          {saving ? 'Saving…' : 'Save Question'}
        </button>
        <button onClick={onCancel} disabled={saving} className="!w-auto !py-2 !px-4 text-xs rounded-lg border" style={{ borderColor: 'var(--eb-border)', color: 'var(--eb-text-faint)' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Question Review / Edit screen for one course. Reached via "Review
 * Current Questions" beside "CSV Template" on the existing Question
 * Upload panel - not a route, just another internal view of
 * QuestionsView.jsx, matching how course-selection -> upload-panel
 * already worked before this feature existed.
 *
 * CSV upload remains completely untouched and is still the primary way
 * to bulk-load questions - this screen only manages what's already in
 * the database (view, edit, optionally add one at a time).
 */
export default function QuestionReview({ course, style, onBack }) {
  const [data, setData] = useState(null); // { questions, editingLocked }
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const load = useCallback(() => {
    setError('');
    axios.get(`/admin/questions/course/${course.id}`)
      .then(res => setData(res.data))
      .catch(() => setError('Unable to load questions. Please try again.'));
  }, [course.id]);

  useEffect(() => { load(); }, [load]);

  if (showPreview) {
    return <QuestionPreview course={course} style={style} questions={data?.questions || []} onBack={() => setShowPreview(false)} />;
  }

  // Group questions by type, preserving the order the backend already
  // sorted them in (aptitude, logical, programming, frontend).
  const sections = [];
  if (data) {
    for (const q of data.questions) {
      let section = sections.find(s => s.key === q.type);
      if (!section) {
        section = { key: q.type, questions: [] };
        sections.push(section);
      }
      section.questions.push(q);
    }
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-slate-800 dark:hover:text-slate-100" style={{ color: style.color }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to Course
        </button>
        <div className="h-4 w-px bg-slate-100 dark:bg-slate-800" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{course.name}</h2>
        {data && <span className="text-xs font-medium" style={{ color: 'var(--eb-text-faint)' }}>Total Questions: {data.questions.length}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowPreview(true)} disabled={!data || data.questions.length === 0}
            className="eb-btn-outline !w-auto !py-2 !px-4 text-xs disabled:opacity-40">
            Preview Question Paper
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--eb-danger-soft)', color: 'var(--eb-danger)' }}>{error}</div>
      )}

      {data?.editingLocked && (
        <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'var(--eb-warning-soft)', border: '1px solid rgba(217,119,6,0.3)' }}>
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="var(--eb-warning)" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <p className="text-sm font-medium" style={{ color: 'var(--eb-warning)' }}>
            A student is currently taking an exam using this question set. Editing and adding questions is disabled until the drive finishes.
          </p>
        </div>
      )}

      {!data && !error && (
        <p className="text-sm" style={{ color: 'var(--eb-text-muted)' }}>Loading questions…</p>
      )}

      {data && sections.map(section => (
        <div key={section.key} className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold" style={{ color: 'var(--eb-text)' }}>
              {section.key.charAt(0).toUpperCase() + section.key.slice(1)}
            </h3>
            <span className="text-xs" style={{ color: 'var(--eb-text-faint)' }}>{section.questions.length} Questions</span>
          </div>
          <div className="space-y-3">
            {section.questions.map((q, i) => (
              <QuestionRow key={q.id} q={q} index={i} style={style} locked={data.editingLocked}
                onSaved={(updated) => setData(prev => ({
                  ...prev,
                  questions: prev.questions.map(existing => existing.id === updated.id ? updated : existing),
                }))} />
            ))}
          </div>
        </div>
      ))}

      {data && (
        showAddForm ? (
          <AddQuestionForm courseId={course.id} locked={data.editingLocked}
            onAdded={() => { setShowAddForm(false); load(); }}
            onCancel={() => setShowAddForm(false)} />
        ) : (
          <button onClick={() => setShowAddForm(true)} disabled={data.editingLocked}
            className="w-full py-3 rounded-xl text-sm font-semibold border-2 border-dashed transition-colors disabled:opacity-40"
            style={{ borderColor: 'var(--eb-border)', color: 'var(--eb-text-faint)' }}>
            + Add Question
          </button>
        )
      )}
    </div>
  );
}

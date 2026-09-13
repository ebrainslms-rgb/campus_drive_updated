import React from 'react';
import QuestionCard from '../shared/QuestionCard.jsx';
import { styleForCategory } from '../shared/sectionStyles.js';

/**
 * Read-only preview of the full question paper, exactly as a student
 * would see it during the exam - reuses the literal same QuestionCard
 * component from the live exam page, in "locked" (non-interactive) mode.
 * No Edit/Delete/Save controls exist here by design; this screen only
 * shows what students will see, it never changes anything.
 */
export default function QuestionPreview({ course, style, questions, onBack }) {
  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-slate-800 dark:hover:text-slate-100" style={{ color: style.color }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Back to Review
        </button>
        <div className="h-4 w-px bg-slate-100 dark:bg-slate-800" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{course.name} — Preview</h2>
        <span className="text-xs font-medium" style={{ color: 'var(--eb-text-faint)' }}>{questions.length} Questions</span>
      </div>

      <p className="text-xs rounded-lg px-3 py-2 inline-block" style={{ background: 'var(--eb-surface-muted)', color: 'var(--eb-text-faint)' }}>
        Read-only — this is exactly what a student will see. Go back to make changes.
      </p>

      <div className="space-y-4 max-w-3xl">
        {questions.map((q, i) => (
          <QuestionCard key={q.id} question={q} globalIndex={i}
            selectedOption={null} onSelect={() => {}} locked={true}
            categoryStyle={styleForCategory(q.type, i)} />
        ))}
      </div>
    </div>
  );
}

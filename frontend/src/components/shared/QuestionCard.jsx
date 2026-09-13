import React from "react";

/**
 * Renders one question with its four options - used both by the live
 * student exam (ExamPage.jsx) and the admin's read-only question preview
 * (Question Review screen). Extracted here, unchanged, specifically so
 * both places render questions identically - "how will this look to the
 * student" only means something if it's the literal same component.
 *
 * `locked` fully disables interaction (buttons become non-clickable,
 * onSelect is never called) - this is what makes the admin preview
 * genuinely read-only, not just visually similar.
 */
export default function QuestionCard({ question, globalIndex, selectedOption, onSelect, locked, categoryStyle }) {
  const opts = [question.optionA, question.optionB, question.optionC, question.optionD];
  const keys = ["A", "B", "C", "D"];

  return (
    <div className="rounded-2xl overflow-hidden border" style={{ background: "var(--eb-surface)", borderColor: "var(--eb-border)" }}>
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--eb-border)", background: "var(--eb-surface-muted)" }}>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-md" style={{ background: "rgba(249,115,22,0.12)", color: "var(--eb-orange)" }}>Q{globalIndex + 1}</span>
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: categoryStyle.bg, color: categoryStyle.color }}>{categoryStyle.label}</span>
        </div>
        {selectedOption !== null && selectedOption !== undefined && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--eb-success-soft)", color: "var(--eb-success)", border: "1px solid rgba(16,185,129,0.3)" }}>Answered</span>
        )}
      </div>

      <div className="px-5 py-4">
        <p className="text-sm leading-relaxed font-medium" style={{ color: "var(--eb-text)", whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>{question.question}</p>
      </div>

      <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {opts.map((opt, idx) => {
          const isSelected = selectedOption === idx;
          return (
            <button key={keys[idx]} onClick={() => !locked && onSelect(question.id, idx)} disabled={locked}
              className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm text-left transition-all duration-150"
              style={{
                background: isSelected ? "rgba(249,115,22,0.10)" : "var(--eb-surface-muted)",
                border: `1.5px solid ${isSelected ? "rgba(249,115,22,0.5)" : "var(--eb-border)"}`,
                color: isSelected ? "var(--eb-orange)" : "var(--eb-text)",
                cursor: locked ? "not-allowed" : "pointer",
                transform: isSelected ? "scale(1.01)" : "scale(1)",
              }}>
              <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5"
                style={{
                  background: isSelected ? "rgba(249,115,22,0.22)" : "var(--eb-surface)",
                  color: isSelected ? "var(--eb-orange)" : "var(--eb-text-faint)",
                  border: `1px solid ${isSelected ? "rgba(249,115,22,0.4)" : "var(--eb-border)"}`,
                }}>
                {keys[idx]}
              </span>
              <span className="leading-snug" style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>{opt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

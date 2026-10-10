/**
 * Section (question type) display styling - color, background, label per
 * question.type value. Extracted from ExamPage.jsx so the admin Question
 * Review screen groups/colors sections identically to what students see
 * on the live exam sidebar, rather than an approximate lookalike.
 *
 * Not an exhaustive whitelist - any question.type value NOT in this map
 * still renders (see styleForCategory below), just with an auto-generated
 * color instead of a hand-picked one.
 */
export const KNOWN_SECTION_STYLE = {
  aptitude:    { color: "#818CF8", bg: "rgba(129,140,248,0.14)", label: "Aptitude" },
  logical:     { color: "#10B981", bg: "rgba(52,211,153,0.14)",  label: "Logical & Verbal" },
  programming: { color: "#EA580C", bg: "rgba(249,115,22,0.14)",  label: "Programming" },
  frontend:    { color: "#0891B2", bg: "rgba(6,182,212,0.14)",   label: "Front-End" },
  health:      { color: "#16A34A", bg: "rgba(34,197,94,0.14)",   label: "Health" },
};

export const FALLBACK_COLORS = ["#A855F7", "#EC4899", "#84CC16", "#F59E0B", "#3B82F6"];

export function styleForCategory(key, fallbackIndex) {
  if (KNOWN_SECTION_STYLE[key]) return KNOWN_SECTION_STYLE[key];
  const color = FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];
  const label = key ? key.charAt(0).toUpperCase() + key.slice(1).toLowerCase() : "Other";
  return { color, bg: `${color}24`, label };
}

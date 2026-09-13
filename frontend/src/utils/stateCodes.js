/**
 * Supported states for college registration (requirement: state must be a
 * dropdown, not free text). The FULL NAME is the canonical value stored on
 * the College record and used everywhere (student registration display,
 * dashboard filters, etc.) - the short code is only used for compact UI
 * badges. Extend this list to add more states later.
 */
export const STATE_OPTIONS = [
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'TS', name: 'Telangana' },
  { code: 'KA', name: 'Karnataka' },
];

const STATE_CODE_MAP = STATE_OPTIONS.reduce((map, opt) => {
  map[opt.name] = opt.code;
  return map;
}, {});

/* Full state name -> short code (e.g. "Karnataka" -> "KA"), for compact
   badges only. Unknown / already-coded values are returned unchanged. */
export const stateToCode = (state) => {
  if (!state) return '';
  return STATE_CODE_MAP[state] || state;
};

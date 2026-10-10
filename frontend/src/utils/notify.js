/**
 * App-styled popups for the admin portal (replaces browser alert()).
 * Rendered by AdminContext, so it looks the same everywhere and never
 * freezes the page the way alert() does.
 */
export function notify(message, title = 'Please check') {
  window.dispatchEvent(new CustomEvent('eb-notify', { detail: { title, message } }));
}

/**
 * Shows an API error in the popup. Permission errors (403) are already shown
 * as "Permission Required" by the api.js interceptor, so they are skipped
 * here to avoid a second popup.
 */
export function notifyError(error, fallback = 'Something went wrong. Please try again.', title = 'Action failed') {
  if (error?.permissionHandled) return;
  notify(error?.response?.data?.message || fallback, title);
}

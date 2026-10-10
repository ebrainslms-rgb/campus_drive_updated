/**
 * Reads the download name from a Content-Disposition header.
 * Prefers the UTF-8 form (filename*=UTF-8''...) so names with any language
 * characters survive; falls back to the plain filename="...".
 */
export function filenameFromDisposition(headerValue, fallback) {
  if (!headerValue) return fallback;
  const star = headerValue.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/);
  if (star?.[1]) {
    try { return decodeURIComponent(star[1].trim()); } catch { /* fall through */ }
  }
  const plain = headerValue.match(/filename\s*=\s*"([^"]*)"/i) || headerValue.match(/filename\s*=\s*([^;]+)/i);
  if (plain?.[1] && !plain[1].startsWith('=?')) return plain[1].trim();
  return fallback;
}

/** Saves a Blob as a file download. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Characters Windows/macOS reject in file names. */
export const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/;

/**
 * The server's message for a failed download. File downloads use
 * responseType 'blob', so a JSON error body arrives as a Blob and must be read.
 */
export async function downloadErrorMessage(error, fallback = 'Export failed. Please try again.') {
  if (error?.response?.status === 403) return "You don't have permission to export.";
  const data = error?.response?.data;
  try {
    if (data instanceof Blob) {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message) return parsed.message;
    } else if (data?.message) {
      return data.message;
    }
  } catch { /* not JSON */ }
  return error?.response ? fallback : 'Cannot reach the server. Please check your connection and try again.';
}

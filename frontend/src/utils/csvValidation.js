import Papa from 'papaparse';

/**
 * Client-side CSV preview/validation for the question upload flow.
 * Deliberately mirrors the backend's QuestionService validation rules
 * exactly, so the preview the admin sees is trustworthy — but this is a
 * PREVIEW ONLY. The backend independently re-validates every row on the
 * real upload; this never replaces that, it just avoids surprising the
 * admin with an unreviewed bulk write.
 *
 * Rules (must match backend):
 *  - type must be one of aptitude/logical/programming/frontend (case-insensitive)
 *  - question, optionA, optionB, optionC, optionD must all be non-blank
 *  - correctAnswer (or legacy header correctAns) must be A/B/C/D (case-insensitive)
 */

const VALID_TYPES = ['aptitude', 'logical', 'programming', 'frontend'];
const VALID_ANSWERS = ['A', 'B', 'C', 'D'];
const REQUIRED_HEADERS = ['question', 'optionA', 'optionB', 'optionC', 'optionD', 'type'];

export function parseAndValidateCsv(file) {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const headers = results.meta.fields || [];
        const hasAnswerHeader = headers.includes('correctAnswer') || headers.includes('correctAns');
        const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
        if (!hasAnswerHeader) missingHeaders.push('correctAnswer (or correctAns)');

        if (missingHeaders.length > 0) {
          resolve({
            fatal: true,
            fatalReason: `Missing required column${missingHeaders.length > 1 ? 's' : ''}: ${missingHeaders.join(', ')}.`,
            totalRows: 0, validCount: 0, invalidCount: 0, issues: [], validRows: [],
          });
          return;
        }

        const issues = [];
        let validCount = 0;
        const seenQuestions = new Map(); // for duplicate detection within this file
        let duplicateCount = 0;

        results.data.forEach((row, idx) => {
          const rowNum = idx + 2; // +1 for header, +1 for 1-based display
          const question = (row.question || '').trim();
          const optionA = (row.optionA || '').trim();
          const optionB = (row.optionB || '').trim();
          const optionC = (row.optionC || '').trim();
          const optionD = (row.optionD || '').trim();
          const type = (row.type || '').trim().toLowerCase();
          let correctAnswer = (row.correctAnswer || row.correctAns || '').trim().toUpperCase();

          const rowIssues = [];
          if (!question) rowIssues.push('question is empty');
          if (!optionA || !optionB || !optionC || !optionD) rowIssues.push('one or more options (A–D) are empty');
          if (!VALID_TYPES.includes(type)) rowIssues.push(`invalid type "${row.type || ''}" (must be aptitude, logical, programming, or frontend)`);
          if (!VALID_ANSWERS.includes(correctAnswer)) rowIssues.push(`invalid correctAnswer "${row.correctAnswer || row.correctAns || ''}" (must be A, B, C, or D)`);

          let isDuplicate = false;
          if (question) {
            const key = question.toLowerCase();
            if (seenQuestions.has(key)) {
              isDuplicate = true;
              duplicateCount++;
            } else {
              seenQuestions.set(key, rowNum);
            }
          }

          if (rowIssues.length > 0) {
            issues.push({ row: rowNum, reasons: rowIssues, duplicate: isDuplicate });
          } else if (isDuplicate) {
            // Not invalid per backend rules (backend has no duplicate check),
            // but surfaced to the admin as a heads-up, not a blocker.
            issues.push({ row: rowNum, reasons: ['duplicate question text within this file'], duplicate: true, warningOnly: true });
            validCount++;
          } else {
            validCount++;
          }
        });

        resolve({
          fatal: false,
          totalRows: results.data.length,
          validCount,
          invalidCount: results.data.length - validCount,
          duplicateCount,
          issues,
        });
      },
      error: () => {
        resolve({
          fatal: true,
          fatalReason: 'Could not read this file. Make sure it is a valid CSV.',
          totalRows: 0, validCount: 0, invalidCount: 0, issues: [],
        });
      },
    });
  });
}

/** Basic pre-flight checks before even attempting to parse. */
export function validateFileBasics(file, maxSizeMB = 5) {
  if (!file) return 'No file selected.';
  const isCsv = file.name.toLowerCase().endsWith('.csv') ||
    file.type === 'text/csv' || file.type === 'application/vnd.ms-excel';
  if (!isCsv) return 'Only .csv files are accepted.';
  if (file.size === 0) return 'This file is empty.';
  if (file.size > maxSizeMB * 1024 * 1024) return `File is too large (max ${maxSizeMB}MB).`;
  return null;
}

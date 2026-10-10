import React, { useEffect, useState } from 'react';
import axios from '../../utils/api';

function downloadBase64(base64, filename) {
  if (!base64) return;

  const bytes = Uint8Array.from(
    atob(base64),
    c => c.charCodeAt(0)
  );

  const url = URL.createObjectURL(
    new Blob(
      [bytes],
      {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    )
  );

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

export default function BulkStudentModal({
  open,
  onClose,
  onComplete
}) {

  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const [collegePickerOpen, setCollegePickerOpen] = useState(false);
  const [colleges, setColleges] = useState([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState('');
  const [loadingColleges, setLoadingColleges] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  // Download confirmation state
  const [downloadConfirmation, setDownloadConfirmation] = useState(null);

  useEffect(() => {

    if (open) {

      setFile(null);
      setPreview(null);
      setError('');
      setResult(null);
      setLoading(false);
      setConfirming(false);

      setCollegePickerOpen(false);
      setSelectedCollegeId('');
      setDownloadConfirmation(null);
    }

  }, [open]);

  if (!open) return null;

  // ---------------------------------------------------------
  // Upload + Validate
  // ---------------------------------------------------------

  const chooseFile = async (e) => {

    const f = e.target.files?.[0];

    setFile(f || null);
    setPreview(null);
    setResult(null);
    setError('');

    if (!f) return;

    if (!/\.(xlsx|csv)$/i.test(f.name)) {

      setError(
        'Only Excel (.xlsx) or CSV files are supported.'
      );

      return;
    }

    setLoading(true);

    try {

      const fd = new FormData();

      fd.append('file', f);

      const res = await axios.post(
        '/admin/students/bulk/preview',
        fd,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      setPreview(res.data);

    } catch (err) {

      setError(
        err.response?.data?.message ||
        'Could not validate the file.'
      );

    } finally {

      setLoading(false);
    }
  };

  // ---------------------------------------------------------
  // Confirm Upload
  // ---------------------------------------------------------

  const confirm = async () => {

    if (!file || !preview?.canConfirm) return;

    setConfirming(true);
    setError('');

    try {

      const fd = new FormData();

      fd.append('file', file);

      const res = await axios.post(
        '/admin/students/bulk/confirm',
        fd,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      /*
       * IMPORTANT:
       * No automatic Excel downloads here.
       *
       * The result is stored and download buttons are shown below.
       */
      setResult(res.data);

      onComplete?.();

    } catch (err) {

      setError(
        err.response?.data?.message ||
        'Bulk upload could not be completed.'
      );

    } finally {

      setConfirming(false);
    }
  };

  // ---------------------------------------------------------
  // Download Confirmation
  // ---------------------------------------------------------

  const askDownload = (
    base64,
    filename,
    title
  ) => {

    if (!base64) return;

    setDownloadConfirmation({
      base64,
      filename,
      title
    });
  };

  const confirmDownload = () => {

    if (!downloadConfirmation) return;

    downloadBase64(
      downloadConfirmation.base64,
      downloadConfirmation.filename
    );

    setDownloadConfirmation(null);
  };

  const cancelDownload = () => {
    setDownloadConfirmation(null);
  };

  // ---------------------------------------------------------
  // College Picker
  // ---------------------------------------------------------

  const openTemplateCollegePicker = async () => {

    setError('');
    setCollegePickerOpen(true);
    setLoadingColleges(true);

    try {

      const res = await axios.get(
        '/admin/colleges/public'
      );

      const list =
        Array.isArray(res.data?.colleges)
          ? res.data.colleges
          : [];

      setColleges(list);

      setSelectedCollegeId(
        list.length === 1
          ? String(list[0].id)
          : ''
      );

    } catch (err) {

      setCollegePickerOpen(false);

      setError(
        err.response?.data?.message ||
        'Could not load active colleges.'
      );

    } finally {

      setLoadingColleges(false);
    }
  };

  // ---------------------------------------------------------
  // Download Template
  // ---------------------------------------------------------

  const downloadTemplate = async () => {

    if (!selectedCollegeId) return;

    setDownloadingTemplate(true);
    setError('');

    try {

      const res = await axios.get(
        '/admin/students/bulk/template',
        {
          params: {
            collegeId: selectedCollegeId
          },
          responseType: 'blob'
        }
      );

      const url = URL.createObjectURL(
        new Blob(
          [res.data],
          {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          }
        )
      );

      const a = document.createElement('a');

      a.href = url;
      a.download = 'student-bulk-upload-template.xlsx';
      a.click();

      URL.revokeObjectURL(url);

      setCollegePickerOpen(false);

    } catch (err) {

      setError(
        err.response?.data?.message ||
        'Could not generate the template.'
      );

    } finally {

      setDownloadingTemplate(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4"
      style={{
        background: 'rgba(15,23,42,.60)',
        backdropFilter: 'blur(4px)'
      }}
    >

      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl p-6"
        style={{
          background: 'var(--eb-surface)',
          borderColor: 'var(--eb-border)',
          color: 'var(--eb-text)'
        }}
      >

        {/* -------------------------------------------------- */}
        {/* Header */}
        {/* -------------------------------------------------- */}

        <div className="flex items-start justify-between gap-4">

          <div>

            <h3 className="text-lg font-semibold">
              Bulk Student Upload
            </h3>

            <p
              className="text-xs mt-1"
              style={{
                color: 'var(--eb-text-muted)'
              }}
            >
              Upload Excel/CSV → validate → confirm.
              Nothing is inserted until confirmation.
            </p>

          </div>

          <button
            onClick={onClose}
            className="text-xl"
            style={{
              color: 'var(--eb-text-muted)'
            }}
          >
            ×
          </button>

        </div>

        {/* -------------------------------------------------- */}
        {/* Upload / Template buttons */}
        {/* -------------------------------------------------- */}

        <div className="mt-5 flex flex-wrap gap-2">

          <label
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer"
            style={{
              background: 'var(--eb-blue)'
            }}
          >

            Choose Excel / CSV

            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={chooseFile}
              className="hidden"
            />

          </label>

          <button
            onClick={openTemplateCollegePicker}
            disabled={
              loadingColleges ||
              downloadingTemplate
            }
            className="px-4 py-2.5 rounded-xl border text-sm font-semibold disabled:opacity-60"
            style={{
              borderColor: 'var(--eb-border)',
              color: 'var(--eb-text-muted)'
            }}
          >
            Download Template
          </button>

          {file && (
            <span
              className="text-xs self-center"
              style={{
                color: 'var(--eb-text-muted)'
              }}
            >
              {file.name}
            </span>
          )}

        </div>

        {/* -------------------------------------------------- */}
        {/* Loading */}
        {/* -------------------------------------------------- */}

        {loading && (

          <div
            className="mt-5 text-sm"
            style={{
              color: 'var(--eb-text-muted)'
            }}
          >
            Validating all rows against the file and database…
          </div>

        )}

        {/* -------------------------------------------------- */}
        {/* Error */}
        {/* -------------------------------------------------- */}

        {error && (

          <div
            className="mt-5 p-3 rounded-xl text-sm"
            style={{
              color: '#DC2626',
              background: 'rgba(239,68,68,.08)',
              border: '1px solid rgba(239,68,68,.25)'
            }}
          >
            {error}
          </div>

        )}

        {/* -------------------------------------------------- */}
        {/* Preview */}
        {/* -------------------------------------------------- */}

        {preview && !loading && (

          <div className="mt-5 space-y-4">

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">

              <Stat
                label="Total"
                value={preview.totalRows}
              />

              <Stat
                label="New"
                value={preview.validNew}
                good
              />

              <Stat
                label="Already registered"
                value={preview.alreadyRegistered}
              />

              <Stat
                label="File duplicates"
                value={preview.duplicateRows}
                bad
              />

              <Stat
                label="Invalid / conflict"
                value={preview.invalidRows}
                bad
              />

            </div>

            {/* Validation message */}

            <div
              className="p-3 rounded-xl text-xs"
              style={{
                background: preview.canConfirm
                  ? 'rgba(34,197,94,.08)'
                  : 'rgba(245,158,11,.08)',

                border: `1px solid ${
                  preview.canConfirm
                    ? 'rgba(34,197,94,.25)'
                    : 'rgba(245,158,11,.25)'
                }`,

                color: preview.canConfirm
                  ? '#15803D'
                  : '#B45309'
              }}
            >

              {preview.canConfirm
                ? 'Validation passed. You can now confirm the upload.'
                : 'Upload blocked. Correct the failed rows shown below and upload the corrected file again.'
              }

            </div>

            {/* ------------------------------------------------ */}
            {/* Failed Rows Download */}
            {/* ------------------------------------------------ */}

            {!preview.canConfirm &&
              preview.failedReportBase64 && (

                <div
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border"
                  style={{
                    borderColor: 'var(--eb-border)',
                    background: 'var(--eb-surface-muted)'
                  }}
                >

                  <div>

                    <p className="text-sm font-semibold">
                      Failed rows
                    </p>

                    <p
                      className="text-xs mt-1"
                      style={{
                        color: 'var(--eb-text-muted)'
                      }}
                    >
                      Download the failed rows, correct them,
                      and upload the corrected file.
                    </p>

                  </div>

                  <button
                    onClick={() =>
                      askDownload(
                        preview.failedReportBase64,
                        'student-upload-failed-rows.xlsx',
                        'Download Failed Rows'
                      )
                    }
                    className="shrink-0 px-4 py-2.5 rounded-xl border text-sm font-semibold"
                    style={{
                      borderColor: 'var(--eb-border)',
                      color: 'var(--eb-text)'
                    }}
                  >
                    Download Failed Rows
                  </button>

                </div>

              )}

            {/* ------------------------------------------------ */}
            {/* Validation table */}
            {/* ------------------------------------------------ */}

            {preview.rows?.length > 0 && (

              <div
                className="max-h-56 overflow-auto border rounded-xl"
                style={{
                  borderColor: 'var(--eb-border)'
                }}
              >

                <table className="w-full text-left text-xs">

                  <thead>

                    <tr
                      className="border-b"
                      style={{
                        borderColor: 'var(--eb-border)'
                      }}
                    >

                      <th className="p-2">
                        Row
                      </th>

                      <th className="p-2">
                        Name
                      </th>

                      <th className="p-2">
                        Email
                      </th>

                      <th className="p-2">
                        Mobile
                      </th>

                      <th className="p-2">
                        Status
                      </th>

                      <th className="p-2">
                        Message
                      </th>

                    </tr>

                  </thead>

                  <tbody>

                    {preview.rows.map(r => (

                      <tr
                        key={r.rowNumber}
                        className="border-b"
                        style={{
                          borderColor: 'var(--eb-border)'
                        }}
                      >

                        <td className="p-2">
                          {r.rowNumber}
                        </td>

                        <td className="p-2">
                          {r.fullName}
                        </td>

                        <td className="p-2">
                          {r.email}
                        </td>

                        <td className="p-2">
                          {r.phoneNumber}
                        </td>

                        <td className="p-2 font-semibold">
                          {r.status}
                        </td>

                        <td
                          className="p-2"
                          style={{
                            color: '#DC2626'
                          }}
                        >
                          {r.error || '—'}
                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            )}

            {/* ------------------------------------------------ */}
            {/* Confirm Upload */}
            {/* ------------------------------------------------ */}

            {preview.canConfirm && (

              <button
                onClick={confirm}
                disabled={confirming}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{
                  background: 'var(--eb-blue)'
                }}
              >
                {confirming
                  ? 'Uploading…'
                  : `Confirm Upload (${preview.validNew} new students)`
                }
              </button>

            )}

          </div>

        )}

        {/* -------------------------------------------------- */}
        {/* Upload Result */}
        {/* -------------------------------------------------- */}

        {result && (

          <div
            className="mt-5 p-4 rounded-xl"
            style={{
              background: 'rgba(34,197,94,.08)',
              border: '1px solid rgba(34,197,94,.25)'
            }}
          >

            <p className="font-semibold">
              Upload completed
            </p>

            <p className="text-sm mt-1">
              {result.uploadedSuccessfully}
              {' '}
              students uploaded successfully.
            </p>

            <p className="text-sm">
              {result.alreadyRegistered}
              {' '}
              students were already registered and were skipped.
            </p>

            {/* ------------------------------------------------ */}
            {/* Existing Upload Rows */}
            {/* ------------------------------------------------ */}

            {result.existingReportBase64 && (

              <button
                onClick={() =>
                  askDownload(
                    result.existingReportBase64,
                    'students-already-registered-upload-rows.xlsx',
                    'Download Existing Upload Rows'
                  )
                }
                className="mt-4 mr-2 px-4 py-2.5 rounded-xl border text-sm font-semibold"
                style={{
                  borderColor: 'var(--eb-border)',
                  color: 'var(--eb-text)'
                }}
              >
                Download Existing Upload Rows
              </button>

            )}

            {/* ------------------------------------------------ */}
            {/* Existing Database Records */}
            {/* ------------------------------------------------ */}

            {result.existingDatabaseReportBase64 && (

              <button
                onClick={() =>
                  askDownload(
                    result.existingDatabaseReportBase64,
                    'students-already-registered-database-records.xlsx',
                    'Download Database Records'
                  )
                }
                className="mt-4 px-4 py-2.5 rounded-xl border text-sm font-semibold"
                style={{
                  borderColor: 'var(--eb-border)',
                  color: 'var(--eb-text)'
                }}
              >
                Download Database Records
              </button>

            )}

            {result.alreadyRegistered > 0 && (

              <p
                className="text-xs mt-3"
                style={{
                  color: 'var(--eb-text-muted)'
                }}
              >
                The Excel reports are available above.
                They will not be downloaded automatically.
              </p>

            )}

          </div>

        )}

        {/* -------------------------------------------------- */}
        {/* Close */}
        {/* -------------------------------------------------- */}

        <div className="flex justify-end mt-6">

          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border text-sm font-semibold"
            style={{
              borderColor: 'var(--eb-border)',
              color: 'var(--eb-text-muted)'
            }}
          >
            Close
          </button>

        </div>

        {/* ================================================== */}
        {/* College Picker */}
        {/* ================================================== */}

        {collegePickerOpen && (

          <div
            className="fixed inset-0 z-[150] flex items-center justify-center p-4"
            style={{
              background: 'rgba(15,23,42,.45)',
              backdropFilter: 'blur(3px)'
            }}
          >

            <div
              className="w-full max-w-md rounded-2xl border shadow-2xl p-6"
              style={{
                background: 'var(--eb-surface)',
                borderColor: 'var(--eb-border)',
                color: 'var(--eb-text)'
              }}
            >

              <div className="flex items-start justify-between gap-4">

                <div>

                  <h4 className="text-base font-semibold">
                    Download Student Template
                  </h4>

                  <p
                    className="text-xs mt-1"
                    style={{
                      color: 'var(--eb-text-muted)'
                    }}
                  >
                    Select the college. Its college code will be
                    pre-filled into the starter rows.
                  </p>

                </div>

                <button
                  onClick={() =>
                    setCollegePickerOpen(false)
                  }
                  className="text-xl"
                  style={{
                    color: 'var(--eb-text-muted)'
                  }}
                >
                  ×
                </button>

              </div>

              <label className="block mt-5 text-sm font-medium">
                College
              </label>

              <select
                value={selectedCollegeId}
                onChange={(e) =>
                  setSelectedCollegeId(e.target.value)
                }
                disabled={
                  loadingColleges ||
                  downloadingTemplate
                }
                className="w-full mt-2 px-3 py-2.5 rounded-xl border outline-none"
                style={{
                  background: 'var(--eb-surface)',
                  borderColor: 'var(--eb-border)',
                  color: 'var(--eb-text)'
                }}
              >

                <option value="">
                  Select college
                </option>

                {colleges.map(c => (

                  <option
                    key={c.id}
                    value={c.id}
                  >
                    {c.name}
                    {c.code ? ` (${c.code})` : ''}
                  </option>

                ))}

              </select>

              {selectedCollegeId && (

                <p
                  className="text-xs mt-2"
                  style={{
                    color: 'var(--eb-text-muted)'
                  }}
                >
                  The selected college code will automatically
                  be placed in 10 starter rows. You can extend
                  or remove rows in Excel as needed.
                </p>

              )}

              <div className="flex justify-end gap-2 mt-6">

                <button
                  onClick={() =>
                    setCollegePickerOpen(false)
                  }
                  disabled={downloadingTemplate}
                  className="px-4 py-2.5 rounded-xl border text-sm font-semibold"
                  style={{
                    borderColor: 'var(--eb-border)',
                    color: 'var(--eb-text-muted)'
                  }}
                >
                  Cancel
                </button>

                <button
                  onClick={downloadTemplate}
                  disabled={
                    !selectedCollegeId ||
                    loadingColleges ||
                    downloadingTemplate
                  }
                  className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
                  style={{
                    background: 'var(--eb-blue)'
                  }}
                >
                  {downloadingTemplate
                    ? 'Generating…'
                    : 'Download'
                  }
                </button>

              </div>

            </div>

          </div>

        )}

        {/* ================================================== */}
        {/* Download Confirmation */}
        {/* ================================================== */}

        {downloadConfirmation && (

          <div
            className="fixed inset-0 z-[180] flex items-center justify-center p-4"
            style={{
              background: 'rgba(15,23,42,.50)',
              backdropFilter: 'blur(3px)'
            }}
          >

            <div
              className="w-full max-w-md rounded-2xl border shadow-2xl p-6"
              style={{
                background: 'var(--eb-surface)',
                borderColor: 'var(--eb-border)',
                color: 'var(--eb-text)'
              }}
            >

              <h4 className="text-base font-semibold">
                {downloadConfirmation.title}
              </h4>

              <p
                className="text-sm mt-2"
                style={{
                  color: 'var(--eb-text-muted)'
                }}
              >
                Do you want to download this Excel file?
              </p>

              <div className="flex justify-end gap-2 mt-6">

                <button
                  onClick={cancelDownload}
                  className="px-4 py-2.5 rounded-xl border text-sm font-semibold"
                  style={{
                    borderColor: 'var(--eb-border)',
                    color: 'var(--eb-text-muted)'
                  }}
                >
                  Cancel
                </button>

                <button
                  onClick={confirmDownload}
                  className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
                  style={{
                    background: 'var(--eb-blue)'
                  }}
                >
                  Download
                </button>

              </div>

            </div>

          </div>

        )}

      </div>

    </div>
  );
}

function Stat({
  label,
  value,
  good,
  bad
}) {

  return (

    <div
      className="rounded-xl p-3 border"
      style={{
        background: 'var(--eb-surface-muted)',
        borderColor: 'var(--eb-border)'
      }}
    >

      <div
        className="text-lg font-bold"
        style={{
          color: bad
            ? '#DC2626'
            : good
              ? '#16A34A'
              : 'var(--eb-text)'
        }}
      >
        {value}
      </div>

      <div
        className="text-[10px] uppercase tracking-wide"
        style={{
          color: 'var(--eb-text-faint)'
        }}
      >
        {label}
      </div>

    </div>
  );
}
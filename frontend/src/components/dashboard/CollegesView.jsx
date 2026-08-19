import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../utils/api';
import { useAdminAuth } from '../../context/AdminContext';
import { STATE_OPTIONS, stateToCode } from '../../utils/stateCodes';

const API = '/admin/colleges';

/* ── Cyan required asterisk ───────────────────────────────────────────── */
const Req = () => <span style={{ color: '#06B6D4' }}> *</span>;

/* ── Status confirmation modal ────────────────────────────────────────── */
function StatusConfirmModal({ college, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(251,191,36,0.12)', border: '1.5px solid rgba(251,191,36,0.35)' }}>
            <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100">Change College Status</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{college.name}</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Are you sure you want to change this college's status to{' '}
          <span className="font-semibold" style={{ color: college.isActive ? '#F87171' : '#34D399' }}>
            {college.isActive ? 'Inactive' : 'Active'}
          </span>?
        </p>
        <div className="flex gap-3 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-medium">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl text-slate-800 dark:text-slate-100 text-sm font-semibold transition-all"
            style={{ background: college.isActive ? 'linear-gradient(135deg,#F87171,#DC2626)' : 'linear-gradient(135deg,#34D399,#059669)' }}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Add / Edit modal ─────────────────────────────────────────────────── */
function CollegeModal({ mode, data, onClose, onSave }) {
  const blank = { name: '', location: '', district: '', state: '' };
  const [form, setForm] = useState(
    data ? { name: data.name || '', location: data.location || '', district: data.district || '', state: data.state || '' } : blank
  );  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (mode === 'add') {
        await axios.post(API, form);
      } else {
        await axios.put(`${API}/${data.id}`, form);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 dark:border-blue-400 focus:ring-1 focus:ring-cyan-500/30 transition-colors';
  const labelCls = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            {mode === 'add' ? 'Add New College' : 'Edit College'}
          </h3>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* College Name */}
          <div>
            <label className={labelCls}>College Name<Req /></label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. RV College of Engineering" required className={inputCls} />
          </div>

          {/* College Code — auto-generated by the backend from name + location,
              stable across edits. Not editable here. */}
          {mode === 'edit' && (
            <div>
              <label className={labelCls}>College Code</label>
              <input type="text" value={data?.code || ''} disabled
                className={inputCls + ' opacity-60 cursor-not-allowed'} />
            </div>
          )}

          {/* Location */}
          <div>
            <label className={labelCls}>District / Location<Req /></label>
            <input type="text" value={form.location} onChange={e => set('location', e.target.value)}
              placeholder="e.g. Bangalore" required className={inputCls} />
          </div>

          {/* State */}
          <div>
            <label className={labelCls}>State<Req /></label>
            <select value={form.state} onChange={e => set('state', e.target.value)} required
              className={inputCls + ' appearance-none cursor-pointer'}>
              <option value="" disabled>— Select state —</option>
              {STATE_OPTIONS.map(o => (
                <option key={o.code} value={o.name}>{o.name}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-red-400 text-sm flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-slate-800 dark:text-slate-100 transition-colors disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #06B6D4, #3B82F6)' }}>
              {loading ? 'Saving…' : 'Save College'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main View ────────────────────────────────────────────────────────── */
export default function CollegesView() {
  const { allColleges, loadingColleges, fetchColleges } = useAdminAuth();
  const navigate = useNavigate();
  const { adminKey } = useParams();

  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [filterDistrict, setFilterDistrict] = useState('All');
  const [filterState, setFilterState] = useState('All');
  const [search, setSearch] = useState('');
  const [statusConfirm, setStatusConfirm] = useState(null);

  const ITEMS_PER_PAGE = 10;

  // Derive locations list from context data
  const locations = [...new Set(allColleges.map(c => c.location).filter(Boolean))].sort();
  const states    = [...new Set(allColleges.map(c => stateToCode(c.state)).filter(Boolean))].sort();

  // Filter + paginate client-side from context
  const filtered = allColleges.filter(c => {
    const matchSearch = !search ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.code?.toLowerCase().includes(search.toLowerCase());
    const matchDistrict = filterDistrict === 'All' || c.location === filterDistrict;
    const matchState    = filterState === 'All' || stateToCode(c.state) === filterState;
    return matchSearch && matchDistrict && matchState;
  });

  const totalPages    = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const colleges      = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, filterDistrict, filterState]);

  const confirmToggle = async () => {
    const { college } = statusConfirm;
    setStatusConfirm(null);
    try {
      await axios.patch(`${API}/${college.id}/toggle`, { isActive: !college.isActive });
      fetchColleges(); // update global context → reflects everywhere
    } catch (err) { console.error(err); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Colleges</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Manage onboarded colleges and their status</p>
        </div>
        <button onClick={() => setModal({ mode: 'add' })}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-slate-800 dark:text-slate-100 shadow-lg transition-all hover:scale-[1.02]"
          style={{ background: 'linear-gradient(135deg, #06B6D4, #3B82F6)' }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add College
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input type="text" placeholder="Search by name or code…" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 dark:border-blue-400 transition-colors" />
        <select value={filterDistrict} onChange={e => { setFilterDistrict(e.target.value); setPage(1); }}
          className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-blue-500 dark:border-blue-400 transition-colors">
          {['All', ...locations].map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterState} onChange={e => { setFilterState(e.target.value); setPage(1); }}
          className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-blue-500 dark:border-blue-400 transition-colors">
          {['All', ...states].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        {loadingColleges ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500 dark:border-blue-400 border-t-transparent animate-spin" />
          </div>
        ) : colleges.length === 0 ? (
          <div className="text-center py-16 text-slate-500 dark:text-slate-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
            </svg>
            No colleges found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-4">College</th>
                  <th className="px-6 py-4">Code</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4">State</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {colleges.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-100">{c.name}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300 font-mono text-xs">{c.code}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{c.location}</td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{stateToCode(c.state) || '—'}</td>
                    <td className="px-6 py-4">
                      {/* Toggle with confirmation modal */}
                      <button onClick={() => setStatusConfirm({ college: c })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${c.isActive ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
                        <span className={`inline-block h-4 w-4 rounded-full bg-white dark:bg-slate-800 shadow transition-transform ${c.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <button onClick={() => navigate(`/${adminKey}/admin/colleges/${c.id}`)}
                          title="View Overview"
                          className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </button>
                        <button onClick={() => setModal({ mode: 'edit', data: c })}
                          title="Edit"
                          className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-white dark:bg-slate-800 transition-colors">Prev</button>
          <span className="text-slate-500 dark:text-slate-400 text-sm">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-white dark:bg-slate-800 transition-colors">Next</button>
        </div>
      )}

      {modal && (
        <CollegeModal mode={modal.mode} data={modal.data}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); fetchColleges(); }} />
      )}

      {statusConfirm && (
        <StatusConfirmModal
          college={statusConfirm.college}
          onConfirm={confirmToggle}
          onCancel={() => setStatusConfirm(null)} />
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import axios from '../../utils/api';
import { useAdminAuth } from '../../context/AdminContext';

const API = '/admin/courses';

/* ── Course status confirmation modal ────────────────────────────────── */
function StatusConfirmModal({ course, onConfirm, onCancel }) {
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
            <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100">Change Course Status</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{course.name}</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Are you sure you want to change the status of this course?
        </p>
        <div className="flex gap-3 pt-1">
          <button onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm font-medium">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl text-slate-800 dark:text-slate-100 text-sm font-semibold transition-all"
            style={{ background: course.isActive ? 'linear-gradient(135deg,#F87171,#DC2626)' : 'linear-gradient(135deg,#34D399,#059669)' }}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function CourseModal({ mode, data, onClose, onSave }) {
  const blank = { name: '', description: '' };
  const [form, setForm] = useState(data || blank);
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{mode === 'add' ? 'Add New Course' : 'Edit Course'}</h3>
          <button onClick={onClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Course Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Full Stack Development"
              required
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Brief description of the course…"
              rows={4}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 transition-colors resize-none"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2.5 rounded-xl font-medium text-slate-800 dark:text-slate-100 transition-colors" style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)' }}>
              {loading ? 'Saving…' : 'Save Course'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CoursesView() {
  const { courses, loadingCourses, fetchCourses } = useAdminAuth();

  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [statusConfirm, setStatusConfirm] = useState(null);

  const toggleActive = async (id, current) => {
    try {
      await axios.patch(`${API}/${id}/toggle`, { isActive: !current });
      fetchCourses(); // update global context → reflects everywhere
    } catch (err) { console.error(err); }
  };

  const confirmToggle = async () => {
    const { course } = statusConfirm;
    setStatusConfirm(null);
    await toggleActive(course.id, course.isActive);
  };

  const filtered = courses.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Courses</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Create and manage training courses</p>
        </div>
        <button
          onClick={() => setModal({ mode: 'add' })}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-slate-800 dark:text-slate-100 shadow-lg transition-all hover:scale-[1.02]"
          style={{ background: 'linear-gradient(135deg, #F97316, #EA580C)' }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Add Course
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search courses…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500 transition-colors"
      />

      {/* Cards Grid */}
      {loadingCourses ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500 dark:text-slate-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          No courses found
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <div key={c.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 flex flex-col gap-4 hover:border-orange-400 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(249,115,22,0.15)' }}>
                  <svg className="w-5 h-5 text-orange-500 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253" /></svg>
                </div>
                <button
                  onClick={() => setStatusConfirm({ course: c })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${c.isActive ? 'bg-orange-500' : 'bg-slate-200 dark:bg-slate-700'}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white dark:bg-slate-800 shadow transition-transform ${c.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100">{c.name}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 line-clamp-2">{c.description || 'No description provided.'}</p>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                  {c.isActive ? 'Active' : 'Inactive'}
                </span>
                <button
                  onClick={() => setModal({ mode: 'edit', data: c })}
                  className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-orange-500 dark:hover:text-orange-400 hover:bg-orange-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <CourseModal
          mode={modal.mode}
          data={modal.data}
          onClose={() => setModal(null)}
          onSave={() => { setModal(null); fetchCourses(); }}
        />
      )}

      {statusConfirm && (
        <StatusConfirmModal
          course={statusConfirm.course}
          onConfirm={confirmToggle}
          onCancel={() => setStatusConfirm(null)} />
      )}
    </div>
  );
}

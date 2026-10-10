import React, { useEffect, useState } from 'react';
import api from '../../utils/api';

const PERMISSIONS = [
  ['EXAM_DRIVE', 'Drive Control'],
  ['STUDENT', 'Student Control'],
  ['COURSE', 'Course Control'],
  ['QUESTION', 'Question Upload']
];

const defaultPermissions = () => ({
  EXAM_DRIVE: { read: true, modify: false },
  STUDENT: { read: true, modify: false },
  COURSE: { read: true, modify: false },
  QUESTION: { read: true, modify: false }
});

function Eye({ open }) {
  return open ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.4A10.5 10.5 0 0 1 12 5c6 0 9.5 7 9.5 7a18 18 0 0 1-3.1 3.9M6.2 6.2C3.8 8.2 2.5 12 2.5 12S6 19 12 19a10.7 10.7 0 0 0 3.4-.55"/></svg>;
}

export default function UserControl() {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', active: true, permissions: defaultPermissions() });
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = async () => {
    try { const res = await api.get('/admin/user-control'); setUsers(res.data || []); } catch (e) { setError(e.response?.data?.message || 'Could not load users.'); }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setCreating(true); setSelected(null); setShowPassword(false); setShowNewPassword(false); setError('');
    setForm({ name: '', email: '', password: '', active: true, permissions: defaultPermissions() });
  };

  const openUser = (user) => {
    setCreating(false); setSelected(user); setShowPassword(false); setShowNewPassword(false); setError('');
    setForm({
      name: user.name || '', email: user.email || '', password: '', active: user.active,
      permissions: { ...defaultPermissions(), ...(user.permissions || {}) }
    });
  };

  const closeDetail = () => { setSelected(null); setCreating(false); setError(''); };

  const setPermission = (key, field, value) => {
    setForm(f => ({ ...f, permissions: { ...f.permissions, [key]: { ...f.permissions[key], [field]: value, ...(field === 'modify' && value ? { read: true } : {}) } } }));
  };

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) { setError('Name and email are required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setError('Enter a valid email address.'); return; }
    if (creating && !form.password) { setError('Password is required for a new user.'); return; }
    if (form.password && form.password.length < 6) { setError('Password must contain at least 6 characters.'); return; }
    setBusy(true); setError('');
    try {
      const { DASHBOARD, ...permissions } = form.permissions || {};
      const body = { name: form.name.trim(), email: form.email.trim(), password: form.password || null, active: form.active, permissions };
      if (creating) await api.post('/admin/user-control', body); else await api.put(`/admin/user-control/${selected.id}`, body);
      await load();
      closeDetail();
    } catch (e) { setError(e.response?.data?.message || 'Could not save user.'); }
    finally { setBusy(false); }
  };

  // Activate/Deactivate is applied immediately (not only after "Update User").
  const toggleActive = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const { DASHBOARD, ...permissions } = selected.permissions || {};
      const res = await api.put(`/admin/user-control/${selected.id}`, { name: selected.name, email: selected.email, password: null, active: !selected.active, permissions });
      setSelected(res.data);
      setForm(f => ({ ...f, active: res.data.active }));
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Could not update user status.'); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!selected) return;
    setBusy(true); setError('');
    try { await api.delete(`/admin/user-control/${selected.id}`); setConfirmDelete(false); await load(); closeDetail(); }
    catch (e) { setError(e.response?.data?.message || 'Could not delete user.'); }
    finally { setBusy(false); }
  };

  const detail = selected || creating;

  return <div className="space-y-6">
    <div>
      <h1 className="text-xl font-bold" style={{ color: 'var(--eb-text)' }}>User Control</h1>
      <p className="text-sm mt-1" style={{ color: 'var(--eb-text-muted)' }}>Create and manage portal users and their access.</p>
    </div>

    {error && <div className="rounded-xl p-3 text-sm" style={{ background: 'var(--eb-danger-soft)', color: 'var(--eb-danger)' }}>{error}</div>}

    {!detail ? <>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm" style={{ color: 'var(--eb-text-muted)' }}>{users.length} portal user{users.length === 1 ? '' : 's'}</div>
        <button className="eb-btn !w-auto !px-4" onClick={openCreate}>+ Add User</button>
      </div>
      <div className="space-y-2">
        {users.map(user => <button key={user.id} onClick={() => openUser(user)} className="w-full text-left rounded-2xl border p-4 transition hover:shadow-sm" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0"><div className="font-semibold truncate" style={{ color: 'var(--eb-text)' }}>{user.name}</div><div className="text-sm truncate mt-1" style={{ color: 'var(--eb-text-muted)' }}>{user.email}</div></div>
            <div className="text-right flex-shrink-0"><div className="text-xs font-medium" style={{ color: user.active ? 'var(--eb-success)' : 'var(--eb-danger)' }}>{user.active ? 'Active' : 'Inactive'}</div><div className="text-xs mt-1" style={{ color: 'var(--eb-text-faint)' }}>Open details →</div></div>
          </div>
        </button>)}
        {!users.length && <div className="rounded-2xl border p-10 text-center text-sm" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)', color: 'var(--eb-text-faint)' }}>No users created yet.</div>}
      </div>
    </> : <div className="rounded-2xl border p-5 sm:p-6 space-y-5" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
      <div className="flex items-start justify-between gap-4"><div><button onClick={closeDetail} className="text-sm font-medium mb-3" style={{ color: 'var(--eb-blue)' }}>← Back to users</button><h2 className="text-lg font-semibold" style={{ color: 'var(--eb-text)' }}>{creating ? 'Create New User' : 'User Details'}</h2></div></div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="eb-label">Name</label><input className="eb-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className="eb-label">Email</label><input className="eb-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
      </div>

      {!creating && <div className="rounded-xl p-3" style={{ background: 'var(--eb-surface-muted)' }}><div className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--eb-text-faint)' }}>Current Password</div><div className="flex items-center gap-2 mt-2"><span className="font-mono tracking-widest" style={{ color: 'var(--eb-text)' }}>••••••••••••</span></div><p className="text-[11px] mt-2" style={{ color: 'var(--eb-text-faint)' }}>Passwords are stored securely as BCrypt hashes and cannot be displayed. Use New Password below to change it.</p></div>}

      <div><label className="eb-label">{creating ? 'Password' : 'New Password (optional)'}</label><div className="relative"><input className="eb-input pr-10" type={showNewPassword ? 'text' : 'password'} value={form.password} placeholder={creating ? 'Enter password' : 'Leave blank to keep current password'} onChange={e => setForm({ ...form, password: e.target.value })} /><button type="button" onClick={() => setShowNewPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--eb-text-faint)' }}><Eye open={showNewPassword} /></button></div></div>

      {!creating && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active user</label>}

      <div><div className="text-sm font-semibold mb-2" style={{ color: 'var(--eb-text)' }}>Access</div><div className="space-y-2">{PERMISSIONS.map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ background: 'var(--eb-surface-muted)' }}><span className="text-sm" style={{ color: 'var(--eb-text)' }}>{label}</span><div className="flex gap-4 text-xs"><label><input type="checkbox" checked={!!form.permissions[key]?.read} onChange={e => setPermission(key, 'read', e.target.checked)} /> Read</label><label><input type="checkbox" checked={!!form.permissions[key]?.modify} onChange={e => setPermission(key, 'modify', e.target.checked)} /> Modify</label></div></div>)}</div><p className="text-[11px] mt-2" style={{ color: 'var(--eb-text-faint)' }}>New users start with read access. Drive Control can be granted modify access when needed.</p></div>

      <div className="flex flex-wrap gap-2 pt-1"><button className="eb-btn !w-auto !px-5" disabled={busy} onClick={save}>{busy ? 'Saving…' : creating ? 'Create User' : 'Update User'}</button>{!creating && <><button className="px-4 py-2.5 rounded-xl text-sm font-medium border" style={{ borderColor: 'var(--eb-border)', color: 'var(--eb-text)' }} disabled={busy} onClick={toggleActive}>{selected?.active ? 'Deactivate' : 'Activate'}</button><button className="px-4 py-2.5 rounded-xl text-sm font-medium" style={{ color: 'var(--eb-danger)' }} onClick={() => setConfirmDelete(true)}>Delete User</button></>}</div>
    </div>}

    {confirmDelete && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-sm rounded-2xl border p-6" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}><h3 className="text-lg font-semibold" style={{ color: 'var(--eb-text)' }}>Delete User?</h3><p className="text-sm mt-2" style={{ color: 'var(--eb-text-muted)' }}>This user will no longer be able to log in.</p><div className="flex gap-2 mt-5"><button className="eb-btn" disabled={busy} onClick={remove}>Delete</button><button className="px-4 rounded-xl text-sm" onClick={() => setConfirmDelete(false)}>Cancel</button></div></div></div>}
  </div>;
}

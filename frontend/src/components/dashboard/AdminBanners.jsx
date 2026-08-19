import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../utils/api';

const Ic = {
  Back: () => (<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>),
  Upload: () => (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-8-4V4m0 0L8 8m4-4l4 4"/></svg>),
  Trash: () => (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/></svg>),
  Image: () => (<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>),
};

const SLOT_META = {
  HERO: { label: 'Hero Banner', hint: 'Left side of the Rules page — one large portrait image.', recommended: '~480 × 1000 px (portrait)' },
  POSTER_1: { label: 'Poster 1', hint: 'Right side, after the countdown timer.', recommended: '~500 × 300 px (landscape)' },
  POSTER_2: { label: 'Poster 2', hint: 'Shown only if uploaded.', recommended: '~500 × 300 px (landscape)' },
  POSTER_3: { label: 'Poster 3', hint: 'Shown only if uploaded.', recommended: '~500 × 300 px (landscape)' },
  POSTER_4: { label: 'Poster 4', hint: 'Shown only if uploaded.', recommended: '~500 × 300 px (landscape)' },
  POSTER_5: { label: 'Poster 5', hint: 'Shown only if uploaded.', recommended: '~500 × 300 px (landscape)' },
  POSTER_6: { label: 'Poster 6', hint: 'Shown only if uploaded.', recommended: '~500 × 300 px (landscape)' },
  POSTER_7: { label: 'Poster 7', hint: 'Shown only if uploaded.', recommended: '~500 × 300 px (landscape)' },
  POSTER_8: { label: 'Poster 8', hint: 'Shown only if uploaded.', recommended: '~500 × 300 px (landscape)' },
};

function BannerSlotCard({ slot, summary, onUploaded, onRemoved }) {
  const meta = SLOT_META[slot] || { label: slot, hint: '', recommended: '' };
  const fileInputRef = useRef(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imgBroken, setImgBroken] = useState(false);

  // Cache-bust the preview after an upload/removal so the browser doesn't
  // keep showing a stale cached image for the same slot URL.
  const [cacheBust, setCacheBust] = useState(0);
  const imageUrl = `/api/admin/banners/public/${slot}/image?v=${cacheBust}`;

  const handleFileChosen = (e) => {
    const file = e.target.files?.[0];
    if (file) { setPendingFile(file); setError(''); }
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    setBusy(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      await axios.post(`/admin/banners/${slot}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPendingFile(null);
      setImgBroken(false);
      setCacheBust((v) => v + 1);
      onUploaded(slot);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Please try a different image.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    setError('');
    try {
      await axios.delete(`/admin/banners/${slot}`);
      setImgBroken(false);
      setCacheBust((v) => v + 1);
      onRemoved(slot);
    } catch {
      setError('Could not remove this image.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border p-4 space-y-3" style={{ background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold" style={{ color: 'var(--eb-text)' }}>{meta.label}</h4>
          <p className="text-xs mt-0.5" style={{ color: 'var(--eb-text-faint)' }}>{meta.hint}</p>
        </div>
        <span className="text-[10px] font-mono px-2 py-1 rounded-full flex-shrink-0"
          style={{
            background: summary.hasImage ? 'var(--eb-success-soft)' : 'var(--eb-surface-muted)',
            color: summary.hasImage ? 'var(--eb-success)' : 'var(--eb-text-faint)',
          }}>
          {summary.hasImage ? 'Uploaded' : 'Default'}
        </span>
      </div>

      <div className="rounded-xl overflow-hidden flex items-center justify-center"
        style={{ height: '140px', background: 'var(--eb-surface-muted)', border: '1px dashed var(--eb-border)' }}>
        {summary.hasImage && !imgBroken ? (
          <img src={imageUrl} alt={meta.label} className="w-full h-full object-cover" onError={() => setImgBroken(true)} />
        ) : (
          <div className="flex flex-col items-center gap-1.5" style={{ color: 'var(--eb-text-faint)' }}>
            <Ic.Image />
            <span className="text-[11px]">No image uploaded — showing default</span>
          </div>
        )}
      </div>

      <p className="text-[11px]" style={{ color: 'var(--eb-text-faint)' }}>
        Recommended size: <span className="font-medium" style={{ color: 'var(--eb-text-muted)' }}>{meta.recommended}</span>
      </p>

      {pendingFile && (
        <p className="text-xs truncate" style={{ color: 'var(--eb-blue)' }}>Selected: {pendingFile.name}</p>
      )}
      {error && <p className="text-xs" style={{ color: 'var(--eb-danger)' }}>{error}</p>}

      <div className="flex items-center gap-2">
        <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFileChosen} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}
          className="eb-btn-outline !w-auto !py-2 !px-3 text-xs flex items-center gap-1.5 disabled:opacity-50">
          <Ic.Upload /> Replace
        </button>
        {pendingFile && (
          <button type="button" onClick={handleUpload} disabled={busy}
            className="eb-btn !w-auto !py-2 !px-3 text-xs disabled:opacity-50">
            {busy ? 'Uploading…' : 'Update'}
          </button>
        )}
        {summary.hasImage && !pendingFile && (
          <button type="button" onClick={handleRemove} disabled={busy}
            className="!w-auto !py-2 !px-3 text-xs rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            style={{ color: 'var(--eb-danger)' }}>
            <Ic.Trash /> Remove
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Admin Banner Management - reachable via Profile drawer -> "Edit Exam
 * Banners" (not the main sidebar, per requirement). Manages the Rules
 * page's one hero banner + up to 8 poster images. Each slot is
 * independent: uploading a poster doesn't require filling the others,
 * and the student-facing carousel only ever shows slots that actually
 * have an image.
 */
export default function AdminBanners() {
  const { adminKey } = useParams();
  const navigate = useNavigate();
  const [slots, setSlots] = useState(null);

  const load = useCallback(() => {
    axios.get('/admin/banners')
      .then(res => setSlots(Array.isArray(res.data) ? res.data : []))
      .catch(() => setSlots([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  const refreshOne = () => load(); // simplest correct option - re-fetch the whole list

  if (slots === null) {
    return <div className="text-sm" style={{ color: 'var(--eb-text-muted)' }}>Loading…</div>;
  }

  const hero = slots.find(s => s.slot === 'HERO');
  const posters = slots.filter(s => s.slot !== 'HERO');

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(`/${adminKey}/admin/overview`)} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--eb-blue)' }}>
        <Ic.Back /> Back to Overview
      </button>

      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--eb-text)' }}>Exam Banners</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--eb-text-muted)' }}>
          Manage the images shown on the Student Rules page — the hero banner (left side) and up to 8 posters (right side, after the countdown).
          Any slot left empty automatically shows its existing default until you upload something here.
        </p>
      </div>

      {hero && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--eb-text-faint)' }}>Hero Banner</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <BannerSlotCard slot="HERO" summary={hero} onUploaded={refreshOne} onRemoved={refreshOne} />
          </div>
        </div>
      )}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--eb-text-faint)' }}>Posters</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {posters.map(s => (
            <BannerSlotCard key={s.slot} slot={s.slot} summary={s} onUploaded={refreshOne} onRemoved={refreshOne} />
          ))}
        </div>
      </div>
    </div>
  );
}

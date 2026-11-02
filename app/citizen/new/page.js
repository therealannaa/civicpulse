'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, uploadImages, MAX_PHOTOS } from '@/lib/client';
import { ErrorNotice, StatusBadge } from '@/components/Badges';
import PhotoPicker from '@/components/PhotoPicker';
import { PRIORITIES } from '@/lib/workflow';

const EMPTY = {
  title: '',
  description: '',
  category_id: '',
  ward_id: '',
  location_text: '',
  latitude: '',
  longitude: '',
  priority: 'MEDIUM',
};

export default function NewComplaintPage() {
  const router = useRouter();
  const [meta, setMeta] = useState({ wards: [], categories: [] });
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [similar, setSimilar] = useState(null);
  const [checking, setChecking] = useState(false);
  const [similarError, setSimilarError] = useState(null);
  const [geoMessage, setGeoMessage] = useState('');
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    Promise.all([api('/api/meta'), api('/api/auth/me')])
      .then(([m, me]) => {
        setMeta(m);
        if (me.user?.ward_id) setForm((f) => ({ ...f, ward_id: String(me.user.ward_id) }));
      })
      .catch(setError);
  }, []);

  // Group categories by department for the <select>
  const categoryGroups = useMemo(() => {
    const groups = new Map();
    for (const c of meta.categories) {
      if (!groups.has(c.dept_name)) groups.set(c.dept_name, []);
      groups.get(c.dept_name).push(c);
    }
    return [...groups.entries()];
  }, [meta.categories]);

  const selectedCategory = meta.categories.find((c) => String(c.category_id) === form.category_id);

  // Semantic duplicate check, debounced while the citizen types
  useEffect(() => {
    const text = `${form.title} ${form.description}`.trim();
    if (text.length < 25) {
      setSimilar(null);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setChecking(true);
      setSimilarError(null);
      try {
        const d = await api('/api/complaints/similar', {
          method: 'POST',
          body: { title: form.title, description: form.description, location_text: form.location_text },
        });
        setSimilar(d.similar);
      } catch (err) {
        setSimilarError(err);
      } finally {
        setChecking(false);
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [form.title, form.description, form.location_text]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  function fillMyLocation() {
    if (!navigator.geolocation) {
      setGeoMessage('Your browser does not share location. Type the coordinates or leave them empty.');
      return;
    }
    setGeoMessage('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setGeoMessage('Location added.');
      },
      () => setGeoMessage('Location permission was denied. You can still type the coordinates or leave them empty.')
    );
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = await api('/api/complaints', { method: 'POST', body: form });
      // The complaint is saved first; photos are uploaded to it afterwards.
      // If the upload fails the complaint still exists and the detail page says so.
      let photoNote = '';
      if (photos.length) {
        try {
          await uploadImages(d.complaint_id, photos.map((p) => p.file));
        } catch (err) {
          photoNote = `?photos=${encodeURIComponent(err.message)}`;
        }
      }
      router.push(`/complaints/${d.complaint_id}${photoNote}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Report an issue</h1>
          <p>Be specific about the location so the field team can find it quickly.</p>
        </div>
      </div>
      <div className="grid-2">
        <form className="panel" onSubmit={submit}>
          <ErrorNotice error={error} />
          <div className="field">
            <label htmlFor="title">What is the problem? <span className="hint">5 to 150 characters</span></label>
            <input id="title" value={form.title} onChange={set('title')} placeholder="Deep pothole near the bus stop" required />
          </div>
          <div className="field">
            <label htmlFor="description">Details <span className="hint">size, danger, how long it has been there</span></label>
            <textarea id="description" value={form.description} onChange={set('description')} required />
          </div>
          <div className="field-row">
            <div>
              <label htmlFor="category">Category</label>
              <select id="category" value={form.category_id} onChange={set('category_id')} required>
                <option value="">Choose a category</option>
                {categoryGroups.map(([dept, cats]) => (
                  <optgroup key={dept} label={dept}>
                    {cats.map((c) => (
                      <option key={c.category_id} value={c.category_id}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {selectedCategory && (
                <div className="hint" style={{ marginTop: 4 }}>
                  Handled by {selectedCategory.dept_name}, target {selectedCategory.default_sla_hours} hours
                </div>
              )}
            </div>
            <div>
              <label htmlFor="priority">How urgent is it?</label>
              <select id="priority" value={form.priority} onChange={set('priority')}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field-row">
            <div>
              <label htmlFor="ward">Ward</label>
              <select id="ward" value={form.ward_id} onChange={set('ward_id')} required>
                <option value="">Choose a ward</option>
                {meta.wards.map((w) => (
                  <option key={w.ward_id} value={w.ward_id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="location">Landmark or address</label>
              <input id="location" value={form.location_text} onChange={set('location_text')} placeholder="Opposite the metro exit" required />
            </div>
          </div>
          <div className="field-row">
            <div>
              <label htmlFor="lat">Latitude <span className="hint">optional</span></label>
              <input id="lat" inputMode="decimal" value={form.latitude} onChange={set('latitude')} />
            </div>
            <div>
              <label htmlFor="lng">Longitude <span className="hint">optional</span></label>
              <input id="lng" inputMode="decimal" value={form.longitude} onChange={set('longitude')} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn small secondary" onClick={fillMyLocation}>Use my current location</button>
            <span className="small muted">{geoMessage}</span>
          </div>
          <div className="field" style={{ marginTop: 18 }}>
            <label htmlFor="photos">Photos <span className="hint">optional, up to {MAX_PHOTOS}</span></label>
            <PhotoPicker id="photos" max={MAX_PHOTOS} photos={photos} onChange={setPhotos} disabled={busy} />
          </div>
          <div className="row" style={{ marginTop: 22 }}>
            <button className="btn" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit complaint'}</button>
          </div>
        </form>

        <aside className="panel">
          <div className="panel-title">
            <h2>Already reported?</h2>
            {checking && <span className="small muted">Checking…</span>}
          </div>
          <p className="small muted">
            As you type, your description is compared by meaning with existing complaints, so you can see if this
            problem is already being handled.
          </p>
          <ErrorNotice error={similarError} />
          {similar === null && !checking && <p className="small muted">Start writing the title and details to check.</p>}
          {similar && similar.length === 0 && <p className="small">No similar complaints found. Yours looks new.</p>}
          {similar && similar.length > 0 && (
            <div>
              {similar.map((s) => (
                <div className="result" key={s.complaint_id}>
                  <div className="row">
                    <strong>{s.title}</strong>
                  </div>
                  <div className="row small" style={{ marginTop: 4 }}>
                    <StatusBadge status={s.status} />
                    <span className="muted">{s.ward_name}, {s.location_text}</span>
                  </div>
                  <div className="small" style={{ marginTop: 4 }}>
                    <span className="score">{Math.round(s.similarity * 100)}% similar</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

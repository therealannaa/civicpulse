'use client';

import { useEffect, useRef, useState } from 'react';
import { shrinkImage } from '@/lib/client';

// Lets the user choose up to `max` photos and previews them before upload.
// `photos` is a list of { file, url }; the parent decides when to upload.
export default function PhotoPicker({ id, max, photos, onChange, disabled }) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const latest = useRef(photos);
  latest.current = photos;

  // Free the preview URLs when the picker goes away
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  async function choose(event) {
    const chosen = Array.from(event.target.files || []);
    event.target.value = '';
    setError('');
    const room = max - photos.length;
    if (chosen.length > room) setError(`Only ${max} photos are allowed, so the extra ones were left out.`);
    setWorking(true);
    const added = [];
    for (const file of chosen.slice(0, room)) {
      try {
        const small = await shrinkImage(file);
        added.push({ file: small, url: URL.createObjectURL(small) });
      } catch (err) {
        setError(err.message);
      }
    }
    setWorking(false);
    onChange([...photos, ...added]);
  }

  function remove(index) {
    URL.revokeObjectURL(photos[index].url);
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div className="photo-picker">
      {photos.length > 0 && (
        <ul className="photo-grid">
          {photos.map((p, i) => (
            <li key={p.url}>
              <img src={p.url} alt={`Selected photo ${i + 1}`} />
              <button type="button" className="photo-remove" onClick={() => remove(i)} disabled={disabled} aria-label="Remove photo">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {photos.length < max && (
        <>
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={choose}
            disabled={disabled || working}
            className="visually-hidden"
          />
          <button type="button" className="btn small secondary" onClick={() => inputRef.current?.click()} disabled={disabled || working}>
            {working ? 'Preparing…' : photos.length ? 'Add another photo' : 'Choose photos'}
          </button>
          <span className="small muted" style={{ marginLeft: 10 }}>
            {max - photos.length} of {max} left · JPEG, PNG or WebP
          </span>
        </>
      )}
      {error && <p className="small overdue" style={{ margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, formatDateTime, slaText, plate, uploadImages, imageUrl, MAX_PHOTOS } from '@/lib/client';
import { StatusBadge, PriorityLabel, ErrorNotice, Notice } from '@/components/Badges';
import PhotoPicker from '@/components/PhotoPicker';
import { PRIORITIES, STATUS_LABELS } from '@/lib/workflow';

export default function ComplaintDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [staffId, setStaffId] = useState('');
  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [newPhotos, setNewPhotos] = useState([]);
  const [photoError, setPhotoError] = useState(null);

  // Set by the "Report an issue" page when the complaint was saved but its photos were not
  useEffect(() => {
    const failed = new URLSearchParams(window.location.search).get('photos');
    if (failed) setPhotoError(new Error(`The complaint was saved, but the photos were not: ${failed}`));
  }, []);

  const load = useCallback(() => {
    api(`/api/complaints/${id}`)
      .then((d) => {
        setData(d);
        setLoadError(null);
      })
      .catch(setLoadError);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(action, successText) {
    setBusy(true);
    setActionError(null);
    setMessage('');
    try {
      await action();
      setMessage(successText);
      setNote('');
      load();
    } catch (err) {
      setActionError(err);
    } finally {
      setBusy(false);
    }
  }

  const changeStatus = (status) =>
    run(
      () => api(`/api/complaints/${id}`, { method: 'PATCH', body: { status, note } }),
      `Status changed to ${STATUS_LABELS[status]}.`
    );

  const changePriority = (priority) =>
    run(() => api(`/api/complaints/${id}`, { method: 'PATCH', body: { priority } }), 'Priority updated.');

  const assign = (auto) =>
    run(
      () =>
        api(`/api/complaints/${id}/assign`, {
          method: 'POST',
          body: auto ? { auto: true } : { staff_id: staffId, note },
        }),
      auto ? 'Assigned automatically to the least busy available staff member.' : 'Complaint assigned.'
    );

  const giveFeedback = (event) => {
    event.preventDefault();
    run(
      () => api(`/api/complaints/${id}/feedback`, { method: 'POST', body: { rating, comment } }),
      'Thank you. Your feedback has closed this complaint.'
    );
  };

  const addPhotos = () =>
    run(async () => {
      await uploadImages(id, newPhotos.map((p) => p.file));
      newPhotos.forEach((p) => URL.revokeObjectURL(p.url));
      setNewPhotos([]);
      setPhotoError(null);
    }, newPhotos.length === 1 ? 'Photo added.' : 'Photos added.');

  const removePhoto = (imageId) => {
    if (!window.confirm('Remove this photo?')) return;
    run(() => api(`/api/complaints/${id}/images/${imageId}`, { method: 'DELETE' }), 'Photo removed.');
  };

  async function remove() {
    if (!window.confirm('Delete this complaint permanently? Its history, photos and feedback are removed too.')) return;
    setBusy(true);
    try {
      await api(`/api/complaints/${id}`, { method: 'DELETE' });
      router.back();
    } catch (err) {
      setActionError(err);
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <main className="page">
        <ErrorNotice error={loadError} />
        <Link href="/">Go back</Link>
      </main>
    );
  }
  if (!data) return <main className="page"><p className="muted">Loading complaint…</p></main>;

  const { complaint: c, history, assignments, feedback, similar, images, staffOptions, permissions } = data;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <div className="row" style={{ marginBottom: 8 }}>
            <span className="plate">{plate(c.complaint_id)}</span>
            <StatusBadge status={c.status} />
            <PriorityLabel priority={c.priority} />
            {c.is_overdue && <span className="overdue small">SLA missed</span>}
          </div>
          <h1>{c.title}</h1>
          <p>{c.category_name} in {c.ward_name}, handled by {c.dept_name}</p>
        </div>
      </div>

      <Notice kind="success">{message}</Notice>
      <ErrorNotice error={actionError} />

      <div className="grid-2">
        <div>
          <section className="panel">
            <h2>Details</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{c.description}</p>
            <dl className="facts">
              <dt>Location</dt>
              <dd>
                {c.location_text}
                {c.latitude != null && (
                  <>
                    {' '}
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${c.latitude}&mlon=${c.longitude}#map=18/${c.latitude}/${c.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      ({c.latitude}, {c.longitude}) open map
                    </a>
                  </>
                )}
              </dd>
              <dt>Filed by</dt>
              <dd>{c.citizen_name} on {formatDateTime(c.created_at)}</dd>
              <dt>Response target</dt>
              <dd className={c.is_overdue ? 'overdue' : ''}>
                {formatDateTime(c.sla_due_at)} ({c.default_sla_hours} h SLA, {slaText(c.sla_due_at, c.status)})
              </dd>
              <dt>Assigned to</dt>
              <dd>{c.assigned_staff_name || 'Nobody yet'}</dd>
              {c.resolved_at && (
                <>
                  <dt>Resolved</dt>
                  <dd>{formatDateTime(c.resolved_at)}</dd>
                </>
              )}
            </dl>
          </section>

          {(images.length > 0 || permissions.canAddImages || photoError) && (
            <section className="panel">
              <div className="panel-title">
                <h2>Photos</h2>
                <span className="small muted">{images.length} of {MAX_PHOTOS}</span>
              </div>
              <ErrorNotice error={photoError} />
              {images.length > 0 ? (
                <ul className="photo-grid large">
                  {images.map((img) => (
                    <li key={img.image_id}>
                      <a href={imageUrl(c.complaint_id, img.image_id)} target="_blank" rel="noreferrer" title="Open full size">
                        <img src={imageUrl(c.complaint_id, img.image_id)} alt={img.file_name} loading="lazy" />
                      </a>
                      <div className="photo-caption small muted">
                        {Math.max(1, Math.round(img.size_bytes / 1024))} KB · {formatDateTime(img.uploaded_at)}
                      </div>
                      {permissions.canDeleteImages && (
                        <button type="button" className="photo-remove" onClick={() => removePhoto(img.image_id)} disabled={busy} aria-label="Remove photo">
                          ×
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">No photos yet.</p>
              )}
              {permissions.canAddImages && (
                <div style={{ marginTop: 12 }}>
                  <PhotoPicker id="more-photos" max={MAX_PHOTOS - images.length} photos={newPhotos} onChange={setNewPhotos} disabled={busy} />
                  {newPhotos.length > 0 && (
                    <button className="btn small" style={{ marginTop: 10 }} onClick={addPhotos} disabled={busy}>
                      Upload {newPhotos.length} photo{newPhotos.length === 1 ? '' : 's'}
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          <section className="panel">
            <h2>Status history</h2>
            <ol className="timeline">
              {history.map((h) => (
                <li key={h.history_id}>
                  <div className="row">
                    {h.old_status && h.old_status !== h.new_status && (
                      <>
                        <StatusBadge status={h.old_status} />
                        <span className="muted" aria-label="to">›</span>
                      </>
                    )}
                    <StatusBadge status={h.new_status} />
                    <span className="when">{formatDateTime(h.changed_at)}</span>
                  </div>
                  {h.note && <div className="small" style={{ marginTop: 4 }}>{h.note}</div>}
                </li>
              ))}
            </ol>
          </section>

          {assignments.length > 0 && (
            <section className="panel">
              <h2>Assignments</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Staff</th><th>Assigned</th><th>Released</th></tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.staff_id}>
                        <td>{a.name}<div className="small muted">{a.designation}</div></td>
                        <td className="small">{formatDateTime(a.assigned_at)}</td>
                        <td className="small">{a.unassigned_at ? formatDateTime(a.unassigned_at) : <strong>Active</strong>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {feedback && (
            <section className="panel">
              <h2>Citizen feedback</h2>
              <p style={{ fontSize: '1.3rem', margin: 0 }} aria-label={`${feedback.rating} out of 5`}>
                {'★'.repeat(feedback.rating)}
                <span className="muted">{'★'.repeat(5 - feedback.rating)}</span>
              </p>
              {feedback.comment && <p style={{ marginTop: 8 }}>“{feedback.comment}”</p>}
              <p className="small muted">{feedback.name}, {formatDateTime(feedback.created_at)}</p>
            </section>
          )}
        </div>

        <aside>
          {(permissions.statusActions.length > 0 || permissions.canAssign || permissions.canChangePriority) && (
            <section className="panel stack">
              <h2>Actions</h2>
              {(permissions.statusActions.length > 0 || permissions.canAssign) && (
                <div>
                  <label htmlFor="note">Note for the history <span className="hint">optional</span></label>
                  <textarea id="note" style={{ minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done or why" />
                </div>
              )}
              {permissions.statusActions.length > 0 && (
                <div className="row">
                  {permissions.statusActions.map((a) => (
                    <button
                      key={a.status}
                      className={`btn small ${a.status === 'REJECTED' || a.status === 'OPEN' ? 'secondary' : ''}`}
                      disabled={busy}
                      onClick={() => changeStatus(a.status)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
              {permissions.canAssign && (
                <div>
                  <label htmlFor="staff">{c.status === 'ASSIGNED' ? 'Reassign to' : 'Assign to'}</label>
                  <select id="staff" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                    <option value="">Choose staff from {c.dept_name}</option>
                    {staffOptions.map((s) => (
                      <option key={s.staff_id} value={s.staff_id} disabled={!s.is_available || s.staff_id === c.assigned_staff_id}>
                        {s.name}, {s.designation} ({s.active_count} active{s.is_available ? '' : ', unavailable'})
                      </option>
                    ))}
                  </select>
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn small" disabled={busy || !staffId} onClick={() => assign(false)}>Assign</button>
                    <button className="btn small secondary" disabled={busy} onClick={() => assign(true)}>Auto-assign</button>
                  </div>
                </div>
              )}
              {permissions.canChangePriority && (
                <div>
                  <label htmlFor="priority">Priority</label>
                  <select id="priority" value={c.priority} disabled={busy} onChange={(e) => changePriority(e.target.value)}>
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
                    ))}
                  </select>
                </div>
              )}
            </section>
          )}

          {permissions.canFeedback && (
            <form className="panel" onSubmit={giveFeedback}>
              <h2>Was it fixed properly?</h2>
              <div className="field">
                <label htmlFor="rating">Rating</label>
                <select id="rating" value={rating} onChange={(e) => setRating(e.target.value)}>
                  <option value="5">5, excellent</option>
                  <option value="4">4, good</option>
                  <option value="3">3, acceptable</option>
                  <option value="2">2, poor</option>
                  <option value="1">1, not fixed</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="comment">Comment <span className="hint">optional</span></label>
                <textarea id="comment" style={{ minHeight: 70 }} value={comment} onChange={(e) => setComment(e.target.value)} />
              </div>
              <button className="btn" style={{ marginTop: 14 }} disabled={busy}>Submit feedback</button>
            </form>
          )}

          <section className="panel">
            <h2>Similar complaints</h2>
            <p className="small muted">Found by comparing the meaning of the text (vector similarity), not exact words.</p>
            {similar.length === 0 && <p className="small">No similar complaints.</p>}
            {similar.map((s) => (
              <div className="result" key={s.complaint_id}>
                <span className="plate">{plate(s.complaint_id)}</span>{' '}
                <strong>{s.title}</strong>
                <div className="row small" style={{ marginTop: 4 }}>
                  <StatusBadge status={s.status} />
                  <span className="muted">{s.ward_name}</span>
                  <span className="score">{Math.round(s.similarity * 100)}%</span>
                </div>
              </div>
            ))}
          </section>

          {permissions.canDelete && (
            <section className="panel">
              <h3>{c.status === 'OPEN' && !permissions.canAssign ? 'Withdraw complaint' : 'Delete complaint'}</h3>
              <p className="small muted">Removes the complaint together with its history, assignments and feedback.</p>
              <button className="btn small danger" disabled={busy} onClick={remove}>Delete</button>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

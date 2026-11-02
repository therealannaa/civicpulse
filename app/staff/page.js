'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import ComplaintTable from '@/components/ComplaintTable';
import { ErrorNotice } from '@/components/Badges';

export default function StaffHome() {
  const [me, setMe] = useState(null);
  const [mine, setMine] = useState(null);
  const [dept, setDept] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/auth/me').then((d) => setMe(d.user)).catch(setError);
    api('/api/complaints?scope=dept&status=OPEN&sort=sla').then((d) => setDept(d.complaints)).catch(setError);
  }, []);

  useEffect(() => {
    setMine(null);
    const status = showDone ? '' : 'PENDING';
    api(`/api/complaints?scope=mine&status=${status}&sort=priority`).then((d) => setMine(d.complaints)).catch(setError);
  }, [showDone]);

  async function toggleAvailability() {
    setBusy(true);
    try {
      const d = await api('/api/me/availability', { method: 'PATCH', body: { is_available: !me.is_available } });
      setMe({ ...me, is_available: d.is_available });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>My work</h1>
          <p>{me ? `${me.designation}, ${me.dept_name}` : 'Loading…'}</p>
        </div>
        {me && (
          <div className="row">
            <span className="small">
              {me.is_available ? 'You are available for new complaints.' : 'You are marked unavailable.'}
            </span>
            <button className={`btn small ${me.is_available ? 'secondary' : ''}`} disabled={busy} onClick={toggleAvailability}>
              {me.is_available ? 'Go off duty' : 'Go on duty'}
            </button>
          </div>
        )}
      </div>
      <ErrorNotice error={error} />

      <div className="panel-title">
        <h2>{showDone ? 'All complaints assigned to me' : 'Assigned to me, still pending'}</h2>
        <label className="small" style={{ fontWeight: 400, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Include resolved and closed
        </label>
      </div>
      <ComplaintTable complaints={mine} showStaff={false} emptyText="Nothing assigned to you right now." />

      <div className="panel-title" style={{ marginTop: 32 }}>
        <h2>Unassigned in my department</h2>
        <span className="small muted">Ordered by response deadline. The admin assigns these.</span>
      </div>
      <ComplaintTable complaints={dept} showStaff={false} emptyText="Your department has no unassigned complaints." />
    </main>
  );
}

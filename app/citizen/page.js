'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import ComplaintTable from '@/components/ComplaintTable';
import { ErrorNotice } from '@/components/Badges';

const TABS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'RESOLVED', label: 'Awaiting your feedback' },
  { value: 'CLOSED', label: 'Closed' },
];

export default function CitizenHome() {
  const [status, setStatus] = useState('');
  const [complaints, setComplaints] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setComplaints(null);
    api(`/api/complaints?status=${status}`)
      .then((d) => setComplaints(d.complaints))
      .catch(setError);
  }, [status]);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>My complaints</h1>
          <p>Track everything you have reported. Resolved complaints wait for your rating.</p>
        </div>
        <Link href="/citizen/new" className="btn">Report an issue</Link>
      </div>
      <ErrorNotice error={error} />
      <div className="row" style={{ marginBottom: 14 }} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={status === t.value}
            className={`btn small ${status === t.value ? '' : 'secondary'}`}
            onClick={() => setStatus(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <ComplaintTable
        complaints={complaints}
        emptyText={status ? 'Nothing here right now.' : 'You have not reported anything yet. Use "Report an issue" to file your first complaint.'}
      />
    </main>
  );
}

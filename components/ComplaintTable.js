'use client';

import Link from 'next/link';
import { StatusBadge, PriorityLabel } from './Badges';
import { formatDate, slaText, plate } from '@/lib/client';

export default function ComplaintTable({ complaints, showCitizen = false, showStaff = true, emptyText }) {
  if (!complaints) return <div className="table-wrap"><div className="empty">Loading complaints…</div></div>;
  if (complaints.length === 0) {
    return <div className="table-wrap"><div className="empty">{emptyText || 'No complaints match these filters.'}</div></div>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Complaint</th>
            <th>Ward</th>
            <th>Status</th>
            <th>Priority</th>
            <th>SLA</th>
            {showCitizen && <th>Filed by</th>}
            {showStaff && <th>Assigned to</th>}
            <th>Filed</th>
          </tr>
        </thead>
        <tbody>
          {complaints.map((c) => (
            <tr key={c.complaint_id}>
              <td><span className="plate">{plate(c.complaint_id)}</span></td>
              <td>
                <Link className="title-link" href={`/complaints/${c.complaint_id}`}>{c.title}</Link>
                <div className="small muted">{c.category_name}</div>
              </td>
              <td>{c.ward_name}</td>
              <td><StatusBadge status={c.status} /></td>
              <td><PriorityLabel priority={c.priority} /></td>
              <td className={c.is_overdue ? 'overdue small' : 'small'}>{slaText(c.sla_due_at, c.status)}</td>
              {showCitizen && <td>{c.citizen_name}</td>}
              {showStaff && <td>{c.assigned_staff_name || <span className="muted">—</span>}</td>}
              <td className="small">{formatDate(c.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

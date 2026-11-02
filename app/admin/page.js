'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { ErrorNotice, Notice } from '@/components/Badges';

function Bars({ rows, labelKey, valueKey }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r[labelKey]}>
          <span>{r[labelKey]}</span>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(r[valueKey] / max) * 100}%` }} /></div>
          <span className="num">{r[valueKey]}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('/api/stats').then(setStats).catch(setError);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function maintenance(action) {
    setBusy(true);
    setError(null);
    setMessage('');
    try {
      const d = await api('/api/admin/maintenance', { method: 'POST', body: { action } });
      setMessage(d.message);
      load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!stats) {
    return (
      <main className="page">
        <ErrorNotice error={error} />
        {!error && <p className="muted">Loading dashboard…</p>}
      </main>
    );
  }

  const k = stats.kpis;
  const maxTrend = Math.max(1, ...stats.trend.map((t) => t.total));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>City dashboard</h1>
          <p>Live figures from the database views. Overdue means the category&apos;s response target has passed.</p>
        </div>
        <div className="row">
          <button className="btn small secondary" disabled={busy} onClick={() => maintenance('escalate')}>Escalate overdue</button>
          {k.missing_embeddings > 0 && (
            <button className="btn small secondary" disabled={busy} onClick={() => maintenance('embed')}>
              Compute {k.missing_embeddings} missing embedding{k.missing_embeddings === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
      <Notice kind="success">{message}</Notice>
      <ErrorNotice error={error} />

      <div className="figures">
        <div className="figure"><div className="value">{k.total}</div><div className="label">complaints filed</div></div>
        <div className="figure"><div className="value">{k.pending}</div><div className="label">pending</div></div>
        <div className="figure"><div className="value">{k.unassigned}</div><div className="label">waiting for assignment</div></div>
        <div className="figure alert"><div className="value">{k.overdue}</div><div className="label">pending and overdue</div></div>
        <div className="figure"><div className="value">{k.avg_resolution_hours ?? '—'}</div><div className="label">average hours to resolve</div></div>
        <div className="figure"><div className="value">{k.avg_rating ?? '—'}</div><div className="label">average citizen rating</div></div>
      </div>

      <section className="panel">
        <div className="panel-title">
          <h2>Department performance</h2>
          <span className="small muted">view v_department_performance</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Department</th>
                <th className="num">Total</th>
                <th className="num">Pending</th>
                <th className="num">Resolved</th>
                <th className="num">Overdue</th>
                <th className="num">Avg hours to resolve</th>
                <th className="num">Resolved within SLA</th>
              </tr>
            </thead>
            <tbody>
              {stats.departments.map((d) => (
                <tr key={d.dept_id}>
                  <td>
                    <Link className="title-link" href={`/admin/complaints?dept_id=${d.dept_id}`}>{d.dept_name}</Link>
                  </td>
                  <td className="num">{d.total_complaints}</td>
                  <td className="num">{d.pending}</td>
                  <td className="num">{d.resolved}</td>
                  <td className={`num ${d.overdue > 0 ? 'overdue' : ''}`}>{d.overdue}</td>
                  <td className="num">{d.avg_resolution_hours ?? '—'}</td>
                  <td className="num">{d.sla_compliance_pct == null ? '—' : `${d.sla_compliance_pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid-halves" style={{ marginTop: 20 }}>
        <section className="panel">
          <div className="panel-title">
            <h2>Hotspot wards</h2>
            <span className="small muted">pending at or above the ward average</span>
          </div>
          {stats.hotspots.length === 0 ? (
            <p className="muted">No pending complaints.</p>
          ) : (
            <Bars rows={stats.hotspots} labelKey="ward_name" valueKey="pending" />
          )}
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>Most reported categories</h2>
          </div>
          <Bars rows={stats.categories} labelKey="category_name" valueKey="total" />
        </section>
      </div>

      <div className="grid-halves" style={{ marginTop: 20 }}>
        <section className="panel">
          <div className="panel-title">
            <h2>Complaints per day</h2>
            <span className="small muted">last 14 days</span>
          </div>
          <div className="trend" role="img" aria-label="Complaints filed per day over the last 14 days">
            {stats.trend.map((t) => (
              <div className="col" key={t.day} title={`${t.day}: ${t.total}`}>
                <div className="stick" style={{ height: `${(t.total / maxTrend) * 85}%` }} />
                <span className="cap">{t.day.slice(8)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-title">
            <h2>Busiest staff</h2>
            <Link href="/admin/staff" className="small">Manage staff</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th className="num">Active</th><th className="num">Resolved</th><th className="num">Rating</th></tr>
              </thead>
              <tbody>
                {stats.staff.map((s) => (
                  <tr key={s.staff_id}>
                    <td>{s.name}<div className="small muted">{s.dept_name}{s.is_available ? '' : ', unavailable'}</div></td>
                    <td className="num">{s.active_count}</td>
                    <td className="num">{s.resolved_count}</td>
                    <td className="num">{s.avg_rating ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-title">
          <h2>Wards</h2>
          <span className="small muted">view v_ward_summary</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Ward</th><th>Pincode</th><th className="num">Total</th><th className="num">Pending</th><th className="num">Resolved</th><th className="num">Avg rating</th></tr>
            </thead>
            <tbody>
              {stats.wards.map((w) => (
                <tr key={w.ward_id}>
                  <td><Link className="title-link" href={`/admin/complaints?ward_id=${w.ward_id}`}>{w.ward_name}</Link></td>
                  <td>{w.pincode}</td>
                  <td className="num">{w.total_complaints}</td>
                  <td className="num">{w.pending}</td>
                  <td className="num">{w.resolved}</td>
                  <td className="num">{w.avg_rating ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

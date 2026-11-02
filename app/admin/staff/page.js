'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { ErrorNotice, Notice } from '@/components/Badges';

const EMPTY = { name: '', email: '', password: '', designation: '', dept_id: '', phone: '' };

export default function AdminStaff() {
  const [staff, setStaff] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('/api/staff').then((d) => setStaff(d.staff)).catch(setError);
  }, []);

  useEffect(() => {
    load();
    api('/api/meta').then((d) => setDepartments(d.departments)).catch(setError);
  }, [load]);

  async function toggle(member) {
    setError(null);
    try {
      await api(`/api/staff/${member.staff_id}`, { method: 'PATCH', body: { is_available: !member.is_available } });
      load();
    } catch (err) {
      setError(err);
    }
  }

  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setMessage('');
    try {
      await api('/api/staff', { method: 'POST', body: form });
      setMessage(`${form.name} can now log in with ${form.email}.`);
      setForm(EMPTY);
      load();
    } catch (err) {
      setFormError(err);
    } finally {
      setBusy(false);
    }
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Staff</h1>
          <p>Only available staff can be assigned. Workload counts complaints that are assigned or in progress.</p>
        </div>
      </div>
      <ErrorNotice error={error} />
      <div className="grid-2">
        <div className="table-wrap">
          {!staff ? (
            <div className="empty">Loading staff…</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th className="num">Active</th>
                  <th className="num">Resolved</th>
                  <th className="num">Rating</th>
                  <th>Availability</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.staff_id}>
                    <td>{s.name}<div className="small muted">{s.designation}, {s.email}</div></td>
                    <td>{s.dept_name}</td>
                    <td className="num">{s.active_count}</td>
                    <td className="num">{s.resolved_count}</td>
                    <td className="num">{s.avg_rating ?? '—'}</td>
                    <td>
                      <button className={`btn small ${s.is_available ? 'secondary' : 'danger'}`} onClick={() => toggle(s)}>
                        {s.is_available ? 'Available' : 'Unavailable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <form className="panel" onSubmit={create}>
          <h2>Add a staff member</h2>
          <Notice kind="success">{message}</Notice>
          <ErrorNotice error={formError} />
          <div className="field">
            <label htmlFor="s-name">Full name</label>
            <input id="s-name" value={form.name} onChange={set('name')} required />
          </div>
          <div className="field">
            <label htmlFor="s-email">Work email</label>
            <input id="s-email" type="email" value={form.email} onChange={set('email')} required />
          </div>
          <div className="field">
            <label htmlFor="s-password">Temporary password <span className="hint">at least 8 characters</span></label>
            <input id="s-password" type="text" value={form.password} onChange={set('password')} required minLength={8} />
          </div>
          <div className="field">
            <label htmlFor="s-designation">Designation</label>
            <input id="s-designation" value={form.designation} onChange={set('designation')} placeholder="Assistant Engineer" required />
          </div>
          <div className="field">
            <label htmlFor="s-dept">Department</label>
            <select id="s-dept" value={form.dept_id} onChange={set('dept_id')} required>
              <option value="">Choose a department</option>
              {departments.map((d) => <option key={d.dept_id} value={d.dept_id}>{d.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="s-phone">Mobile number <span className="hint">optional</span></label>
            <input id="s-phone" inputMode="numeric" value={form.phone} onChange={set('phone')} />
          </div>
          <button className="btn" style={{ marginTop: 18 }} disabled={busy}>{busy ? 'Adding…' : 'Add staff member'}</button>
        </form>
      </div>
    </main>
  );
}

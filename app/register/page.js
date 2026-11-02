'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { ErrorNotice } from '@/components/Badges';

export default function RegisterPage() {
  const router = useRouter();
  const [wards, setWards] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', ward_id: '', phone1: '', phone2: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/meta').then((d) => setWards(d.wards)).catch(setError);
  }, []);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: {
          name: form.name,
          email: form.email,
          password: form.password,
          ward_id: form.ward_id,
          phones: [form.phone1, form.phone2].filter((p) => p.trim()),
        },
      });
      router.push(data.home);
      router.refresh();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="auth">
        <div className="panel">
          <h1>Create a citizen account</h1>
          <p className="muted small">Your details are checked by the database itself, so invalid emails or phone numbers are rejected.</p>
          <ErrorNotice error={error} />
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="name">Full name</label>
              <input id="name" value={form.name} onChange={set('name')} required />
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={form.email} onChange={set('email')} required />
            </div>
            <div className="field">
              <label htmlFor="password">Password <span className="hint">at least 8 characters</span></label>
              <input id="password" type="password" value={form.password} onChange={set('password')} required minLength={8} />
            </div>
            <div className="field">
              <label htmlFor="ward">Ward you live in</label>
              <select id="ward" value={form.ward_id} onChange={set('ward_id')} required>
                <option value="">Choose a ward</option>
                {wards.map((w) => (
                  <option key={w.ward_id} value={w.ward_id}>{w.name} ({w.pincode})</option>
                ))}
              </select>
            </div>
            <div className="field-row">
              <div>
                <label htmlFor="phone1">Mobile number</label>
                <input id="phone1" inputMode="numeric" placeholder="98XXXXXXXX" value={form.phone1} onChange={set('phone1')} required />
              </div>
              <div>
                <label htmlFor="phone2">Second number <span className="hint">optional</span></label>
                <input id="phone2" inputMode="numeric" value={form.phone2} onChange={set('phone2')} />
              </div>
            </div>
            <div className="row" style={{ marginTop: 20 }}>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
              <span className="muted small">Already registered? <Link href="/login">Log in</Link></span>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

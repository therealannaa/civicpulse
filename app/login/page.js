'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { ErrorNotice } from '@/components/Badges';

const DEMO = [
  { label: 'Admin', email: 'admin@civicpulse.in' },
  { label: 'Staff (roads)', email: 'ravi.kumar@civicpulse.in' },
  { label: 'Citizen', email: 'priya@example.com' },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      const next = new URLSearchParams(window.location.search).get('next');
      router.push(next && next.startsWith('/') ? next : data.home);
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
          <h1>Log in</h1>
          <ErrorNotice error={error} />
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="row" style={{ marginTop: 20 }}>
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
              <span className="muted small">
                New here? <Link href="/register">Create an account</Link>
              </span>
            </div>
          </form>
          <div className="demo-logins">
            Demo accounts (password <code>Password@123</code>):{' '}
            {DEMO.map((d, i) => (
              <span key={d.email}>
                {i > 0 && ', '}
                <button type="button" onClick={() => { setEmail(d.email); setPassword('Password@123'); }}>
                  {d.label}
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

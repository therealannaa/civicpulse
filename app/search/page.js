'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api, formatDate, plate } from '@/lib/client';
import { StatusBadge, ErrorNotice } from '@/components/Badges';

// ts_headline marks matches with [[ ]]; render them as <mark> without using raw HTML
function Highlighted({ text }) {
  if (!text) return null;
  const parts = text.split(/(\[\[.*?\]\])/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('[[') && part.endsWith(']]') ? <mark key={i}>{part.slice(2, -2)}</mark> : <span key={i}>{part}</span>
      )}
    </>
  );
}

const EXAMPLES = ['dangerous for bikes at night', 'water wasted on the road', 'kids could get hurt near school'];

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState('semantic');
  const [results, setResults] = useState(null);
  const [searchedMode, setSearchedMode] = useState('semantic');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function search(event, text = q, chosenMode = mode) {
    if (event) event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = await api(`/api/search?mode=${chosenMode}&q=${encodeURIComponent(text)}`);
      setResults(d.results);
      setSearchedMode(d.mode);
    } catch (err) {
      setError(err);
      setResults(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Search complaints</h1>
          <p>
            Meaning search finds complaints that describe the same problem in different words. Keyword search uses
            PostgreSQL full-text search and matches the words themselves.
          </p>
        </div>
      </div>
      <form className="panel" onSubmit={search}>
        <div className="filters">
          <div className="grow">
            <label htmlFor="q">Search for</label>
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Describe the problem" />
          </div>
          <div>
            <label htmlFor="mode">Search by</label>
            <select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="semantic">Meaning (vector)</option>
              <option value="keyword">Keywords (full-text)</option>
            </select>
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <button className="btn" disabled={busy || q.trim().length < 2}>{busy ? 'Searching…' : 'Search'}</button>
          </div>
        </div>
        <div className="small muted">
          Try:{' '}
          {EXAMPLES.map((ex, i) => (
            <span key={ex}>
              {i > 0 && ', '}
              <button
                type="button"
                className="demo-link"
                style={{ background: 'none', border: 0, padding: 0, color: 'var(--civic)', cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}
                onClick={() => {
                  setQ(ex);
                  search(null, ex, mode);
                }}
              >
                {ex}
              </button>
            </span>
          ))}
        </div>
      </form>

      <ErrorNotice error={error} />

      {results && (
        <section className="panel">
          <div className="panel-title">
            <h2>{results.length} result{results.length === 1 ? '' : 's'}</h2>
            <span className="small muted">
              {searchedMode === 'semantic' ? 'Ranked by cosine similarity' : 'Ranked by ts_rank'}
            </span>
          </div>
          {results.length === 0 && <p className="muted">No complaints matched. Try the other search mode.</p>}
          {results.map((r) => (
            <div className="result" key={r.complaint_id}>
              <div className="row">
                <span className="plate">{plate(r.complaint_id)}</span>
                <Link className="title-link" style={{ fontWeight: 600 }} href={`/complaints/${r.complaint_id}`}>{r.title}</Link>
              </div>
              <div className="small" style={{ marginTop: 4 }}>
                <Highlighted text={r.snippet} />
              </div>
              <div className="row small" style={{ marginTop: 4 }}>
                <StatusBadge status={r.status} />
                <span className="muted">{r.category_name}, {r.ward_name}, {formatDate(r.created_at)}</span>
                <span className="score">
                  {searchedMode === 'semantic' ? `${Math.round(r.score * 100)}% similar` : `rank ${Number(r.score).toFixed(3)}`}
                </span>
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import ComplaintTable from '@/components/ComplaintTable';
import { ErrorNotice } from '@/components/Badges';
import { STATUSES, STATUS_LABELS, PRIORITIES } from '@/lib/workflow';

const INITIAL = { status: '', ward_id: '', category_id: '', dept_id: '', priority: '', overdue: '', q: '', sort: 'newest' };

export default function AdminComplaints() {
  const [meta, setMeta] = useState({ wards: [], categories: [], departments: [] });
  const [filters, setFilters] = useState(null);
  const [search, setSearch] = useState('');
  const [complaints, setComplaints] = useState(null);
  const [error, setError] = useState(null);

  // Read initial filters from the URL (links from the dashboard)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const start = { ...INITIAL };
    for (const key of Object.keys(INITIAL)) {
      if (params.get(key)) start[key] = params.get(key);
    }
    setFilters(start);
    setSearch(start.q);
    api('/api/meta').then(setMeta).catch(setError);
  }, []);

  useEffect(() => {
    if (!filters) return;
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    setComplaints(null);
    api(`/api/complaints?${qs}`)
      .then((d) => {
        setComplaints(d.complaints);
        setError(null);
      })
      .catch(setError);
  }, [filters]);

  if (!filters) return <main className="page"><p className="muted">Loading…</p></main>;
  const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>All complaints</h1>
          <p>Filter, search the text, and open a complaint to assign or update it.</p>
        </div>
        <button className="btn small secondary" onClick={() => { setFilters(INITIAL); setSearch(''); }}>Clear filters</button>
      </div>

      <form
        className="filters"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters({ ...filters, q: search });
        }}
      >
        <div className="grow">
          <label htmlFor="q">Words in title or description</label>
          <input id="q" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="pothole school, garbage -park" />
        </div>
        <div>
          <label htmlFor="status">Status</label>
          <select id="status" value={filters.status} onChange={set('status')}>
            <option value="">Any</option>
            <option value="PENDING">Pending (open, assigned, in progress)</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="dept">Department</label>
          <select id="dept" value={filters.dept_id} onChange={set('dept_id')}>
            <option value="">Any</option>
            {meta.departments.map((d) => <option key={d.dept_id} value={d.dept_id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="category">Category</label>
          <select id="category" value={filters.category_id} onChange={set('category_id')}>
            <option value="">Any</option>
            {meta.categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ward">Ward</label>
          <select id="ward" value={filters.ward_id} onChange={set('ward_id')}>
            <option value="">Any</option>
            {meta.wards.map((w) => <option key={w.ward_id} value={w.ward_id}>{w.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="priority">Priority</label>
          <select id="priority" value={filters.priority} onChange={set('priority')}>
            <option value="">Any</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sort">Sort by</label>
          <select id="sort" value={filters.sort} onChange={set('sort')}>
            <option value="newest">Newest first</option>
            <option value="sla">Deadline first</option>
            <option value="priority">Priority</option>
          </select>
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={filters.overdue === '1'}
              onChange={(e) => setFilters({ ...filters, overdue: e.target.checked ? '1' : '' })}
            />
            Overdue only
          </label>
        </div>
        <div style={{ flex: '0 0 auto' }}>
          <button className="btn">Search</button>
        </div>
      </form>

      <ErrorNotice error={error} />
      {complaints && <p className="small muted">{complaints.length} complaint{complaints.length === 1 ? '' : 's'}</p>}
      <ComplaintTable complaints={complaints} showCitizen />
    </main>
  );
}

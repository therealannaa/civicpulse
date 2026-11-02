import { STATUS_LABELS } from '@/lib/workflow';

export function StatusBadge({ status }) {
  return <span className={`badge status-${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export function PriorityLabel({ priority }) {
  const text = priority ? priority.charAt(0) + priority.slice(1).toLowerCase() : '';
  return <span className={`priority priority-${priority}`}>{text}</span>;
}

export function Notice({ kind = 'error', children }) {
  if (!children) return null;
  return (
    <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

// Shows an API error, including which database constraint rejected the input.
export function ErrorNotice({ error }) {
  if (!error) return null;
  return (
    <Notice kind="error">
      {error.message}
      {error.constraint ? (
        <span className="small">
          {' '}
          (rejected by database constraint <code>{error.constraint}</code>)
        </span>
      ) : null}
    </Notice>
  );
}

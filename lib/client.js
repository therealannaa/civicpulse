'use client';

// Browser-side helper for calling the API routes.
export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.constraint = data?.dbConstraint || null;
    throw error;
  }
  return data;
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// "due in 5 h", "3 h overdue"
export function slaText(dueAt, status) {
  if (!dueAt) return '—';
  if (['RESOLVED', 'CLOSED', 'REJECTED'].includes(status)) return formatDateTime(dueAt);
  const diffHours = Math.round((new Date(dueAt).getTime() - Date.now()) / 36e5);
  if (diffHours >= 48) return `due in ${Math.round(diffHours / 24)} days`;
  if (diffHours >= 0) return `due in ${diffHours} h`;
  if (diffHours > -48) return `${-diffHours} h overdue`;
  return `${Math.round(-diffHours / 24)} days overdue`;
}

export function plate(id) {
  return `CP-${String(id).padStart(4, '0')}`;
}

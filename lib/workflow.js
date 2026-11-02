// Mirrors fn_is_valid_transition() in sql/02_functions_triggers.sql.
// The database is the source of truth; this copy only decides which buttons to show.
export const STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED'];
export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const PENDING = ['OPEN', 'ASSIGNED', 'IN_PROGRESS'];

export const TRANSITIONS = {
  OPEN: ['ASSIGNED', 'REJECTED'],
  ASSIGNED: ['IN_PROGRESS', 'OPEN', 'REJECTED'],
  IN_PROGRESS: ['RESOLVED', 'OPEN'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  REJECTED: [],
};

// Status changes each role may make through PATCH /api/complaints/[id].
// ASSIGNED is only reached through the assign endpoint (stored procedure).
export function allowedStatusChanges(role, status, isActiveAssignee) {
  const next = TRANSITIONS[status] || [];
  if (role === 'ADMIN') return next.filter((s) => s !== 'ASSIGNED');
  if (role === 'STAFF' && isActiveAssignee) {
    return next.filter((s) => ['IN_PROGRESS', 'RESOLVED', 'OPEN'].includes(s) && !(status === 'RESOLVED'));
  }
  return [];
}

export const STATUS_LABELS = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
};

export const ACTION_LABELS = {
  IN_PROGRESS: 'Start work',
  RESOLVED: 'Mark resolved',
  OPEN: 'Return to queue',
  REJECTED: 'Reject complaint',
  CLOSED: 'Close complaint',
};

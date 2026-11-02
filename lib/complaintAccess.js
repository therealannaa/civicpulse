import { query } from '@/lib/db';
import { HttpError } from '@/lib/http';

// Shared by the complaint detail API and the complaint photo APIs.
export async function loadComplaint(id) {
  const { rows } = await query('SELECT * FROM v_complaint_details WHERE complaint_id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, `Complaint #${id} does not exist.`);
  return rows[0];
}

export async function assertCanView(session, complaint) {
  if (session.role === 'ADMIN') return;
  if (session.role === 'CITIZEN') {
    if (complaint.citizen_id !== session.userId) throw new HttpError(403, 'You can only view your own complaints.');
    return;
  }
  const { rows } = await query(
    `SELECT (sp.dept_id = $2)
            OR EXISTS (SELECT 1 FROM assignments a WHERE a.complaint_id = $3 AND a.staff_id = $1) AS allowed
       FROM staff_profile sp WHERE sp.staff_id = $1`,
    [session.userId, complaint.dept_id, complaint.complaint_id]
  );
  if (!rows[0]?.allowed) throw new HttpError(403, 'This complaint belongs to another department.');
}

// Photos can be added or removed by the citizen who filed the complaint, until it is closed.
export const MAX_IMAGES = 3;
export function canManageImages(session, complaint) {
  return (
    session.role === 'CITIZEN' &&
    complaint.citizen_id === session.userId &&
    !['CLOSED', 'REJECTED'].includes(complaint.status)
  );
}

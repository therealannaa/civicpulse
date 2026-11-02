import { query, withTransaction } from '@/lib/db';
import { route, json, readJson, requireUser, HttpError, toInt } from '@/lib/http';
import { allowedStatusChanges, PRIORITIES, PENDING, ACTION_LABELS } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

async function loadComplaint(id) {
  const { rows } = await query('SELECT * FROM v_complaint_details WHERE complaint_id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, `Complaint #${id} does not exist.`);
  return rows[0];
}

async function assertCanView(session, complaint) {
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

// GET /api/complaints/[id] - full details, timeline, similar complaints and allowed actions
export const GET = route(async (request, { params }) => {
  const session = await requireUser(['CITIZEN', 'STAFF', 'ADMIN']);
  const id = toInt(params.id, 'Complaint id');
  const complaint = await loadComplaint(id);
  await assertCanView(session, complaint);

  const [history, assignments, feedback, similar] = await Promise.all([
    query(
      `SELECT history_id, changed_at, old_status, new_status, note
         FROM status_history WHERE complaint_id = $1
        ORDER BY changed_at, history_id`,
      [id]
    ),
    query(
      `SELECT a.staff_id, u.name, sp.designation, a.assigned_at, a.unassigned_at
         FROM assignments a
         JOIN staff_profile sp ON sp.staff_id = a.staff_id
         JOIN users u          ON u.user_id = a.staff_id
        WHERE a.complaint_id = $1
        ORDER BY a.assigned_at`,
      [id]
    ),
    query(
      `SELECT f.feedback_id, f.rating, f.comment, f.created_at, u.name
         FROM feedback f JOIN users u ON u.user_id = f.user_id
        WHERE f.complaint_id = $1`,
      [id]
    ),
    query(
      `SELECT s.*
         FROM complaints c,
              LATERAL fn_find_similar_complaints(c.embedding, 5, c.complaint_id, 0.45) s
        WHERE c.complaint_id = $1 AND c.embedding IS NOT NULL`,
      [id]
    ),
  ]);

  const isActiveAssignee = session.role === 'STAFF' && complaint.assigned_staff_id === session.userId;
  const statusActions = allowedStatusChanges(session.role, complaint.status, isActiveAssignee).map((s) => ({
    status: s,
    label: complaint.status === 'RESOLVED' && s === 'IN_PROGRESS' ? 'Reopen' : ACTION_LABELS[s] || s,
  }));
  const isOwner = session.role === 'CITIZEN' && complaint.citizen_id === session.userId;

  let staffOptions = [];
  const canAssign = session.role === 'ADMIN' && ['OPEN', 'ASSIGNED'].includes(complaint.status);
  if (canAssign) {
    const { rows } = await query(
      `SELECT staff_id, name, designation, is_available, active_count
         FROM v_staff_workload WHERE dept_id = $1
        ORDER BY is_available DESC, active_count, name`,
      [complaint.dept_id]
    );
    staffOptions = rows;
  }

  return json({
    complaint,
    history: history.rows,
    assignments: assignments.rows,
    feedback: feedback.rows[0] || null,
    similar: similar.rows,
    staffOptions,
    permissions: {
      statusActions,
      canAssign,
      canChangePriority: session.role === 'ADMIN' && PENDING.includes(complaint.status),
      canFeedback: isOwner && complaint.status === 'RESOLVED' && feedback.rows.length === 0,
      canDelete: session.role === 'ADMIN' || (isOwner && complaint.status === 'OPEN'),
    },
  });
});

// PATCH /api/complaints/[id] - status change (staff/admin) and priority change (admin)
export const PATCH = route(async (request, { params }) => {
  const session = await requireUser(['STAFF', 'ADMIN']);
  const id = toInt(params.id, 'Complaint id');
  const body = await readJson(request);
  const noteText = String(body.note ?? '').trim().slice(0, 500);

  if (!body.status && !body.priority) throw new HttpError(400, 'Nothing to update.');

  await withTransaction(async (client) => {
    // Lock the complaint row for the rest of this transaction
    const { rows } = await client.query(
      `SELECT c.status, a.staff_id AS active_staff_id
         FROM complaints c
         LEFT JOIN assignments a ON a.complaint_id = c.complaint_id AND a.unassigned_at IS NULL
        WHERE c.complaint_id = $1
          FOR UPDATE OF c`,
      [id]
    );
    if (!rows[0]) throw new HttpError(404, `Complaint #${id} does not exist.`);
    const current = rows[0];

    if (body.status) {
      const isActiveAssignee = current.active_staff_id === session.userId;
      const allowed = allowedStatusChanges(session.role, current.status, isActiveAssignee);
      if (!allowed.includes(body.status)) {
        throw new HttpError(
          session.role === 'STAFF' && !isActiveAssignee ? 403 : 400,
          session.role === 'STAFF' && !isActiveAssignee
            ? 'Only the staff member currently assigned can update this complaint.'
            : `A complaint that is ${current.status} cannot be moved to ${body.status}.`
        );
      }
      const note = `${session.name} (${session.role.toLowerCase()}): ${noteText || ACTION_LABELS[body.status] || body.status}`;
      // The AFTER UPDATE trigger reads this transaction-local setting into status_history.note
      await client.query(`SELECT set_config('civicpulse.status_note', $1, true)`, [note]);
      await client.query('UPDATE complaints SET status = $1 WHERE complaint_id = $2', [body.status, id]);
    }

    if (body.priority) {
      if (session.role !== 'ADMIN') throw new HttpError(403, 'Only admins can change priority.');
      if (!PRIORITIES.includes(body.priority)) throw new HttpError(400, 'Unknown priority.');
      await client.query('UPDATE complaints SET priority = $1 WHERE complaint_id = $2', [body.priority, id]);
    }
  });

  return json({ ok: true });
});

// DELETE /api/complaints/[id] - citizen withdraws an OPEN complaint, or admin removes one
export const DELETE = route(async (request, { params }) => {
  const session = await requireUser(['CITIZEN', 'ADMIN']);
  const id = toInt(params.id, 'Complaint id');

  const result =
    session.role === 'ADMIN'
      ? await query('DELETE FROM complaints WHERE complaint_id = $1', [id])
      : await query(`DELETE FROM complaints WHERE complaint_id = $1 AND citizen_id = $2 AND status = 'OPEN'`, [
          id,
          session.userId,
        ]);

  if (result.rowCount === 0) {
    throw new HttpError(
      400,
      session.role === 'ADMIN'
        ? `Complaint #${id} does not exist.`
        : 'You can only withdraw your own complaints while they are still open.'
    );
  }
  return json({ ok: true });
});

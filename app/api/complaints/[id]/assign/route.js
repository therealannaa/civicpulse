import { withTransaction } from '@/lib/db';
import { route, json, readJson, requireUser, HttpError, toInt } from '@/lib/http';

export const dynamic = 'force-dynamic';

// POST /api/complaints/[id]/assign  { staff_id, note }  or  { auto: true }
// Uses the stored procedure assign_complaint / function fn_auto_assign.
export const POST = route(async (request, { params }) => {
  const session = await requireUser(['ADMIN']);
  const id = toInt(params.id, 'Complaint id');
  const body = await readJson(request);

  const staffId = await withTransaction(async (client) => {
    if (body.auto) {
      const { rows } = await client.query('SELECT fn_auto_assign($1::int) AS staff_id', [id]);
      return rows[0].staff_id;
    }
    const chosen = toInt(body.staff_id, 'Staff member');
    const noteText = String(body.note ?? '').trim().slice(0, 500);
    const note = noteText ? `${session.name} (admin): ${noteText}` : null;
    await client.query('CALL assign_complaint($1::int, $2::int, $3::text)', [id, chosen, note]);
    return chosen;
  });

  if (!staffId) throw new HttpError(500, 'Assignment did not return a staff member.');
  return json({ ok: true, staff_id: staffId });
});

import { query } from '@/lib/db';
import { route, json, readJson, requireUser, HttpError, toInt } from '@/lib/http';

export const dynamic = 'force-dynamic';

// PATCH /api/staff/[id]  { is_available?, designation? }
export const PATCH = route(async (request, { params }) => {
  await requireUser(['ADMIN']);
  const id = toInt(params.id, 'Staff id');
  const body = await readJson(request);

  const isAvailable = typeof body.is_available === 'boolean' ? body.is_available : null;
  const designation = body.designation === undefined ? null : String(body.designation).trim();

  const result = await query(
    `UPDATE staff_profile
        SET is_available = COALESCE($1, is_available),
            designation  = COALESCE($2, designation)
      WHERE staff_id = $3`,
    [isAvailable, designation, id]
  );
  if (result.rowCount === 0) throw new HttpError(404, `Staff member #${id} does not exist.`);
  return json({ ok: true });
});

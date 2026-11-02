import { query } from '@/lib/db';
import { route, json, readJson, requireUser, HttpError } from '@/lib/http';

export const dynamic = 'force-dynamic';

// PATCH /api/me/availability  { is_available } - staff marks themselves on/off duty
export const PATCH = route(async (request) => {
  const session = await requireUser(['STAFF']);
  const body = await readJson(request);
  if (typeof body.is_available !== 'boolean') throw new HttpError(400, 'is_available must be true or false.');
  await query('UPDATE staff_profile SET is_available = $1 WHERE staff_id = $2', [body.is_available, session.userId]);
  return json({ ok: true, is_available: body.is_available });
});

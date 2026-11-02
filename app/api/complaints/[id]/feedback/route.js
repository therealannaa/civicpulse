import { query } from '@/lib/db';
import { route, json, readJson, requireUser, toInt } from '@/lib/http';

export const dynamic = 'force-dynamic';

// POST /api/complaints/[id]/feedback  { rating, comment }
// Triggers check ownership + RESOLVED status, then close the complaint automatically.
export const POST = route(async (request, { params }) => {
  const session = await requireUser(['CITIZEN']);
  const id = toInt(params.id, 'Complaint id');
  const body = await readJson(request);
  const comment = String(body.comment ?? '').trim();

  await query(
    'INSERT INTO feedback (complaint_id, user_id, rating, comment) VALUES ($1, $2, $3, $4)',
    [id, session.userId, Number(body.rating), comment || null]
  );
  return json({ ok: true }, 201);
});

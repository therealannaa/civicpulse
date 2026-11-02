import { query } from '@/lib/db';
import { route, json, requireUser, HttpError, toInt } from '@/lib/http';
import { loadComplaint, assertCanView, canManageImages } from '@/lib/complaintAccess';

export const dynamic = 'force-dynamic';

// GET /api/complaints/[id]/images/[imageId] - the photo itself, for anyone allowed to view the complaint
export const GET = route(async (request, { params }) => {
  const session = await requireUser(['CITIZEN', 'STAFF', 'ADMIN']);
  const id = toInt(params.id, 'Complaint id');
  const imageId = toInt(params.imageId, 'Image id');
  await assertCanView(session, await loadComplaint(id));

  const { rows } = await query(
    'SELECT mime_type, data FROM complaint_images WHERE image_id = $1 AND complaint_id = $2',
    [imageId, id]
  );
  if (!rows[0]) throw new HttpError(404, 'Photo not found.');

  return new Response(rows[0].data, {
    headers: {
      'Content-Type': rows[0].mime_type,
      'Content-Length': String(rows[0].data.length),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});

// DELETE /api/complaints/[id]/images/[imageId] - the filing citizen removes a photo
export const DELETE = route(async (request, { params }) => {
  const session = await requireUser(['CITIZEN']);
  const id = toInt(params.id, 'Complaint id');
  const imageId = toInt(params.imageId, 'Image id');
  if (!canManageImages(session, await loadComplaint(id))) {
    throw new HttpError(403, 'Only the citizen who filed this complaint can remove photos, and only until it is closed.');
  }

  const { rowCount } = await query('DELETE FROM complaint_images WHERE image_id = $1 AND complaint_id = $2', [imageId, id]);
  if (rowCount === 0) throw new HttpError(404, 'Photo not found.');
  return json({ ok: true });
});

import { withTransaction } from '@/lib/db';
import { route, json, requireUser, HttpError, toInt } from '@/lib/http';
import { loadComplaint, canManageImages, MAX_IMAGES } from '@/lib/complaintAccess';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 2 * 1024 * 1024;

// The type is read from the file's first bytes, not trusted from the browser.
function detectImageType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// POST /api/complaints/[id]/images - the filing citizen uploads 1 to 3 photos (multipart form field "images")
export const POST = route(async (request, { params }) => {
  const session = await requireUser(['CITIZEN']);
  const id = toInt(params.id, 'Complaint id');
  const complaint = await loadComplaint(id);
  if (!canManageImages(session, complaint)) {
    throw new HttpError(403, 'Only the citizen who filed this complaint can add photos, and only until it is closed.');
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, 'Send the photos as multipart/form-data.');
  }
  const files = form.getAll('images').filter((f) => typeof f === 'object' && f.size > 0);
  if (files.length === 0) throw new HttpError(400, 'Choose at least one photo.');
  if (files.length > MAX_IMAGES) throw new HttpError(400, `You can add at most ${MAX_IMAGES} photos.`);

  const images = [];
  for (const file of files) {
    if (file.size > MAX_BYTES) throw new HttpError(400, `"${file.name}" is larger than 2 MB.`);
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = detectImageType(bytes);
    if (!mime) throw new HttpError(400, `"${file.name}" is not a JPEG, PNG or WebP image.`);
    images.push({ name: String(file.name || 'photo').slice(0, 150), mime, bytes });
  }

  // All photos are saved together or not at all. The trigger trg_images_validate
  // enforces the 3-photo limit and the CLOSED / REJECTED rule inside the database.
  const saved = await withTransaction(async (client) => {
    const ids = [];
    for (const img of images) {
      const { rows } = await client.query(
        `INSERT INTO complaint_images (file_name, mime_type, size_bytes, data, complaint_id, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING image_id`,
        [img.name, img.mime, img.bytes.length, img.bytes, id, session.userId]
      );
      ids.push(rows[0].image_id);
    }
    return ids;
  });

  return json({ image_ids: saved }, 201);
});

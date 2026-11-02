import { query } from '@/lib/db';
import { route, json, readJson, requireUser, HttpError, optionalInt } from '@/lib/http';
import { embed, complaintText, toVectorLiteral } from '@/lib/embeddings';

export const dynamic = 'force-dynamic';

// POST /api/complaints/similar - duplicate detection while a citizen types a complaint
export const POST = route(async (request) => {
  await requireUser(['CITIZEN', 'STAFF', 'ADMIN']);
  const body = await readJson(request);
  const text = complaintText({
    title: String(body.title ?? '').trim(),
    description: String(body.description ?? '').trim(),
    location_text: String(body.location_text ?? '').trim(),
  });
  if (text.length < 10) throw new HttpError(400, 'Write a little more before checking for similar complaints.');

  let vector;
  try {
    vector = await embed(text);
  } catch (err) {
    throw new HttpError(503, `The embedding model is not available yet (${err.message}). Run "npm run db:embed" once with internet access.`);
  }

  const { rows } = await query(
    'SELECT * FROM fn_find_similar_complaints($1::vector, 5, $2, 0.5)',
    [toVectorLiteral(vector), optionalInt(body.exclude_id)]
  );
  return json({ similar: rows });
});

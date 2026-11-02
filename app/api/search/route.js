import { query } from '@/lib/db';
import { route, json, requireUser, HttpError } from '@/lib/http';
import { embed, toVectorLiteral } from '@/lib/embeddings';

export const dynamic = 'force-dynamic';

// GET /api/search?q=...&mode=keyword|semantic
//   keyword  : PostgreSQL full-text search (GIN index, ts_rank, ts_headline)
//   semantic : pgvector cosine similarity on sentence embeddings
export const GET = route(async (request) => {
  await requireUser(['STAFF', 'ADMIN']);
  const sp = new URL(request.url).searchParams;
  const q = (sp.get('q') || '').trim();
  const mode = sp.get('mode') === 'keyword' ? 'keyword' : 'semantic';
  if (q.length < 2) throw new HttpError(400, 'Type at least 2 characters to search.');

  if (mode === 'keyword') {
    const { rows } = await query(
      `SELECT c.complaint_id, c.title, c.status, w.name AS ward_name, cat.name AS category_name, c.created_at,
              ts_rank(to_tsvector('english', c.title || ' ' || c.description), tsq) AS score,
              ts_headline('english', c.description, tsq,
                          'StartSel=[[, StopSel=]], MaxWords=22, MinWords=8, MaxFragments=1') AS snippet
         FROM complaints c
         JOIN wards w        ON w.ward_id = c.ward_id
         JOIN categories cat ON cat.category_id = c.category_id
         CROSS JOIN websearch_to_tsquery('english', $1) AS tsq
        WHERE to_tsvector('english', c.title || ' ' || c.description) @@ tsq
        ORDER BY score DESC, c.created_at DESC
        LIMIT 20`,
      [q]
    );
    return json({ mode, results: rows });
  }

  let vector;
  try {
    vector = await embed(q);
  } catch (err) {
    throw new HttpError(503, `The embedding model is not available yet (${err.message}).`);
  }
  const { rows } = await query(
    `SELECT s.complaint_id, s.title, s.status, s.ward_name, s.category_name, s.created_at,
            s.similarity AS score, s.location_text AS snippet
       FROM fn_find_similar_complaints($1::vector, 15, NULL, 0.2) s`,
    [toVectorLiteral(vector)]
  );
  return json({ mode, results: rows });
});

import { query } from '@/lib/db';
import { route, json, readJson, requireUser, HttpError } from '@/lib/http';
import { embed, complaintText, toVectorLiteral } from '@/lib/embeddings';

export const dynamic = 'force-dynamic';

// POST /api/admin/maintenance  { action: 'escalate' | 'embed' }
export const POST = route(async (request) => {
  await requireUser(['ADMIN']);
  const { action } = await readJson(request);

  if (action === 'escalate') {
    const { rows } = await query('SELECT fn_escalate_overdue() AS escalated');
    return json({ message: `${rows[0].escalated} overdue complaint(s) moved up one priority level.` });
  }

  if (action === 'embed') {
    const { rows } = await query(
      'SELECT complaint_id, title, description, location_text FROM complaints WHERE embedding IS NULL ORDER BY complaint_id'
    );
    for (const row of rows) {
      const vector = await embed(complaintText(row));
      await query('UPDATE complaints SET embedding = $1::vector WHERE complaint_id = $2', [
        toVectorLiteral(vector),
        row.complaint_id,
      ]);
    }
    return json({ message: `Computed embeddings for ${rows.length} complaint(s).` });
  }

  throw new HttpError(400, 'Unknown action.');
});

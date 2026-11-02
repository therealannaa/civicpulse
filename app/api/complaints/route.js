import { query } from '@/lib/db';
import { route, json, readJson, requireUser, HttpError, optionalInt } from '@/lib/http';
import { embed, complaintText, toVectorLiteral } from '@/lib/embeddings';
import { STATUSES, PRIORITIES } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

const SORTS = {
  newest: 'v.created_at DESC',
  sla: 'v.sla_due_at ASC',
  priority: `CASE v.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, v.sla_due_at ASC`,
};

// GET /api/complaints  - list with filters, scoped by role
export const GET = route(async (request) => {
  const session = await requireUser(['CITIZEN', 'STAFF', 'ADMIN']);
  const sp = new URL(request.url).searchParams;

  const where = [];
  const params = [];
  const add = (sqlWithPlaceholder, value) => {
    params.push(value);
    where.push(sqlWithPlaceholder.replace('?', `$${params.length}`));
  };

  if (session.role === 'CITIZEN') {
    add('v.citizen_id = ?', session.userId);
  } else if (session.role === 'STAFF') {
    if (sp.get('scope') === 'dept') {
      add('v.dept_id = (SELECT dept_id FROM staff_profile WHERE staff_id = ?)', session.userId);
    } else {
      add('v.assigned_staff_id = ?', session.userId);
    }
  }

  const status = sp.get('status');
  if (status === 'PENDING') where.push(`v.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')`);
  else if (status && STATUSES.includes(status)) add('v.status = ?', status);

  const wardId = optionalInt(sp.get('ward_id'));
  if (wardId) add('v.ward_id = ?', wardId);
  const categoryId = optionalInt(sp.get('category_id'));
  if (categoryId) add('v.category_id = ?', categoryId);
  const deptId = optionalInt(sp.get('dept_id'));
  if (deptId) add('v.dept_id = ?', deptId);
  const priority = sp.get('priority');
  if (priority && PRIORITIES.includes(priority)) add('v.priority = ?', priority);
  if (sp.get('overdue') === '1') where.push('v.is_overdue');

  const q = (sp.get('q') || '').trim();
  if (q) {
    add(`to_tsvector('english', v.title || ' ' || v.description) @@ websearch_to_tsquery('english', ?)`, q);
  }

  const order = SORTS[sp.get('sort')] || SORTS.newest;
  const sql = `
    SELECT v.complaint_id, v.title, v.status, v.priority, v.location_text, v.created_at, v.resolved_at,
           v.category_name, v.dept_name, v.ward_name, v.citizen_name, v.sla_due_at, v.is_overdue,
           v.assigned_staff_id, v.assigned_staff_name
      FROM v_complaint_details v
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${order}
     LIMIT 300`;
  const { rows } = await query(sql, params);
  return json({ complaints: rows });
});

function parseCoordinate(value, name) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, `${name} must be a number.`);
  return n;
}

// POST /api/complaints  - citizen files a complaint (embedding computed on the server)
export const POST = route(async (request) => {
  const session = await requireUser(['CITIZEN']);
  const body = await readJson(request);

  const complaint = {
    title: String(body.title ?? '').trim(),
    description: String(body.description ?? '').trim(),
    location_text: String(body.location_text ?? '').trim(),
  };
  const priority = PRIORITIES.includes(body.priority) ? body.priority : 'MEDIUM';
  const latitude = parseCoordinate(body.latitude, 'Latitude');
  const longitude = parseCoordinate(body.longitude, 'Longitude');
  const categoryId = optionalInt(body.category_id);
  const wardId = optionalInt(body.ward_id);
  if (!categoryId) throw new HttpError(400, 'Choose a category.');
  if (!wardId) throw new HttpError(400, 'Choose a ward.');

  // The embedding is best-effort: the complaint is still saved if the model is unavailable.
  let vectorLiteral = null;
  try {
    vectorLiteral = toVectorLiteral(await embed(complaintText(complaint)));
  } catch (err) {
    console.warn('Embedding skipped:', err.message);
  }

  const { rows } = await query(
    `INSERT INTO complaints (title, description, priority, location_text, latitude, longitude,
                             embedding, citizen_id, category_id, ward_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9, $10)
     RETURNING complaint_id`,
    [
      complaint.title,
      complaint.description,
      priority,
      complaint.location_text,
      latitude,
      longitude,
      vectorLiteral,
      session.userId,
      categoryId,
      wardId,
    ]
  );
  return json({ complaint_id: rows[0].complaint_id, embedded: vectorLiteral !== null }, 201);
});

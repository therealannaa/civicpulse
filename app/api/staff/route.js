import bcrypt from 'bcryptjs';
import { query, withTransaction } from '@/lib/db';
import { route, json, readJson, requireUser, HttpError, optionalInt } from '@/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/staff?dept_id= - staff list with workload (view v_staff_workload)
export const GET = route(async (request) => {
  await requireUser(['ADMIN']);
  const deptId = optionalInt(new URL(request.url).searchParams.get('dept_id'));
  const { rows } = deptId
    ? await query('SELECT * FROM v_staff_workload WHERE dept_id = $1 ORDER BY name', [deptId])
    : await query('SELECT * FROM v_staff_workload ORDER BY dept_name, name');
  return json({ staff: rows });
});

// POST /api/staff - admin creates a staff account (users + staff_profile + user_phone in one transaction)
export const POST = route(async (request) => {
  await requireUser(['ADMIN']);
  const body = await readJson(request);
  const password = String(body.password ?? '');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  const deptId = optionalInt(body.dept_id);
  if (!deptId) throw new HttpError(400, 'Choose a department.');
  const phone = String(body.phone ?? '').replace(/\s+/g, '');
  const hash = await bcrypt.hash(password, 10);

  const staffId = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role, ward_id)
       VALUES ($1, $2, $3, 'STAFF', $4) RETURNING user_id`,
      [String(body.name ?? '').trim(), String(body.email ?? '').trim().toLowerCase(), hash, optionalInt(body.ward_id)]
    );
    const userId = rows[0].user_id;
    await client.query(
      'INSERT INTO staff_profile (staff_id, designation, is_available, dept_id) VALUES ($1, $2, TRUE, $3)',
      [userId, String(body.designation ?? '').trim(), deptId]
    );
    if (phone) {
      await client.query('INSERT INTO user_phone (user_id, phone) VALUES ($1, $2)', [userId, phone]);
    }
    return userId;
  });

  return json({ staff_id: staffId }, 201);
});

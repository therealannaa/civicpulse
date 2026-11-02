import { query } from '@/lib/db';
import { route, json, getSession } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const session = await getSession();
  if (!session) return json({ user: null });

  const { rows } = await query(
    `SELECT u.user_id, u.name, u.email, u.role, u.created_at, u.ward_id, w.name AS ward_name,
            COALESCE((SELECT array_agg(p.phone ORDER BY p.phone) FROM user_phone p WHERE p.user_id = u.user_id),
                     ARRAY[]::VARCHAR[]) AS phones,
            sp.designation, sp.is_available, sp.dept_id, d.name AS dept_name
       FROM users u
       LEFT JOIN wards w          ON w.ward_id = u.ward_id
       LEFT JOIN staff_profile sp ON sp.staff_id = u.user_id
       LEFT JOIN departments d    ON d.dept_id = sp.dept_id
      WHERE u.user_id = $1`,
    [session.userId]
  );
  return json({ user: rows[0] || null });
});

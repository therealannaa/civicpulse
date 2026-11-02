import { query } from '@/lib/db';
import { route, json } from '@/lib/http';

export const dynamic = 'force-dynamic';

// Public reference data for forms (wards, departments, categories).
export const GET = route(async () => {
  const [wards, departments, categories] = await Promise.all([
    query('SELECT ward_id, name, city, pincode FROM wards ORDER BY name'),
    query('SELECT dept_id, name, description FROM departments ORDER BY name'),
    query(
      `SELECT c.category_id, c.name, c.default_sla_hours, c.dept_id, d.name AS dept_name
         FROM categories c JOIN departments d ON d.dept_id = c.dept_id
        ORDER BY d.name, c.name`
    ),
  ]);
  return json({ wards: wards.rows, departments: departments.rows, categories: categories.rows });
});

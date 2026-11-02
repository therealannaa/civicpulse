import { query } from '@/lib/db';
import { route, json, requireUser } from '@/lib/http';

export const dynamic = 'force-dynamic';

// GET /api/stats - admin dashboard (views, GROUP BY, HAVING, subqueries, aggregates)
export const GET = route(async () => {
  await requireUser(['ADMIN']);

  const [kpis, departments, hotspots, categories, trend, wards, staff] = await Promise.all([
    query(`
      SELECT COUNT(*)                                                                  AS total,
             COUNT(*) FILTER (WHERE status IN ('OPEN','ASSIGNED','IN_PROGRESS'))       AS pending,
             COUNT(*) FILTER (WHERE status = 'OPEN')                                   AS unassigned,
             COUNT(*) FILTER (WHERE is_overdue AND status IN ('OPEN','ASSIGNED','IN_PROGRESS')) AS overdue,
             COUNT(*) FILTER (WHERE status IN ('RESOLVED','CLOSED'))                   AS resolved,
             ROUND((AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0)
                    FILTER (WHERE resolved_at IS NOT NULL))::NUMERIC, 1)               AS avg_resolution_hours,
             (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM feedback)                     AS avg_rating,
             COUNT(*) FILTER (WHERE NOT has_embedding)                                 AS missing_embeddings
        FROM v_complaint_details`),
    query('SELECT * FROM v_department_performance ORDER BY total_complaints DESC, dept_name'),
    query(`
      SELECT w.ward_id, w.name AS ward_name, COUNT(*) AS pending
        FROM complaints c
        JOIN wards w ON w.ward_id = c.ward_id
       WHERE c.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
       GROUP BY w.ward_id, w.name
      HAVING COUNT(*) >= (
               SELECT AVG(cnt) FROM (
                 SELECT COUNT(*) AS cnt FROM complaints
                  WHERE status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
                  GROUP BY ward_id) per_ward)
       ORDER BY pending DESC, ward_name`),
    query(`
      SELECT cat.name AS category_name, COUNT(c.complaint_id) AS total
        FROM categories cat
        LEFT JOIN complaints c ON c.category_id = cat.category_id
       GROUP BY cat.category_id, cat.name
      HAVING COUNT(c.complaint_id) > 0
       ORDER BY total DESC, category_name
       LIMIT 8`),
    query(`
      SELECT to_char(d, 'YYYY-MM-DD') AS day, COUNT(c.complaint_id) AS total
        FROM generate_series(current_date - 13, current_date, INTERVAL '1 day') AS d
        LEFT JOIN complaints c ON c.created_at::DATE = d::DATE
       GROUP BY d
       ORDER BY d`),
    query('SELECT * FROM v_ward_summary ORDER BY pending DESC, total_complaints DESC, ward_name'),
    query('SELECT * FROM v_staff_workload ORDER BY active_count DESC, name LIMIT 8'),
  ]);

  return json({
    kpis: kpis.rows[0],
    departments: departments.rows,
    hotspots: hotspots.rows,
    categories: categories.rows,
    trend: trend.rows,
    wards: wards.rows,
    staff: staff.rows,
  });
});

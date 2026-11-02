-- =====================================================================
-- CivicPulse  -  File 05 : Important queries (for the demo / report)
-- Run any block in psql or pgAdmin. Blocks that change data are wrapped
-- in BEGIN ... ROLLBACK so the database is left unchanged.
-- =====================================================================

-- Q1. JOIN : full complaint list with category, department, ward, citizen and assigned staff
SELECT c.complaint_id, c.title, cat.name AS category, d.name AS department,
       w.name AS ward, u.name AS citizen, su.name AS assigned_staff, c.status, c.priority
FROM complaints c
JOIN categories cat     ON cat.category_id = c.category_id
JOIN departments d      ON d.dept_id = cat.dept_id
JOIN wards w            ON w.ward_id = c.ward_id
JOIN users u            ON u.user_id = c.citizen_id
LEFT JOIN assignments a ON a.complaint_id = c.complaint_id AND a.unassigned_at IS NULL
LEFT JOIN users su      ON su.user_id = a.staff_id
ORDER BY c.created_at DESC;

-- Q2. VIEW + derived attribute : overdue complaints, most overdue first
SELECT complaint_id, title, ward_name, dept_name, status, sla_due_at,
       ROUND((EXTRACT(EPOCH FROM (now() - sla_due_at)) / 3600)::NUMERIC, 1) AS hours_overdue
FROM v_complaint_details
WHERE is_overdue AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
ORDER BY sla_due_at;

-- Q3. GROUP BY + aggregate + ORDER BY : complaints per category
SELECT cat.name AS category, COUNT(c.complaint_id) AS complaints,
       COUNT(c.complaint_id) FILTER (WHERE c.status IN ('RESOLVED','CLOSED')) AS resolved
FROM categories cat
LEFT JOIN complaints c ON c.category_id = cat.category_id
GROUP BY cat.name
ORDER BY complaints DESC, category;

-- Q4. GROUP BY + HAVING + subquery : "hotspot" wards whose pending count
--     is at least the average pending count per ward
SELECT w.name AS ward, COUNT(*) AS pending
FROM complaints c
JOIN wards w ON w.ward_id = c.ward_id
WHERE c.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
GROUP BY w.ward_id, w.name
HAVING COUNT(*) >= (
    SELECT AVG(cnt) FROM (
        SELECT COUNT(*) AS cnt
        FROM complaints
        WHERE status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
        GROUP BY ward_id
    ) per_ward
)
ORDER BY pending DESC;

-- Q5. Correlated subquery : staff whose average rating is above the overall average
SELECT u.name, sp.designation,
       (SELECT ROUND(AVG(f.rating)::NUMERIC, 2)
          FROM assignments a
          JOIN feedback f ON f.complaint_id = a.complaint_id
         WHERE a.staff_id = sp.staff_id AND a.unassigned_at IS NULL) AS avg_rating
FROM staff_profile sp
JOIN users u ON u.user_id = sp.staff_id
WHERE (SELECT AVG(f.rating)
         FROM assignments a
         JOIN feedback f ON f.complaint_id = a.complaint_id
        WHERE a.staff_id = sp.staff_id AND a.unassigned_at IS NULL)
      >= (SELECT AVG(rating) FROM feedback)
ORDER BY avg_rating DESC;

-- Q6. Department SLA performance (view)
SELECT * FROM v_department_performance ORDER BY total_complaints DESC;

-- Q7. Staff workload (view) - who should get the next complaint?
SELECT name, dept_name, is_available, active_count, resolved_count, avg_rating
FROM v_staff_workload
ORDER BY dept_name, active_count;

-- Q8. Full-text search (uses GIN index idx_complaints_fts)
SELECT complaint_id, title,
       ts_rank(to_tsvector('english', title || ' ' || description), q) AS rank
FROM complaints, websearch_to_tsquery('english', 'pothole accident') AS q
WHERE to_tsvector('english', title || ' ' || description) @@ q
ORDER BY rank DESC;

-- Q9. Vector similarity search: complaints most similar to complaint #1
--     (needs embeddings: run  npm run db:embed  first)
SELECT s.*
FROM complaints c,
     LATERAL fn_find_similar_complaints(c.embedding, 5, c.complaint_id, 0.0) s
WHERE c.complaint_id = 1;

-- Q10. Status timeline of one complaint (weak entity status_history)
SELECT h.changed_at, h.old_status, h.new_status, h.note
FROM status_history h
WHERE h.complaint_id = 1
ORDER BY h.changed_at, h.history_id;

-- Q11. Daily complaint trend for the last 14 days (generate_series + LEFT JOIN)
SELECT d::DATE AS day, COUNT(c.complaint_id) AS complaints
FROM generate_series(current_date - 13, current_date, INTERVAL '1 day') AS d
LEFT JOIN complaints c ON c.created_at::DATE = d::DATE
GROUP BY d
ORDER BY d;

-- Q12. EXPLAIN : show that the indexes are used
EXPLAIN SELECT * FROM complaints WHERE status = 'OPEN';
EXPLAIN SELECT complaint_id FROM complaints
 WHERE to_tsvector('english', title || ' ' || description) @@ websearch_to_tsquery('english', 'drain');

-- ---------------------------------------------------------------------
-- DML and DDL demonstrations (rolled back)
-- ---------------------------------------------------------------------

-- D1. TRANSACTION + STORED PROCEDURE: assign complaint, then progress it
BEGIN;
DO $$
DECLARE
    v_complaint INT;
    v_staff     INT;
BEGIN
    SELECT c.complaint_id INTO v_complaint
      FROM complaints c
      JOIN categories cat ON cat.category_id = c.category_id
      JOIN departments d  ON d.dept_id = cat.dept_id
     WHERE c.status = 'OPEN' AND d.name = 'Roads and Infrastructure'
     LIMIT 1;
    SELECT user_id INTO v_staff FROM users WHERE email = 'meena.shetty@civicpulse.in';
    CALL assign_complaint(v_complaint, v_staff, 'Assigned during demo');
    RAISE NOTICE 'Complaint % assigned to staff %', v_complaint, v_staff;
END
$$;
SELECT * FROM v_complaint_details WHERE status = 'ASSIGNED' ORDER BY complaint_id;
ROLLBACK;
-- From psql you can also call it directly with literal ids, e.g.
--   CALL assign_complaint(17, 3, 'Assigned during demo');

-- D2. Auto assignment function (least-loaded available staff)
BEGIN;
    SELECT fn_auto_assign(complaint_id) AS chosen_staff_id
    FROM complaints WHERE status = 'OPEN' AND title LIKE 'Pothole near school%';
    SELECT * FROM status_history ORDER BY history_id DESC LIMIT 3;
ROLLBACK;

-- D3. UPDATE + trigger: status change is logged automatically with a note
BEGIN;
    SELECT set_config('civicpulse.status_note', 'Crew dispatched (demo)', true);
    UPDATE complaints SET status = 'IN_PROGRESS'
     WHERE status = 'ASSIGNED' AND title LIKE 'Garbage pile%';
    SELECT * FROM status_history ORDER BY history_id DESC LIMIT 1;
ROLLBACK;

-- D4. DELETE with ON DELETE CASCADE (history, assignments, feedback go too)
BEGIN;
    DELETE FROM complaints WHERE title LIKE 'Stop sign%';
    SELECT COUNT(*) AS remaining_history_rows FROM status_history
     WHERE complaint_id NOT IN (SELECT complaint_id FROM complaints);
ROLLBACK;

-- D5. ALTER / DROP demonstration
BEGIN;
    ALTER TABLE wards ADD COLUMN population INT CHECK (population > 0);
    UPDATE wards SET population = 120000 WHERE name = 'Koramangala';
    SELECT name, population FROM wards WHERE population IS NOT NULL;
    ALTER TABLE wards DROP COLUMN population;
    CREATE TABLE tmp_demo (id INT PRIMARY KEY);
    DROP TABLE tmp_demo;
ROLLBACK;

-- D6. SLA escalation function
BEGIN;
    SELECT fn_escalate_overdue() AS complaints_escalated;
ROLLBACK;

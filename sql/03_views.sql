-- =====================================================================
-- CivicPulse  -  File 03 : Views
-- =====================================================================

-- ---------------------------------------------------------------------
-- v_complaint_details : one row per complaint with everything the UI needs.
-- Computes the DERIVED attribute sla_due_at and the overdue flag.
-- (The embedding column is intentionally not exposed.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_complaint_details AS
SELECT
    c.complaint_id,
    c.title,
    c.description,
    c.status,
    c.priority,
    c.location_text,
    c.latitude,
    c.longitude,
    c.created_at,
    c.resolved_at,
    c.citizen_id,
    u.name                 AS citizen_name,
    c.category_id,
    cat.name               AS category_name,
    cat.default_sla_hours,
    cat.dept_id,
    d.name                 AS dept_name,
    c.ward_id,
    w.name                 AS ward_name,
    c.created_at + cat.default_sla_hours * INTERVAL '1 hour' AS sla_due_at,
    CASE
        WHEN c.status IN ('RESOLVED', 'CLOSED')
            THEN c.resolved_at > c.created_at + cat.default_sla_hours * INTERVAL '1 hour'
        WHEN c.status = 'REJECTED'
            THEN FALSE
        ELSE now() > c.created_at + cat.default_sla_hours * INTERVAL '1 hour'
    END                    AS is_overdue,
    a.staff_id             AS assigned_staff_id,
    su.name                AS assigned_staff_name,
    (c.embedding IS NOT NULL) AS has_embedding
FROM complaints c
JOIN users u            ON u.user_id = c.citizen_id
JOIN categories cat     ON cat.category_id = c.category_id
JOIN departments d      ON d.dept_id = cat.dept_id
JOIN wards w            ON w.ward_id = c.ward_id
LEFT JOIN assignments a ON a.complaint_id = c.complaint_id AND a.unassigned_at IS NULL
LEFT JOIN users su      ON su.user_id = a.staff_id;

-- ---------------------------------------------------------------------
-- v_department_performance : SLA compliance and resolution time per department
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_department_performance AS
SELECT
    d.dept_id,
    d.name AS dept_name,
    COUNT(v.complaint_id)                                                          AS total_complaints,
    COUNT(v.complaint_id) FILTER (WHERE v.status IN ('OPEN','ASSIGNED','IN_PROGRESS')) AS pending,
    COUNT(v.complaint_id) FILTER (WHERE v.status IN ('RESOLVED','CLOSED'))        AS resolved,
    COUNT(v.complaint_id) FILTER (WHERE v.is_overdue)                             AS overdue,
    ROUND((AVG(EXTRACT(EPOCH FROM (v.resolved_at - v.created_at)) / 3600.0)
           FILTER (WHERE v.resolved_at IS NOT NULL))::NUMERIC, 1)                 AS avg_resolution_hours,
    ROUND((100.0 * COUNT(v.complaint_id) FILTER (WHERE v.status IN ('RESOLVED','CLOSED') AND NOT v.is_overdue)
           / NULLIF(COUNT(v.complaint_id) FILTER (WHERE v.status IN ('RESOLVED','CLOSED')), 0))::NUMERIC, 1)
                                                                                  AS sla_compliance_pct
FROM departments d
LEFT JOIN v_complaint_details v ON v.dept_id = d.dept_id
GROUP BY d.dept_id, d.name;

-- ---------------------------------------------------------------------
-- v_staff_workload : active load, resolved count and average rating per staff
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_staff_workload AS
SELECT
    sp.staff_id,
    u.name,
    u.email,
    sp.designation,
    sp.is_available,
    sp.dept_id,
    d.name AS dept_name,
    COUNT(c.complaint_id) FILTER (WHERE c.status IN ('ASSIGNED','IN_PROGRESS')) AS active_count,
    COUNT(c.complaint_id) FILTER (WHERE c.status IN ('RESOLVED','CLOSED'))      AS resolved_count,
    ROUND(AVG(f.rating)::NUMERIC, 2)                                            AS avg_rating
FROM staff_profile sp
JOIN users u            ON u.user_id = sp.staff_id
JOIN departments d      ON d.dept_id = sp.dept_id
LEFT JOIN assignments a ON a.staff_id = sp.staff_id AND a.unassigned_at IS NULL
LEFT JOIN complaints c  ON c.complaint_id = a.complaint_id
LEFT JOIN feedback f    ON f.complaint_id = c.complaint_id
GROUP BY sp.staff_id, u.name, u.email, sp.designation, sp.is_available, sp.dept_id, d.name;

-- ---------------------------------------------------------------------
-- v_ward_summary : complaint counts and satisfaction per ward
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ward_summary AS
SELECT
    w.ward_id,
    w.name AS ward_name,
    w.pincode,
    COUNT(c.complaint_id)                                                          AS total_complaints,
    COUNT(c.complaint_id) FILTER (WHERE c.status IN ('OPEN','ASSIGNED','IN_PROGRESS')) AS pending,
    COUNT(c.complaint_id) FILTER (WHERE c.status IN ('RESOLVED','CLOSED'))        AS resolved,
    ROUND(AVG(f.rating)::NUMERIC, 2)                                              AS avg_rating
FROM wards w
LEFT JOIN complaints c ON c.ward_id = w.ward_id
LEFT JOIN feedback f   ON f.complaint_id = c.complaint_id
GROUP BY w.ward_id, w.name, w.pincode;

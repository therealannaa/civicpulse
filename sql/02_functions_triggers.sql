-- =====================================================================
-- CivicPulse  -  File 02 : Stored functions, procedures and triggers
-- Demonstrates: PL/pgSQL functions, a stored PROCEDURE, BEFORE/AFTER
-- triggers, transaction-scoped session settings, row locking.
-- =====================================================================

DROP FUNCTION  IF EXISTS fn_is_valid_transition(VARCHAR, VARCHAR) CASCADE;
DROP FUNCTION  IF EXISTS fn_auto_assign(INT) CASCADE;
DROP FUNCTION  IF EXISTS fn_find_similar_complaints(VECTOR, INT, INT, DOUBLE PRECISION) CASCADE;
DROP FUNCTION  IF EXISTS fn_escalate_overdue() CASCADE;
DROP PROCEDURE IF EXISTS assign_complaint(INT, INT, TEXT) CASCADE;

-- ---------------------------------------------------------------------
-- 1. Status workflow (the complaint lifecycle state machine)
--
--   OPEN --> ASSIGNED --> IN_PROGRESS --> RESOLVED --> CLOSED
--     |          |             |              |
--     v          v             v              v
--  REJECTED   OPEN/REJECTED   OPEN        IN_PROGRESS (re-opened)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_is_valid_transition(p_old VARCHAR, p_new VARCHAR)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_old = p_new            THEN TRUE
        WHEN p_old = 'OPEN'           THEN p_new IN ('ASSIGNED', 'REJECTED')
        WHEN p_old = 'ASSIGNED'       THEN p_new IN ('IN_PROGRESS', 'OPEN', 'REJECTED')
        WHEN p_old = 'IN_PROGRESS'    THEN p_new IN ('RESOLVED', 'OPEN')
        WHEN p_old = 'RESOLVED'       THEN p_new IN ('CLOSED', 'IN_PROGRESS')
        ELSE FALSE                    -- CLOSED and REJECTED are final
    END;
$$;

-- ---------------------------------------------------------------------
-- 2. BEFORE INSERT on complaints: every complaint starts as OPEN
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_complaints_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status <> 'OPEN' THEN
        RAISE EXCEPTION 'A new complaint must start with status OPEN (got %)', NEW.status
            USING ERRCODE = 'check_violation';
    END IF;
    NEW.title         := trim(NEW.title);
    NEW.description   := trim(NEW.description);
    NEW.location_text := trim(NEW.location_text);
    NEW.resolved_at   := NULL;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_complaints_before_insert
    BEFORE INSERT ON complaints
    FOR EACH ROW EXECUTE FUNCTION trg_complaints_before_insert();

-- ---------------------------------------------------------------------
-- 3. BEFORE UPDATE on complaints:
--    * rejects invalid status transitions
--    * ASSIGNED / IN_PROGRESS require an active staff assignment
--    * maintains resolved_at automatically
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_complaints_before_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NOT fn_is_valid_transition(OLD.status, NEW.status) THEN
            RAISE EXCEPTION 'Invalid status change from % to %', OLD.status, NEW.status
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.status IN ('ASSIGNED', 'IN_PROGRESS') AND NOT EXISTS (
            SELECT 1 FROM assignments a
             WHERE a.complaint_id = NEW.complaint_id
               AND a.unassigned_at IS NULL
        ) THEN
            RAISE EXCEPTION 'Complaint % has no active staff assignment, so it cannot be %',
                NEW.complaint_id, NEW.status
                USING ERRCODE = 'check_violation';
        END IF;

        IF NEW.status = 'RESOLVED' THEN
            NEW.resolved_at := now();
        ELSIF NEW.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REJECTED') THEN
            NEW.resolved_at := NULL;
        END IF;
        -- CLOSED keeps the resolved_at it received when it was RESOLVED
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_complaints_before_update
    BEFORE UPDATE ON complaints
    FOR EACH ROW EXECUTE FUNCTION trg_complaints_before_update();

-- ---------------------------------------------------------------------
-- 4. AFTER INSERT / UPDATE OF status on complaints:
--    writes the audit trail into status_history automatically.
--    The application passes a human note through the transaction-local
--    setting  civicpulse.status_note  (set_config(..., true)).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_complaints_log_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_note TEXT := NULLIF(current_setting('civicpulse.status_note', true), '');
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO status_history (complaint_id, old_status, new_status, note, changed_at)
        VALUES (NEW.complaint_id, NULL, NEW.status,
                COALESCE(v_note, 'Complaint registered by citizen'), NEW.created_at);
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO status_history (complaint_id, old_status, new_status, note)
        VALUES (NEW.complaint_id, OLD.status, NEW.status, COALESCE(v_note, 'Status updated'));

        -- Back to the pool or rejected: release the active staff assignment
        IF NEW.status IN ('OPEN', 'REJECTED') THEN
            UPDATE assignments
               SET unassigned_at = now()
             WHERE complaint_id = NEW.complaint_id
               AND unassigned_at IS NULL;
        END IF;
    END IF;
    RETURN NULL;   -- AFTER trigger: return value ignored
END;
$$;

CREATE TRIGGER trg_complaints_after_insert
    AFTER INSERT ON complaints
    FOR EACH ROW EXECUTE FUNCTION trg_complaints_log_status();

CREATE TRIGGER trg_complaints_after_status
    AFTER UPDATE OF status ON complaints
    FOR EACH ROW EXECUTE FUNCTION trg_complaints_log_status();

-- ---------------------------------------------------------------------
-- 5. BEFORE INSERT/UPDATE on staff_profile: only STAFF users get a profile
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_staff_profile_role_check()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE user_id = NEW.staff_id AND role = 'STAFF') THEN
        RAISE EXCEPTION 'User % must have role STAFF to have a staff profile', NEW.staff_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_staff_profile_role_check
    BEFORE INSERT OR UPDATE OF staff_id ON staff_profile
    FOR EACH ROW EXECUTE FUNCTION trg_staff_profile_role_check();

-- ---------------------------------------------------------------------
-- 6. BEFORE INSERT on assignments: staff must belong to the department
--    responsible for the complaint's category
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_assignments_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_complaint_dept INT;
    v_staff_dept     INT;
BEGIN
    SELECT cat.dept_id INTO v_complaint_dept
      FROM complaints c
      JOIN categories cat ON cat.category_id = c.category_id
     WHERE c.complaint_id = NEW.complaint_id;

    SELECT dept_id INTO v_staff_dept
      FROM staff_profile
     WHERE staff_id = NEW.staff_id;

    IF v_complaint_dept IS DISTINCT FROM v_staff_dept THEN
        RAISE EXCEPTION 'Staff % does not belong to the department responsible for complaint %',
            NEW.staff_id, NEW.complaint_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assignments_validate
    BEFORE INSERT OR UPDATE OF complaint_id, staff_id ON assignments
    FOR EACH ROW EXECUTE FUNCTION trg_assignments_validate();

-- ---------------------------------------------------------------------
-- 7. Feedback triggers
--    BEFORE INSERT : only the filing citizen, only after resolution
--    AFTER  INSERT : feedback automatically CLOSES the complaint
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_feedback_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_status  VARCHAR(12);
    v_citizen INT;
BEGIN
    SELECT status, citizen_id INTO v_status, v_citizen
      FROM complaints
     WHERE complaint_id = NEW.complaint_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Complaint % does not exist', NEW.complaint_id
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_citizen <> NEW.user_id THEN
        RAISE EXCEPTION 'Only the citizen who filed complaint % can give feedback on it', NEW.complaint_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_status NOT IN ('RESOLVED', 'CLOSED') THEN
        RAISE EXCEPTION 'Feedback is allowed only after the complaint is resolved (current status: %)', v_status
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_feedback_validate
    BEFORE INSERT ON feedback
    FOR EACH ROW EXECUTE FUNCTION trg_feedback_validate();

CREATE OR REPLACE FUNCTION trg_feedback_close_complaint()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM set_config('civicpulse.status_note',
                       format('Closed after citizen feedback (rating %s/5)', NEW.rating), true);
    UPDATE complaints
       SET status = 'CLOSED'
     WHERE complaint_id = NEW.complaint_id
       AND status = 'RESOLVED';
    PERFORM set_config('civicpulse.status_note', '', true);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_feedback_close_complaint
    AFTER INSERT ON feedback
    FOR EACH ROW EXECUTE FUNCTION trg_feedback_close_complaint();

-- ---------------------------------------------------------------------
-- 8. STORED PROCEDURE assign_complaint
--    All steps run inside the caller's transaction, so they succeed or
--    fail together:  lock complaint -> validate staff -> close old
--    assignment -> create new assignment -> move status to ASSIGNED.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE assign_complaint(p_complaint_id INT, p_staff_id INT, p_note TEXT DEFAULT NULL)
LANGUAGE plpgsql
AS $$
DECLARE
    v_status     VARCHAR(12);
    v_current    INT;
    v_available  BOOLEAN;
    v_staff_name VARCHAR(100);
BEGIN
    -- Row lock: two admins cannot assign the same complaint at the same time
    SELECT status INTO v_status
      FROM complaints
     WHERE complaint_id = p_complaint_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Complaint % not found', p_complaint_id;
    END IF;
    IF v_status NOT IN ('OPEN', 'ASSIGNED') THEN
        RAISE EXCEPTION 'Only OPEN or ASSIGNED complaints can be assigned; complaint % is %',
            p_complaint_id, v_status;
    END IF;

    SELECT sp.is_available, u.name INTO v_available, v_staff_name
      FROM staff_profile sp
      JOIN users u ON u.user_id = sp.staff_id
     WHERE sp.staff_id = p_staff_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Staff member % not found', p_staff_id;
    END IF;
    IF NOT v_available THEN
        RAISE EXCEPTION '% is marked unavailable and cannot take new complaints', v_staff_name;
    END IF;

    SELECT staff_id INTO v_current
      FROM assignments
     WHERE complaint_id = p_complaint_id
       AND unassigned_at IS NULL;

    IF v_current = p_staff_id THEN
        RAISE EXCEPTION 'Complaint % is already assigned to %', p_complaint_id, v_staff_name;
    END IF;

    -- Close the current assignment (if any)
    UPDATE assignments
       SET unassigned_at = now()
     WHERE complaint_id = p_complaint_id
       AND unassigned_at IS NULL;

    -- New assignment (re-activate if this staff handled it before)
    INSERT INTO assignments (complaint_id, staff_id, assigned_at, unassigned_at)
    VALUES (p_complaint_id, p_staff_id, now(), NULL)
    ON CONFLICT (complaint_id, staff_id)
    DO UPDATE SET assigned_at = EXCLUDED.assigned_at, unassigned_at = NULL;

    IF v_status = 'OPEN' THEN
        PERFORM set_config('civicpulse.status_note',
                           COALESCE(NULLIF(trim(p_note), ''), format('Assigned to %s', v_staff_name)), true);
        UPDATE complaints SET status = 'ASSIGNED' WHERE complaint_id = p_complaint_id;
        PERFORM set_config('civicpulse.status_note', '', true);
    ELSE
        -- Re-assignment: the status stays ASSIGNED, record it in the history explicitly
        INSERT INTO status_history (complaint_id, old_status, new_status, note)
        VALUES (p_complaint_id, 'ASSIGNED', 'ASSIGNED',
                COALESCE(NULLIF(trim(p_note), ''), format('Reassigned to %s', v_staff_name)));
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 9. FUNCTION fn_auto_assign : pick the available staff member of the
--    responsible department with the fewest active complaints, then
--    call the procedure above. Returns the chosen staff_id.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auto_assign(p_complaint_id INT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_staff INT;
BEGIN
    SELECT sp.staff_id INTO v_staff
      FROM complaints c
      JOIN categories cat     ON cat.category_id = c.category_id
      JOIN staff_profile sp   ON sp.dept_id = cat.dept_id AND sp.is_available
      LEFT JOIN assignments a ON a.staff_id = sp.staff_id AND a.unassigned_at IS NULL
      LEFT JOIN complaints ac ON ac.complaint_id = a.complaint_id
                             AND ac.status IN ('ASSIGNED', 'IN_PROGRESS')
     WHERE c.complaint_id = p_complaint_id
       AND sp.staff_id IS DISTINCT FROM (
             SELECT x.staff_id FROM assignments x
              WHERE x.complaint_id = p_complaint_id AND x.unassigned_at IS NULL)
     GROUP BY sp.staff_id
     ORDER BY COUNT(ac.complaint_id) ASC, sp.staff_id ASC
     LIMIT 1;

    IF v_staff IS NULL THEN
        RAISE EXCEPTION 'No available staff in the responsible department for complaint %', p_complaint_id;
    END IF;

    CALL assign_complaint(p_complaint_id, v_staff, NULL);
    RETURN v_staff;
END;
$$;

-- ---------------------------------------------------------------------
-- 10. FUNCTION fn_find_similar_complaints : vector similarity search
--     Cosine distance operator <=> (pgvector); similarity = 1 - distance
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_find_similar_complaints(
    p_embedding      VECTOR,
    p_limit          INT              DEFAULT 5,
    p_exclude_id     INT              DEFAULT NULL,
    p_min_similarity DOUBLE PRECISION DEFAULT 0.5
)
RETURNS TABLE (
    complaint_id  INT,
    title         VARCHAR,
    status        VARCHAR,
    ward_name     VARCHAR,
    category_name VARCHAR,
    location_text VARCHAR,
    created_at    TIMESTAMPTZ,
    similarity    DOUBLE PRECISION
)
LANGUAGE sql STABLE
AS $$
    SELECT c.complaint_id,
           c.title,
           c.status,
           w.name,
           cat.name,
           c.location_text,
           c.created_at,
           (1 - (c.embedding <=> p_embedding))::DOUBLE PRECISION
      FROM complaints c
      JOIN wards w        ON w.ward_id = c.ward_id
      JOIN categories cat ON cat.category_id = c.category_id
     WHERE c.embedding IS NOT NULL
       AND (p_exclude_id IS NULL OR c.complaint_id <> p_exclude_id)
       AND 1 - (c.embedding <=> p_embedding) >= p_min_similarity
     ORDER BY c.embedding <=> p_embedding
     LIMIT p_limit;
$$;

-- ---------------------------------------------------------------------
-- 11. FUNCTION fn_escalate_overdue : raise priority of every pending
--     complaint that has crossed its SLA. Returns rows updated.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_escalate_overdue()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE complaints c
       SET priority = CASE c.priority
                          WHEN 'LOW'    THEN 'MEDIUM'
                          WHEN 'MEDIUM' THEN 'HIGH'
                          ELSE 'CRITICAL'
                      END
      FROM categories cat
     WHERE cat.category_id = c.category_id
       AND c.status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
       AND c.priority <> 'CRITICAL'
       AND now() > c.created_at + cat.default_sla_hours * INTERVAL '1 hour';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------
-- 12. BEFORE INSERT on complaint_images: at most 3 photos per complaint,
--     and no new photos once the complaint is CLOSED or REJECTED.
--     The complaint row is locked so two uploads at the same moment
--     cannot both slip past the limit.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_images_validate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_status VARCHAR(12);
    v_count  INT;
BEGIN
    SELECT status INTO v_status
      FROM complaints
     WHERE complaint_id = NEW.complaint_id
       FOR UPDATE;

    IF v_status IN ('CLOSED', 'REJECTED') THEN
        RAISE EXCEPTION 'Photos cannot be added to a % complaint', v_status
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT COUNT(*) INTO v_count FROM complaint_images WHERE complaint_id = NEW.complaint_id;
    IF v_count >= 3 THEN
        RAISE EXCEPTION 'A complaint can have at most 3 photos (complaint % already has %)', NEW.complaint_id, v_count
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_images_validate
    BEFORE INSERT ON complaint_images
    FOR EACH ROW EXECUTE FUNCTION trg_images_validate();

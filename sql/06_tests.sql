-- =====================================================================
-- CivicPulse  -  File 06 : Database test cases
-- Run with:  npm run db:test      (or: psql -d civicpulse -f sql/06_tests.sql)
-- Each test prints  PASS | Txx | ...   or   FAIL | Txx | ...
-- Everything runs inside one transaction that is ROLLED BACK at the end,
-- so the tests never change your data.
-- =====================================================================
BEGIN;

-- T01 Invalid pincode is rejected by CHECK constraint
DO $$ BEGIN
    BEGIN
        INSERT INTO wards (name, city, pincode) VALUES ('Test Ward', 'Bengaluru', '05600');
        RAISE NOTICE 'FAIL | T01 | invalid pincode was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T01 | invalid pincode rejected (%)', SQLERRM;
    END;
END $$;

-- T02 Invalid email format is rejected
DO $$ BEGIN
    BEGIN
        INSERT INTO users (name, email, password_hash) VALUES ('Bad Email', 'not-an-email', repeat('x', 60));
        RAISE NOTICE 'FAIL | T02 | invalid email was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T02 | invalid email rejected (%)', SQLERRM;
    END;
END $$;

-- T03 Duplicate email with different letter case is rejected (unique expression index)
DO $$ BEGIN
    BEGIN
        INSERT INTO users (name, email, password_hash) VALUES ('Copy Cat', 'PRIYA@Example.com', repeat('x', 60));
        RAISE NOTICE 'FAIL | T03 | duplicate email was accepted';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS | T03 | case-insensitive duplicate email rejected (%)', SQLERRM;
    END;
END $$;

-- T04 Invalid phone number is rejected
DO $$
DECLARE v_user INT;
BEGIN
    SELECT user_id INTO v_user FROM users WHERE email = 'priya@example.com';
    BEGIN
        INSERT INTO user_phone (user_id, phone) VALUES (v_user, '12345');
        RAISE NOTICE 'FAIL | T04 | invalid phone was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T04 | invalid phone rejected (%)', SQLERRM;
    END;
END $$;

-- T05 Complaint with a too-short title is rejected
DO $$
DECLARE v_user INT; v_cat INT; v_ward INT;
BEGIN
    SELECT user_id INTO v_user FROM users WHERE email = 'priya@example.com';
    SELECT category_id INTO v_cat FROM categories WHERE name = 'Pothole';
    SELECT ward_id INTO v_ward FROM wards WHERE name = 'Koramangala';
    BEGIN
        INSERT INTO complaints (title, description, location_text, citizen_id, category_id, ward_id)
        VALUES ('Hole', 'There is a hole in the road here.', 'Some road', v_user, v_cat, v_ward);
        RAISE NOTICE 'FAIL | T05 | short title was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T05 | short title rejected (%)', SQLERRM;
    END;
END $$;

-- T06 Latitude without longitude is rejected
DO $$
DECLARE v_user INT; v_cat INT; v_ward INT;
BEGIN
    SELECT user_id INTO v_user FROM users WHERE email = 'priya@example.com';
    SELECT category_id INTO v_cat FROM categories WHERE name = 'Pothole';
    SELECT ward_id INTO v_ward FROM wards WHERE name = 'Koramangala';
    BEGIN
        INSERT INTO complaints (title, description, location_text, latitude, citizen_id, category_id, ward_id)
        VALUES ('Pothole test entry', 'There is a pothole in the road here.', 'Some road', 12.9, v_user, v_cat, v_ward);
        RAISE NOTICE 'FAIL | T06 | latitude without longitude was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T06 | incomplete coordinates rejected (%)', SQLERRM;
    END;
END $$;

-- T07 A new complaint automatically gets its first status_history row (trigger)
DO $$
DECLARE v_user INT; v_cat INT; v_ward INT; v_id INT; v_hist INT;
BEGIN
    SELECT user_id INTO v_user FROM users WHERE email = 'priya@example.com';
    SELECT category_id INTO v_cat FROM categories WHERE name = 'Pothole';
    SELECT ward_id INTO v_ward FROM wards WHERE name = 'Koramangala';
    INSERT INTO complaints (title, description, location_text, citizen_id, category_id, ward_id)
    VALUES ('Test pothole for trigger', 'Testing that history is written automatically.', 'Test road', v_user, v_cat, v_ward)
    RETURNING complaint_id INTO v_id;
    SELECT COUNT(*) INTO v_hist FROM status_history WHERE complaint_id = v_id AND new_status = 'OPEN';
    IF v_hist = 1 THEN
        RAISE NOTICE 'PASS | T07 | insert trigger logged OPEN in status_history';
    ELSE
        RAISE NOTICE 'FAIL | T07 | expected 1 history row, found %', v_hist;
    END IF;
END $$;

-- T08 A complaint cannot be created directly as RESOLVED
DO $$
DECLARE v_user INT; v_cat INT; v_ward INT;
BEGIN
    SELECT user_id INTO v_user FROM users WHERE email = 'priya@example.com';
    SELECT category_id INTO v_cat FROM categories WHERE name = 'Pothole';
    SELECT ward_id INTO v_ward FROM wards WHERE name = 'Koramangala';
    BEGIN
        INSERT INTO complaints (title, description, status, location_text, citizen_id, category_id, ward_id)
        VALUES ('Sneaky resolved complaint', 'Trying to skip the workflow entirely.', 'RESOLVED', 'Test road', v_user, v_cat, v_ward);
        RAISE NOTICE 'FAIL | T08 | complaint created as RESOLVED';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T08 | non-OPEN initial status rejected (%)', SQLERRM;
    END;
END $$;

-- T09 Invalid status transition OPEN -> RESOLVED is rejected
DO $$
DECLARE v_id INT;
BEGIN
    SELECT complaint_id INTO v_id FROM complaints WHERE title = 'Test pothole for trigger';
    BEGIN
        UPDATE complaints SET status = 'RESOLVED' WHERE complaint_id = v_id;
        RAISE NOTICE 'FAIL | T09 | OPEN -> RESOLVED was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T09 | invalid transition rejected (%)', SQLERRM;
    END;
END $$;

-- T10 ASSIGNED without an assignment row is rejected
DO $$
DECLARE v_id INT;
BEGIN
    SELECT complaint_id INTO v_id FROM complaints WHERE title = 'Test pothole for trigger';
    BEGIN
        UPDATE complaints SET status = 'ASSIGNED' WHERE complaint_id = v_id;
        RAISE NOTICE 'FAIL | T10 | ASSIGNED without staff was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T10 | ASSIGNED requires an active assignment (%)', SQLERRM;
    END;
END $$;

-- T11 Staff from the wrong department cannot be assigned
DO $$
DECLARE v_id INT; v_staff INT;
BEGIN
    SELECT complaint_id INTO v_id FROM complaints WHERE title = 'Test pothole for trigger';
    SELECT user_id INTO v_staff FROM users WHERE email = 'farhan.ali@civicpulse.in';   -- waste dept
    BEGIN
        CALL assign_complaint(v_id, v_staff, NULL);
        RAISE NOTICE 'FAIL | T11 | wrong-department staff was assigned';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T11 | wrong department rejected (%)', SQLERRM;
    END;
END $$;

-- T12 Unavailable staff cannot be assigned
DO $$
DECLARE v_id INT; v_staff INT;
BEGIN
    SELECT complaint_id INTO v_id FROM complaints WHERE title = 'Traffic signal stuck on red';
    SELECT user_id INTO v_staff FROM users WHERE email = 'divya.nair@civicpulse.in';   -- unavailable
    BEGIN
        CALL assign_complaint(v_id, v_staff, NULL);
        RAISE NOTICE 'FAIL | T12 | unavailable staff was assigned';
    EXCEPTION WHEN raise_exception THEN
        RAISE NOTICE 'PASS | T12 | unavailable staff rejected (%)', SQLERRM;
    END;
END $$;

-- T13 Procedure assign_complaint: assignment row + ASSIGNED status + history note
DO $$
DECLARE v_id INT; v_staff INT; v_status VARCHAR; v_active INT; v_note TEXT;
BEGIN
    SELECT complaint_id INTO v_id FROM complaints WHERE title = 'Test pothole for trigger';
    SELECT user_id INTO v_staff FROM users WHERE email = 'meena.shetty@civicpulse.in';
    CALL assign_complaint(v_id, v_staff, 'Assigned by test');
    SELECT status INTO v_status FROM complaints WHERE complaint_id = v_id;
    SELECT COUNT(*) INTO v_active FROM assignments WHERE complaint_id = v_id AND unassigned_at IS NULL;
    SELECT note INTO v_note FROM status_history WHERE complaint_id = v_id ORDER BY history_id DESC LIMIT 1;
    IF v_status = 'ASSIGNED' AND v_active = 1 AND v_note = 'Assigned by test' THEN
        RAISE NOTICE 'PASS | T13 | procedure assigned complaint and logged the note';
    ELSE
        RAISE NOTICE 'FAIL | T13 | status=%, active=%, note=%', v_status, v_active, v_note;
    END IF;
END $$;

-- T14 Re-assignment closes the previous assignment (only one active)
DO $$
DECLARE v_id INT; v_staff INT; v_active INT; v_total INT;
BEGIN
    SELECT complaint_id INTO v_id FROM complaints WHERE title = 'Test pothole for trigger';
    SELECT user_id INTO v_staff FROM users WHERE email = 'ravi.kumar@civicpulse.in';
    CALL assign_complaint(v_id, v_staff, NULL);
    SELECT COUNT(*) FILTER (WHERE unassigned_at IS NULL), COUNT(*)
      INTO v_active, v_total
      FROM assignments WHERE complaint_id = v_id;
    IF v_active = 1 AND v_total = 2 THEN
        RAISE NOTICE 'PASS | T14 | reassignment kept exactly one active assignment';
    ELSE
        RAISE NOTICE 'FAIL | T14 | active=%, total=%', v_active, v_total;
    END IF;
END $$;

-- T15 Feedback before resolution is rejected
DO $$
DECLARE v_id INT; v_user INT;
BEGIN
    SELECT complaint_id, citizen_id INTO v_id, v_user FROM complaints WHERE title = 'Test pothole for trigger';
    BEGIN
        INSERT INTO feedback (complaint_id, user_id, rating) VALUES (v_id, v_user, 4);
        RAISE NOTICE 'FAIL | T15 | feedback accepted on an unresolved complaint';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T15 | feedback before resolution rejected (%)', SQLERRM;
    END;
END $$;

-- T16 Feedback from a different citizen is rejected
DO $$
DECLARE v_id INT; v_other INT;
BEGIN
    SELECT complaint_id INTO v_id FROM complaints WHERE title = 'Broken footpath slabs near bus stop';
    SELECT user_id INTO v_other FROM users WHERE email = 'priya@example.com';   -- complaint is Arjun's
    BEGIN
        INSERT INTO feedback (complaint_id, user_id, rating) VALUES (v_id, v_other, 5);
        RAISE NOTICE 'FAIL | T16 | feedback by another user accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T16 | feedback by another user rejected (%)', SQLERRM;
    END;
END $$;

-- T17 Rating outside 1..5 is rejected
DO $$
DECLARE v_id INT; v_user INT;
BEGIN
    SELECT complaint_id, citizen_id INTO v_id, v_user FROM complaints WHERE title = 'Broken footpath slabs near bus stop';
    BEGIN
        INSERT INTO feedback (complaint_id, user_id, rating) VALUES (v_id, v_user, 6);
        RAISE NOTICE 'FAIL | T17 | rating 6 accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T17 | rating 6 rejected (%)', SQLERRM;
    END;
END $$;

-- T18 Valid feedback on a RESOLVED complaint closes it automatically
DO $$
DECLARE v_id INT; v_user INT; v_status VARCHAR;
BEGIN
    SELECT complaint_id, citizen_id INTO v_id, v_user FROM complaints WHERE title = 'Broken footpath slabs near bus stop';
    INSERT INTO feedback (complaint_id, user_id, rating, comment) VALUES (v_id, v_user, 4, 'Test feedback');
    SELECT status INTO v_status FROM complaints WHERE complaint_id = v_id;
    IF v_status = 'CLOSED' THEN
        RAISE NOTICE 'PASS | T18 | feedback trigger closed the complaint';
    ELSE
        RAISE NOTICE 'FAIL | T18 | status is % instead of CLOSED', v_status;
    END IF;
END $$;

-- T19 A complaint can receive only one feedback (UNIQUE)
DO $$
DECLARE v_id INT; v_user INT;
BEGIN
    SELECT complaint_id, citizen_id INTO v_id, v_user FROM complaints WHERE title = 'Broken footpath slabs near bus stop';
    BEGIN
        INSERT INTO feedback (complaint_id, user_id, rating) VALUES (v_id, v_user, 2);
        RAISE NOTICE 'FAIL | T19 | second feedback accepted';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS | T19 | second feedback rejected (%)', SQLERRM;
    END;
END $$;

-- T20 A CITIZEN cannot be given a staff profile
DO $$
DECLARE v_user INT; v_dept INT;
BEGIN
    SELECT user_id INTO v_user FROM users WHERE email = 'rahul@example.com';
    SELECT dept_id INTO v_dept FROM departments WHERE name = 'Street Lighting';
    BEGIN
        INSERT INTO staff_profile (staff_id, designation, dept_id) VALUES (v_user, 'Helper', v_dept);
        RAISE NOTICE 'FAIL | T20 | citizen got a staff profile';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T20 | staff profile for citizen rejected (%)', SQLERRM;
    END;
END $$;

-- T21 A department that still has categories cannot be deleted (FK RESTRICT)
DO $$ BEGIN
    BEGIN
        DELETE FROM departments WHERE name = 'Roads and Infrastructure';
        RAISE NOTICE 'FAIL | T21 | department in use was deleted';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE 'PASS | T21 | delete of referenced department blocked (%)', SQLERRM;
    END;
END $$;

-- T22 Deleting a complaint cascades to its history, assignments and feedback
DO $$
DECLARE v_id INT; v_left INT;
BEGIN
    SELECT complaint_id INTO v_id FROM complaints WHERE title = 'Deep pothole at Sony World junction';
    DELETE FROM complaints WHERE complaint_id = v_id;
    SELECT (SELECT COUNT(*) FROM status_history WHERE complaint_id = v_id)
         + (SELECT COUNT(*) FROM assignments    WHERE complaint_id = v_id)
         + (SELECT COUNT(*) FROM feedback       WHERE complaint_id = v_id)
      INTO v_left;
    IF v_left = 0 THEN
        RAISE NOTICE 'PASS | T22 | ON DELETE CASCADE removed all dependent rows';
    ELSE
        RAISE NOTICE 'FAIL | T22 | % dependent rows remain', v_left;
    END IF;
END $$;

-- T23 Atomicity: if one step of a registration fails, nothing is saved
DO $$
DECLARE v_count INT;
BEGIN
    BEGIN
        INSERT INTO users (name, email, password_hash) VALUES ('Atomic Test', 'atomic@example.com', repeat('x', 60));
        INSERT INTO user_phone (user_id, phone)
        VALUES ((SELECT user_id FROM users WHERE email = 'atomic@example.com'), '0000000000');  -- invalid
    EXCEPTION WHEN check_violation THEN
        NULL;  -- the whole block (including the user insert) is rolled back
    END;
    SELECT COUNT(*) INTO v_count FROM users WHERE email = 'atomic@example.com';
    IF v_count = 0 THEN
        RAISE NOTICE 'PASS | T23 | failed phone insert rolled back the user insert too';
    ELSE
        RAISE NOTICE 'FAIL | T23 | user was saved despite the failure';
    END IF;
END $$;

-- T24 resolved_at is filled automatically when a complaint is RESOLVED
DO $$
DECLARE v_id INT; v_resolved TIMESTAMPTZ;
BEGIN
    SELECT complaint_id INTO v_id FROM complaints WHERE title = 'Series of potholes on 100 Feet Road';  -- IN_PROGRESS
    UPDATE complaints SET status = 'RESOLVED' WHERE complaint_id = v_id;
    SELECT resolved_at INTO v_resolved FROM complaints WHERE complaint_id = v_id;
    IF v_resolved IS NOT NULL THEN
        RAISE NOTICE 'PASS | T24 | resolved_at set by trigger (%)', v_resolved;
    ELSE
        RAISE NOTICE 'FAIL | T24 | resolved_at is NULL';
    END IF;
END $$;

-- T25 Vector similarity: a complaint is most similar to itself (needs embeddings)
DO $$
DECLARE v_emb VECTOR; v_top INT; v_id INT; v_sim DOUBLE PRECISION;
BEGIN
    SELECT complaint_id, embedding INTO v_id, v_emb
      FROM complaints WHERE embedding IS NOT NULL ORDER BY complaint_id LIMIT 1;
    IF v_emb IS NULL THEN
        RAISE NOTICE 'SKIP | T25 | no embeddings yet - run: npm run db:embed';
    ELSE
        SELECT s.complaint_id, s.similarity INTO v_top, v_sim
          FROM fn_find_similar_complaints(v_emb, 1, NULL, 0.0) s;
        IF v_top = v_id AND v_sim > 0.99 THEN
            RAISE NOTICE 'PASS | T25 | nearest neighbour of complaint % is itself (similarity %)', v_id, round(v_sim::NUMERIC, 4);
        ELSE
            RAISE NOTICE 'FAIL | T25 | nearest neighbour was % (similarity %)', v_top, v_sim;
        END IF;
    END IF;
END $$;

-- T26 A complaint can have at most 3 photos (trigger trg_images_validate)
DO $$
DECLARE v_id INT; v_user INT;
BEGIN
    SELECT complaint_id, citizen_id INTO v_id, v_user FROM complaints WHERE title = 'Pothole near school entrance';
    FOR i IN 1..3 LOOP
        INSERT INTO complaint_images (file_name, mime_type, size_bytes, data, complaint_id, uploaded_by)
        VALUES ('photo' || i || '.jpg', 'image/jpeg', 4, decode('ffd8ffe0', 'hex'), v_id, v_user);
    END LOOP;
    BEGIN
        INSERT INTO complaint_images (file_name, mime_type, size_bytes, data, complaint_id, uploaded_by)
        VALUES ('photo4.jpg', 'image/jpeg', 4, decode('ffd8ffe0', 'hex'), v_id, v_user);
        RAISE NOTICE 'FAIL | T26 | a fourth photo was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T26 | fourth photo rejected (%)', SQLERRM;
    END;
END $$;

-- T27 Only JPEG, PNG and WebP photos are accepted (CHECK chk_images_mime)
DO $$
DECLARE v_id INT; v_user INT;
BEGIN
    SELECT complaint_id, citizen_id INTO v_id, v_user FROM complaints WHERE title = 'Pavement tiles missing outside metro station';
    BEGIN
        INSERT INTO complaint_images (file_name, mime_type, size_bytes, data, complaint_id, uploaded_by)
        VALUES ('anim.gif', 'image/gif', 4, decode('47494638', 'hex'), v_id, v_user);
        RAISE NOTICE 'FAIL | T27 | a GIF was accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T27 | unsupported image type rejected (%)', SQLERRM;
    END;
END $$;

-- T28 No photos can be added to a CLOSED complaint (trigger trg_images_validate)
DO $$
DECLARE v_id INT; v_user INT;
BEGIN
    SELECT complaint_id, citizen_id INTO v_id, v_user FROM complaints WHERE status = 'CLOSED' ORDER BY complaint_id LIMIT 1;
    BEGIN
        INSERT INTO complaint_images (file_name, mime_type, size_bytes, data, complaint_id, uploaded_by)
        VALUES ('late.jpg', 'image/jpeg', 4, decode('ffd8ffe0', 'hex'), v_id, v_user);
        RAISE NOTICE 'FAIL | T28 | photo accepted on a CLOSED complaint';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS | T28 | photo on CLOSED complaint rejected (%)', SQLERRM;
    END;
END $$;

ROLLBACK;

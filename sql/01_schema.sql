-- =====================================================================
-- CivicPulse : Civic infrastructure complaint management system
-- File 01 : Schema (DDL)  -  PostgreSQL 14+ with pgvector
-- Team    : Annamalai N (PES1UG24CS068), Anshul Poovaiah K (PES1UG24CS071)
--
-- Demonstrates: CREATE, DROP, ALTER, primary keys, foreign keys,
-- CHECK / UNIQUE / NOT NULL / DEFAULT constraints and indexes
-- (B-tree, partial unique, expression, GIN full-text, HNSW vector).
-- Table and attribute names match the ER diagram and relational schema.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector: VECTOR type + similarity operators
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- crypt()/gen_salt() used to hash seed passwords

-- ---------------------------------------------------------------------
-- DROP (re-runnable script: CASCADE also removes dependent views/triggers)
-- ---------------------------------------------------------------------
DROP VIEW  IF EXISTS v_ward_summary, v_staff_workload, v_department_performance, v_complaint_details CASCADE;
DROP TABLE IF EXISTS feedback, status_history, assignments, complaints,
                     staff_profile, user_phone, users, categories, departments, wards CASCADE;

-- ---------------------------------------------------------------------
-- WARDS
-- ---------------------------------------------------------------------
CREATE TABLE wards (
    ward_id   SERIAL       PRIMARY KEY,
    name      VARCHAR(100) NOT NULL,
    city      VARCHAR(60)  NOT NULL DEFAULT 'Bengaluru',
    pincode   CHAR(6)      NOT NULL,
    CONSTRAINT uq_wards_name_city UNIQUE (name, city),
    CONSTRAINT chk_wards_name     CHECK (length(trim(name)) >= 2),
    CONSTRAINT chk_wards_pincode  CHECK (pincode ~ '^[1-9][0-9]{5}$')
);

-- ---------------------------------------------------------------------
-- DEPARTMENTS
-- ---------------------------------------------------------------------
CREATE TABLE departments (
    dept_id     SERIAL       PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    CONSTRAINT uq_departments_name  UNIQUE (name),
    CONSTRAINT chk_departments_name CHECK (length(trim(name)) >= 2)
);

-- ---------------------------------------------------------------------
-- CATEGORIES  (N categories BELONG-TO 1 department)
-- ---------------------------------------------------------------------
CREATE TABLE categories (
    category_id       SERIAL       PRIMARY KEY,
    name              VARCHAR(100) NOT NULL,
    default_sla_hours INT          NOT NULL,
    dept_id           INT          NOT NULL,
    CONSTRAINT uq_categories_name UNIQUE (name),
    CONSTRAINT chk_categories_sla CHECK (default_sla_hours BETWEEN 1 AND 720)
);

-- ---------------------------------------------------------------------
-- USERS  (N users LIVE-IN 1 ward)
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id       SERIAL       PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL,
    password_hash TEXT         NOT NULL,
    role          VARCHAR(10)  NOT NULL DEFAULT 'CITIZEN',
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ward_id       INT,
    CONSTRAINT chk_users_name          CHECK (length(trim(name)) >= 2),
    CONSTRAINT chk_users_email         CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_users_role          CHECK (role IN ('CITIZEN', 'STAFF', 'ADMIN')),
    CONSTRAINT chk_users_password_hash CHECK (length(password_hash) >= 20)
);

-- ---------------------------------------------------------------------
-- USER_PHONE  (multivalued attribute "phone" of USERS)
-- ---------------------------------------------------------------------
CREATE TABLE user_phone (
    user_id INT         NOT NULL,
    phone   VARCHAR(10) NOT NULL,
    CONSTRAINT pk_user_phone         PRIMARY KEY (user_id, phone),
    CONSTRAINT chk_user_phone_format CHECK (phone ~ '^[6-9][0-9]{9}$')
);

-- ---------------------------------------------------------------------
-- STAFF_PROFILE  (weak entity identified by USERS through IS;
--                 N staff WORK-IN 1 department)
-- ---------------------------------------------------------------------
CREATE TABLE staff_profile (
    staff_id     INT         PRIMARY KEY,
    designation  VARCHAR(80) NOT NULL,
    is_available BOOLEAN     NOT NULL DEFAULT TRUE,
    dept_id      INT         NOT NULL,
    CONSTRAINT chk_staff_designation CHECK (length(trim(designation)) >= 2)
);

-- ---------------------------------------------------------------------
-- COMPLAINTS
--   sla_due_at is a DERIVED attribute (dashed oval in the ER diagram).
--   It is computed in the view v_complaint_details as
--   created_at + categories.default_sla_hours and is never stored.
-- ---------------------------------------------------------------------
CREATE TABLE complaints (
    complaint_id  SERIAL       PRIMARY KEY,
    title         VARCHAR(150) NOT NULL,
    description   TEXT         NOT NULL,
    status        VARCHAR(12)  NOT NULL DEFAULT 'OPEN',
    priority      VARCHAR(8)   NOT NULL DEFAULT 'MEDIUM',
    location_text VARCHAR(255) NOT NULL,
    latitude      NUMERIC(9,6),
    longitude     NUMERIC(9,6),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    resolved_at   TIMESTAMPTZ,
    embedding     VECTOR(384),            -- all-MiniLM-L6-v2 sentence embedding
    citizen_id    INT          NOT NULL,  -- FILES
    category_id   INT          NOT NULL,  -- CLASSIFIED_AS
    ward_id       INT          NOT NULL,  -- LOCATED_IN
    CONSTRAINT chk_complaints_title       CHECK (length(trim(title)) BETWEEN 5 AND 150),
    CONSTRAINT chk_complaints_description CHECK (length(trim(description)) BETWEEN 10 AND 2000),
    CONSTRAINT chk_complaints_status      CHECK (status IN ('OPEN','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED','REJECTED')),
    CONSTRAINT chk_complaints_priority    CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    CONSTRAINT chk_complaints_location    CHECK (length(trim(location_text)) >= 3),
    CONSTRAINT chk_complaints_latitude    CHECK (latitude  BETWEEN -90  AND 90),
    CONSTRAINT chk_complaints_longitude   CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT chk_complaints_coords_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CONSTRAINT chk_complaints_resolved_after_created
        CHECK (resolved_at IS NULL OR resolved_at >= created_at),
    CONSTRAINT chk_complaints_resolved_matches_status
        CHECK ((status IN ('RESOLVED','CLOSED')) = (resolved_at IS NOT NULL))
);

-- ---------------------------------------------------------------------
-- ASSIGNMENTS  (M:N relationship HANDLES between COMPLAINTS and STAFF_PROFILE)
-- ---------------------------------------------------------------------
CREATE TABLE assignments (
    complaint_id  INT         NOT NULL,
    staff_id      INT         NOT NULL,
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    unassigned_at TIMESTAMPTZ,
    CONSTRAINT pk_assignments         PRIMARY KEY (complaint_id, staff_id),
    CONSTRAINT chk_assignments_period CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at)
);

-- ---------------------------------------------------------------------
-- STATUS_HISTORY  (weak entity, TRACKS a complaint)
-- ---------------------------------------------------------------------
CREATE TABLE status_history (
    history_id   SERIAL      PRIMARY KEY,
    changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    note         TEXT,
    old_status   VARCHAR(12),
    new_status   VARCHAR(12) NOT NULL,
    complaint_id INT         NOT NULL,
    CONSTRAINT chk_history_old_status CHECK (old_status IS NULL OR old_status IN ('OPEN','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED','REJECTED')),
    CONSTRAINT chk_history_new_status CHECK (new_status IN ('OPEN','ASSIGNED','IN_PROGRESS','RESOLVED','CLOSED','REJECTED'))
);

-- ---------------------------------------------------------------------
-- FEEDBACK  (weak entity: a complaint RECEIVES 1 feedback, a user GIVES N)
-- ---------------------------------------------------------------------
CREATE TABLE feedback (
    feedback_id  SERIAL      PRIMARY KEY,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    rating       SMALLINT    NOT NULL,
    comment      TEXT,
    complaint_id INT         NOT NULL,
    user_id      INT         NOT NULL,
    CONSTRAINT uq_feedback_complaint UNIQUE (complaint_id),
    CONSTRAINT chk_feedback_rating   CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT chk_feedback_comment  CHECK (comment IS NULL OR length(comment) <= 1000)
);

-- ---------------------------------------------------------------------
-- ALTER TABLE : foreign keys are added after every table exists
-- ---------------------------------------------------------------------
ALTER TABLE categories     ADD CONSTRAINT fk_categories_dept       FOREIGN KEY (dept_id)      REFERENCES departments(dept_id)      ON DELETE RESTRICT;
ALTER TABLE users          ADD CONSTRAINT fk_users_ward            FOREIGN KEY (ward_id)      REFERENCES wards(ward_id)            ON DELETE SET NULL;
ALTER TABLE user_phone     ADD CONSTRAINT fk_user_phone_user       FOREIGN KEY (user_id)      REFERENCES users(user_id)            ON DELETE CASCADE;
ALTER TABLE staff_profile  ADD CONSTRAINT fk_staff_user            FOREIGN KEY (staff_id)     REFERENCES users(user_id)            ON DELETE CASCADE;
ALTER TABLE staff_profile  ADD CONSTRAINT fk_staff_dept            FOREIGN KEY (dept_id)      REFERENCES departments(dept_id)      ON DELETE RESTRICT;
ALTER TABLE complaints     ADD CONSTRAINT fk_complaints_citizen    FOREIGN KEY (citizen_id)   REFERENCES users(user_id)            ON DELETE RESTRICT;
ALTER TABLE complaints     ADD CONSTRAINT fk_complaints_category   FOREIGN KEY (category_id)  REFERENCES categories(category_id)   ON DELETE RESTRICT;
ALTER TABLE complaints     ADD CONSTRAINT fk_complaints_ward       FOREIGN KEY (ward_id)      REFERENCES wards(ward_id)            ON DELETE RESTRICT;
ALTER TABLE assignments    ADD CONSTRAINT fk_assignments_complaint FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)  ON DELETE CASCADE;
ALTER TABLE assignments    ADD CONSTRAINT fk_assignments_staff     FOREIGN KEY (staff_id)     REFERENCES staff_profile(staff_id)   ON DELETE RESTRICT;
ALTER TABLE status_history ADD CONSTRAINT fk_history_complaint     FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)  ON DELETE CASCADE;
ALTER TABLE feedback       ADD CONSTRAINT fk_feedback_complaint    FOREIGN KEY (complaint_id) REFERENCES complaints(complaint_id)  ON DELETE CASCADE;
ALTER TABLE feedback       ADD CONSTRAINT fk_feedback_user         FOREIGN KEY (user_id)      REFERENCES users(user_id)            ON DELETE CASCADE;

-- ---------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------
-- Case-insensitive unique email (expression index)
CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email));

-- B-tree indexes for frequent filters and joins
CREATE INDEX idx_complaints_status     ON complaints (status);
CREATE INDEX idx_complaints_ward       ON complaints (ward_id);
CREATE INDEX idx_complaints_category   ON complaints (category_id);
CREATE INDEX idx_complaints_citizen    ON complaints (citizen_id);
CREATE INDEX idx_complaints_created_at ON complaints (created_at DESC);
CREATE INDEX idx_staff_profile_dept    ON staff_profile (dept_id);
CREATE INDEX idx_history_complaint     ON status_history (complaint_id, changed_at);

-- Partial unique index: at most ONE active (not unassigned) staff per complaint
CREATE UNIQUE INDEX uq_assignments_active        ON assignments (complaint_id) WHERE unassigned_at IS NULL;
CREATE INDEX        idx_assignments_staff_active ON assignments (staff_id)     WHERE unassigned_at IS NULL;

-- GIN index for full-text search over title + description
CREATE INDEX idx_complaints_fts ON complaints
    USING GIN (to_tsvector('english', title || ' ' || description));

-- Vector index for cosine similarity search.
-- HNSW needs pgvector >= 0.5.0; older versions fall back to IVFFlat.
DO $$
BEGIN
    EXECUTE 'CREATE INDEX idx_complaints_embedding ON complaints USING hnsw (embedding vector_cosine_ops)';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'HNSW index not available (%). Using IVFFlat instead.', SQLERRM;
    EXECUTE 'CREATE INDEX idx_complaints_embedding ON complaints USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10)';
END
$$;

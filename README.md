# CivicPulse

Civic infrastructure complaint management for Bengaluru wards: potholes, damaged roads, broken footpaths and pavements, garbage, street lights, drains, fallen trees and traffic signals.

Citizens report issues and see whether the same problem was already reported (vector similarity search). Admins assign complaints to staff of the responsible department through a stored procedure. Staff update progress, every status change is logged by a trigger, SLA deadlines are tracked, and citizen feedback closes the complaint.

**Team:** Annamalai N (PES1UG24CS068), Anshul Poovaiah K (PES1UG24CS071)
**Course:** DBMS Experiential Learning, Level 3 Project, PES University

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18 |
| Backend / API | Next.js Route Handlers (`app/api/**`) |
| SQL database | PostgreSQL 14+ |
| Vector database | pgvector extension inside PostgreSQL (`VECTOR(384)`, HNSW index, cosine distance) |
| Embeddings | `Xenova/all-MiniLM-L6-v2` run locally with `@huggingface/transformers` (no API key) |
| Auth | bcrypt password hashes, JWT session in an httpOnly cookie, role checks in middleware and in every API route |

## 1. Prerequisites (on BOTH laptops)

1. **Node.js 18.18 or newer** (20 or 22 LTS recommended). Check with `node -v`.
2. **PostgreSQL 14 or newer**, with the password for the `postgres` user.
3. **pgvector** installed into that PostgreSQL (see below).
4. **Internet once**, for `npm install` and the first model download (about 90 MB). After that the app works offline.

### Install pgvector

Check first. In `psql` or pgAdmin's query tool run:

```sql
SELECT name, default_version FROM pg_available_extensions WHERE name = 'vector';
```

If it returns a row, pgvector is already installed and you can skip this section.

**Windows** (PostgreSQL from the EDB installer). You need "Desktop development with C++" from Visual Studio Build Tools. Open **x64 Native Tools Command Prompt for VS** *as Administrator* and run (change `16` to your PostgreSQL version):

```bat
set "PGROOT=C:\Program Files\PostgreSQL\16"
cd %TEMP%
git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git
cd pgvector
nmake /F Makefile.win
nmake /F Makefile.win install
```

**macOS (Homebrew):** `brew install pgvector`

**Ubuntu / Debian:** `sudo apt install postgresql-16-pgvector` (use your version number)

**Docker alternative** (if a local install is not possible):

```bash
docker run -d --name civicpulse-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 pgvector/pgvector:pg16
```

## 2. Setup

```bash
git clone <your-repo-url> civicpulse
cd civicpulse
npm install
cp .env.example .env.local        # Windows: copy .env.example .env.local
```

Edit `.env.local` and set `PGPASSWORD` to your PostgreSQL password and `JWT_SECRET` to any random string of 32+ characters. This file is git-ignored, so each team member keeps their own.

```bash
npm run db:setup     # creates the database, runs sql/01-04, computes embeddings
npm run db:test      # runs 25 database test cases (all should PASS)
npm run dev          # http://localhost:3000
```

`db:setup` can be re-run at any time to reset the database to the seed data.

## 3. Demo accounts

Every seeded account uses the password **`Password@123`**.

| Role | Email | Notes |
|---|---|---|
| Admin | `admin@civicpulse.in` | Dashboard, all complaints, assignment, staff management |
| Staff | `ravi.kumar@civicpulse.in` | Roads and Infrastructure, has active work |
| Staff | `lakshmi.rao@civicpulse.in` | Water Supply and Drainage |
| Staff | `divya.nair@civicpulse.in` | Traffic, marked **unavailable** (assignment is blocked) |
| Citizen | `priya@example.com` | Several complaints in Koramangala and HSR Layout |
| Citizen | `arjun@example.com` | Has a RESOLVED complaint waiting for feedback |

## 4. Suggested 30-minute demo flow

1. **Design (5 min).** Show the ER diagram and relational schema printouts. Open `sql/01_schema.sql` and point out PKs, FKs (added with `ALTER TABLE`), CHECK constraints, the multivalued `user_phone` table, the M:N `assignments` table, and the derived attribute `sla_due_at` computed in `v_complaint_details`.
2. **Database tests (3 min).** Run `npm run db:test` and show the PASS lines: constraints, triggers, procedure, cascade and atomicity.
3. **Citizen (5 min).** Start registering a new citizen with an invalid phone like `12345` to show the database constraint message, then correct it. Log in as `priya@example.com`, click **Report an issue** and type *"Big pothole near Sony World signal, bikes falling"*. The **Already reported?** panel shows the existing complaint by meaning (vector search). Submit it.
4. **Admin (7 min).** Log in as `admin@civicpulse.in`. Show the dashboard (views, GROUP BY / HAVING hotspot wards). Open the new complaint and **Auto-assign** it (function `fn_auto_assign` calls procedure `assign_complaint`). Open *Traffic signal stuck on red* and click **Auto-assign**: the only Traffic staff member (Divya Nair) is unavailable, so the database refuses with a clear message. Use **Escalate overdue**.
5. **Staff (4 min).** Log in as the assigned staff member, **Start work**, add a note, then **Mark resolved**. Show the status history written by the trigger.
6. **Feedback (2 min).** Log in as the citizen and rate the work: the trigger closes the complaint.
7. **Search (2 min).** As admin, open **Search** and compare *"dangerous for bikes at night"* in Meaning mode versus Keyword mode.
8. **Queries (2 min).** Run blocks from `sql/05_queries.sql` in pgAdmin (JOINs, HAVING, subqueries, EXPLAIN, ALTER/DROP demo).

## 5. Where each requirement is implemented

| Requirement | Where |
|---|---|
| CREATE / ALTER / DROP, PK, FK, constraints, indexes | `sql/01_schema.sql` |
| Triggers, stored procedure, functions | `sql/02_functions_triggers.sql` |
| Views | `sql/03_views.sql` |
| INSERT / UPDATE / DELETE / SELECT | `sql/04_seed.sql`, API routes in `app/api/**` |
| JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries | `sql/05_queries.sql`, `app/api/stats/route.js` |
| Transactions | `lib/db.js` (`withTransaction`), register, staff creation, status change, assignment |
| Full-text search | GIN index `idx_complaints_fts`, `app/api/search/route.js`, admin complaint filter |
| Vector similarity search | `complaints.embedding`, HNSW index, `fn_find_similar_complaints`, `lib/embeddings.js` |
| Database-level validation | CHECK constraints and validation triggers; API errors show the constraint name |
| Auth and roles (Citizen, Staff, Admin) | `lib/auth.js`, `middleware.js`, `requireUser()` in every route |
| Environment variables, no hard-coded credentials | `.env.local` (from `.env.example`), read by `pg` and `lib/auth.js` |
| Test cases | `sql/06_tests.sql` (`npm run db:test`) |

## 6. Project structure

```
app/                  Next.js pages and API route handlers
  api/                REST API: auth, complaints, search, stats, staff, admin
  admin/ staff/ citizen/ complaints/[id]/ search/   role pages
components/           Header, complaint table, badges
lib/                  db pool + transactions, auth (JWT), embeddings, workflow rules
middleware.js         page-level role checks
scripts/              db:setup, db:embed, db:test
sql/                  01 schema, 02 functions/triggers, 03 views, 04 seed, 05 queries, 06 tests
docs/                 project report
```

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| `pgvector is not installed` | Install pgvector (section 1) and run `npm run db:setup` again. |
| `password authentication failed` | Fix `PGUSER` / `PGPASSWORD` in `.env.local`. |
| `ECONNREFUSED 127.0.0.1:5432` | Start the PostgreSQL service (Windows: Services → postgresql-x64-16 → Start). |
| `JWT_SECRET must be set` | Add a 32+ character `JWT_SECRET` to `.env.local` and restart `npm run dev`. |
| Similar-complaint panel says the model is unavailable | Connect to the internet once and run `npm run db:embed`; the model is cached in `.model-cache/`. |
| Port 3000 busy | `npm run dev -- -p 3001` |

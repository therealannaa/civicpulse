# Individual contributions

Marks are awarded individually, so each member owns a clear part of both the database and the application, and commits it from their own GitHub account.

## Annamalai N (PES1UG24CS068): relational core, workflow logic, admin side

Database
- ER to relational mapping, `sql/01_schema.sql`: tables, PKs, FKs (ALTER TABLE), CHECK / UNIQUE constraints, B-tree and partial unique indexes
- `sql/02_functions_triggers.sql`: status-transition function, all triggers, stored procedure `assign_complaint`, `fn_auto_assign`, `fn_escalate_overdue`
- `sql/03_views.sql`: `v_complaint_details` (derived `sla_due_at`), department, staff and ward views
- `sql/06_tests.sql` and `scripts/run-tests.mjs`

Application
- Admin dashboard (`app/admin/page.js`, `app/api/stats/route.js`), admin complaint list, staff management (`app/admin/staff`, `app/api/staff/**`)
- Assignment and status APIs (`app/api/complaints/[id]/assign`, PATCH in `app/api/complaints/[id]/route.js`)

Advanced features owned: **triggers, stored procedures/functions, views, transactions inside the procedure**

## Anshul Poovaiah K (PES1UG24CS071): vector search, full-text search, auth, citizen and staff side

Database
- pgvector: `embedding VECTOR(384)` column, HNSW index, `fn_find_similar_complaints`
- GIN full-text index `idx_complaints_fts`, `sql/05_queries.sql`
- `sql/04_seed.sql`, `scripts/setup-db.mjs`, `scripts/backfill-embeddings.mjs`, `scripts/embedding-core.mjs`

Application
- Embedding pipeline `lib/embeddings.js`, duplicate detection (`app/api/complaints/similar`), search page and API (`app/search`, `app/api/search`)
- Authentication: `lib/auth.js`, `lib/http.js`, `middleware.js`, `app/api/auth/**`, login and register pages (register uses an explicit transaction)
- Citizen pages (`app/citizen/**`), staff page (`app/staff`), complaint detail page

Advanced features owned: **vector similarity search (NoSQL/vector requirement), full-text search, indexing, application-level transactions**

## Shared
- `lib/db.js`, `components/**`, `app/globals.css`, README and `docs/PROJECT_REPORT.md`

## Suggested commit order

Each person clones the repository and commits **their own files from their own account**. Push in roughly this order so every commit builds on the previous one:

| # | Who | Commit message | Files |
|---|---|---|---|
| 1 | Anshul | Project setup: Next.js config, env example, gitignore | `package.json`, `next.config.mjs`, `jsconfig.json`, `.env.example`, `.gitignore` |
| 2 | Annamalai | Relational schema with constraints and indexes | `sql/01_schema.sql` |
| 3 | Annamalai | Triggers, stored procedure and functions | `sql/02_functions_triggers.sql` |
| 4 | Annamalai | Views for complaint details and performance | `sql/03_views.sql` |
| 5 | Anshul | Seed data and database setup scripts | `sql/04_seed.sql`, `scripts/setup-db.mjs` |
| 6 | Anshul | Local embeddings and vector similarity search | `scripts/embedding-core.mjs`, `scripts/backfill-embeddings.mjs`, `lib/embeddings.js` |
| 7 | Annamalai | Database connection pool and transactions | `lib/db.js`, `lib/workflow.js` |
| 8 | Anshul | Authentication, sessions and role middleware | `lib/auth.js`, `lib/http.js`, `middleware.js`, `app/api/auth/**` |
| 9 | Anshul | Layout, styles and shared components | `app/layout.js`, `app/globals.css`, `app/page.js`, `components/**`, `lib/client.js` |
| 10 | Anshul | Login and registration pages | `app/login`, `app/register`, `app/api/meta` |
| 11 | Anshul | Complaint filing with duplicate detection | `app/api/complaints/route.js`, `app/api/complaints/similar`, `app/citizen/**` |
| 12 | Annamalai | Complaint detail, status updates and assignment | `app/api/complaints/[id]/**`, `app/complaints/[id]/page.js` |
| 13 | Annamalai | Admin dashboard and statistics | `app/admin/page.js`, `app/api/stats`, `app/api/admin/**` |
| 14 | Annamalai | Staff management | `app/admin/staff`, `app/api/staff/**`, `app/admin/complaints` |
| 15 | Anshul | Staff work page, availability, search page | `app/staff`, `app/api/me/**`, `app/search`, `app/api/search` |
| 16 | Anshul | Important queries | `sql/05_queries.sql` |
| 17 | Annamalai | Database test cases | `sql/06_tests.sql`, `scripts/run-tests.mjs` |
| 18 | Both | README, report and contributions | `README.md`, `docs/`, `CONTRIBUTIONS.md` |

Before the demo, each member should be able to explain every file listed under their name.

// Creates the database (if needed), runs the SQL files in order and
// computes complaint embeddings.
// Usage: npm run db:setup            (full setup)
//        npm run db:setup -- --no-embed   (skip embeddings)
import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { backfillEmbeddings } from './backfill-embeddings.mjs';

dotenv.config({ path: '.env.local' });

const SQL_FILES = ['01_schema.sql', '02_functions_triggers.sql', '03_views.sql', '04_seed.sql'];
const dbName = process.env.PGDATABASE || 'civicpulse';

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

if (!process.env.PGPASSWORD && !process.env.PGHOST) {
  fail('No database settings found. Copy .env.example to .env.local and fill in your PostgreSQL password.');
}
if (!/^[a-z_][a-z0-9_]*$/i.test(dbName)) {
  fail(`PGDATABASE "${dbName}" must contain only letters, digits and underscores.`);
}

async function ensureDatabase() {
  const admin = new pg.Client({ database: 'postgres' });
  try {
    await admin.connect();
  } catch (err) {
    fail(`Could not connect to PostgreSQL: ${err.message}\nCheck PGHOST, PGPORT, PGUSER and PGPASSWORD in .env.local and that the PostgreSQL service is running.`);
  }
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (rowCount === 0) {
    await admin.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Created database ${dbName}`);
  } else {
    console.log(`Database ${dbName} already exists (tables will be dropped and recreated)`);
  }
  await admin.end();
}

async function runSqlFiles(client) {
  client.on('notice', (n) => console.log(`  NOTICE: ${n.message}`));
  for (const file of SQL_FILES) {
    const sql = fs.readFileSync(path.join(process.cwd(), 'sql', file), 'utf8');
    process.stdout.write(`Running ${file} ... `);
    try {
      await client.query(sql);
      console.log('ok');
    } catch (err) {
      console.log('failed');
      if (/extension "vector"|vector\.control/i.test(err.message)) {
        fail(`pgvector is not installed for this PostgreSQL server.\n${err.message}\nSee "Install pgvector" in README.md.`);
      }
      if (/extension "pgcrypto"|pgcrypto\.control/i.test(err.message)) {
        fail(`The pgcrypto extension is missing (it ships with PostgreSQL contrib).\n${err.message}`);
      }
      fail(`${file}: ${err.message}${err.position ? ` (at character ${err.position})` : ''}`);
    }
  }
}

await ensureDatabase();
const client = new pg.Client();
await client.connect();
try {
  await runSqlFiles(client);
  if (process.argv.includes('--no-embed')) {
    console.log('Skipping embeddings (--no-embed). Run "npm run db:embed" later.');
  } else {
    try {
      await backfillEmbeddings(client);
    } catch (err) {
      console.warn(`\n! Embeddings could not be computed: ${err.message}`);
      console.warn('  The database is ready; run "npm run db:embed" once you have internet access.');
    }
  }
  console.log('\n✔ Database ready. Start the app with: npm run dev');
  console.log('  Logins (password Password@123): admin@civicpulse.in, ravi.kumar@civicpulse.in, priya@example.com');
} finally {
  await client.end();
}

import pg from 'pg';

// BIGINT (COUNT(*)) and NUMERIC come back as strings by default; convert to numbers.
pg.types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

// Connection settings come from environment variables only
// (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE in .env.local).
// One pool is reused across hot reloads in development.
const pool = globalThis.__civicPulsePool ?? new pg.Pool({ max: 10 });
if (!globalThis.__civicPulsePool) globalThis.__civicPulsePool = pool;

export function query(text, params) {
  return pool.query(text, params);
}

// Runs fn(client) inside BEGIN ... COMMIT, rolling back on any error.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors, the original error is more useful
    }
    throw err;
  } finally {
    client.release();
  }
}

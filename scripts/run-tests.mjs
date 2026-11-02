// Runs sql/06_tests.sql and prints a PASS / FAIL summary.
// Usage: npm run db:test
import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config({ path: '.env.local' });

const client = new pg.Client();
const results = [];
client.on('notice', (n) => {
  if (/^(PASS|FAIL|SKIP) \|/.test(n.message)) results.push(n.message);
});

try {
  await client.connect();
  const sql = fs.readFileSync(path.join(process.cwd(), 'sql', '06_tests.sql'), 'utf8');
  await client.query(sql);
} catch (err) {
  console.error('Test run aborted:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

for (const line of results) console.log(line);
const count = (tag) => results.filter((r) => r.startsWith(tag)).length;
console.log(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('SKIP')} skipped`);
if (count('FAIL') > 0) process.exitCode = 1;

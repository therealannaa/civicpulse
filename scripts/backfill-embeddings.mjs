// Computes embeddings for every complaint whose embedding is NULL.
// Usage: npm run db:embed
import dotenv from 'dotenv';
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { complaintText, embed, toVectorLiteral, EMBEDDING_MODEL } from './embedding-core.mjs';

dotenv.config({ path: '.env.local' });

export async function backfillEmbeddings(client) {
  const { rows } = await client.query(
    'SELECT complaint_id, title, description, location_text FROM complaints WHERE embedding IS NULL ORDER BY complaint_id'
  );
  if (rows.length === 0) {
    console.log('All complaints already have embeddings.');
    return 0;
  }
  console.log(`Embedding ${rows.length} complaint(s) with ${EMBEDDING_MODEL}`);
  console.log('(the first run downloads the model, about 90 MB, into .model-cache/)');
  for (const row of rows) {
    const vector = await embed(complaintText(row));
    await client.query('UPDATE complaints SET embedding = $1::vector WHERE complaint_id = $2', [
      toVectorLiteral(vector),
      row.complaint_id,
    ]);
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  console.log(`Stored ${rows.length} embedding(s).`);
  return rows.length;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const client = new pg.Client();
  try {
    await client.connect();
    await backfillEmbeddings(client);
  } catch (err) {
    console.error('Embedding backfill failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

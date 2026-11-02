// Shared embedding helper for the Node scripts.
// Must stay identical in behaviour to lib/embeddings.js (used by the web app).
import path from 'node:path';

export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';   // 384-dimensional sentence embeddings
export const EMBEDDING_DIM = 384;

let extractorPromise = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = path.join(process.cwd(), '.model-cache');
      return pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'fp32' });
    })();
    extractorPromise.catch(() => { extractorPromise = null; });
  }
  return extractorPromise;
}

export function complaintText({ title, description, location_text }) {
  return [title, description, location_text ? `Location: ${location_text}` : '']
    .filter(Boolean)
    .join('. ');
}

export async function embed(text) {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  const vector = Array.from(output.data);
  if (vector.length !== EMBEDDING_DIM) {
    throw new Error(`Expected ${EMBEDDING_DIM} dimensions, got ${vector.length}`);
  }
  return vector;
}

export function toVectorLiteral(vector) {
  return `[${vector.join(',')}]`;
}

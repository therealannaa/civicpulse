// Server-only embedding helper (same model and text format as scripts/embedding-core.mjs).
import path from 'node:path';

export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIM = 384;

function getExtractor() {
  if (!globalThis.__civicPulseExtractor) {
    const promise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = path.join(process.cwd(), '.model-cache');
      return pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'fp32' });
    })();
    promise.catch(() => {
      globalThis.__civicPulseExtractor = null;
    });
    globalThis.__civicPulseExtractor = promise;
  }
  return globalThis.__civicPulseExtractor;
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

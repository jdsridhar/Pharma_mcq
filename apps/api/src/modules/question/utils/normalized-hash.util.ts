import { normalizeQuestionText } from '@pharmacy/contracts';
import { createHash } from 'node:crypto';

/**
 * Deterministic content hash used for exact-duplicate detection. Normalization is shared
 * with the client (`normalizeQuestionText`) so the same text hashes identically anywhere.
 */
export function computeNormalizedTextHash(text: string): string {
  return createHash('sha256').update(normalizeQuestionText(text)).digest('hex');
}

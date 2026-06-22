import { normalizeQuestionText } from '@pharmacy/contracts';
import { computeNormalizedTextHash } from './normalized-hash.util';

describe('normalizeQuestionText / computeNormalizedTextHash', () => {
  it('normalizes case, punctuation and whitespace identically', () => {
    expect(normalizeQuestionText('  What   is Aspirin?? ')).toBe('what is aspirin');
    expect(normalizeQuestionText('What is aspirin')).toBe('what is aspirin');
  });

  it('hashes equivalent text to the same digest', () => {
    const a = computeNormalizedTextHash('What is ASPIRIN?');
    const b = computeNormalizedTextHash('what   is aspirin');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('hashes different text to different digests', () => {
    expect(computeNormalizedTextHash('What is aspirin?')).not.toBe(
      computeNormalizedTextHash('What is paracetamol?'),
    );
  });
});

import { computePeriodEnd } from './period';

const START = new Date('2026-01-15T00:00:00.000Z');

describe('computePeriodEnd', () => {
  it('adds one month for MONTHLY', () => {
    expect(computePeriodEnd(START, 'MONTHLY')?.toISOString()).toBe('2026-02-15T00:00:00.000Z');
  });

  it('adds three months for QUARTERLY', () => {
    expect(computePeriodEnd(START, 'QUARTERLY')?.toISOString()).toBe('2026-04-15T00:00:00.000Z');
  });

  it('adds one year for YEARLY', () => {
    expect(computePeriodEnd(START, 'YEARLY')?.toISOString()).toBe('2027-01-15T00:00:00.000Z');
  });

  it('returns null for LIFETIME', () => {
    expect(computePeriodEnd(START, 'LIFETIME')).toBeNull();
  });
});

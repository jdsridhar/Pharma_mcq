import { parseDurationToSeconds } from './duration.util';

describe('parseDurationToSeconds', () => {
  it.each([
    ['15m', 900],
    ['30d', 2_592_000],
    ['12h', 43_200],
    ['1w', 604_800],
    ['45s', 45],
    ['3600', 3600],
  ])('parses %s -> %d seconds', (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected);
  });

  it('throws on an invalid duration', () => {
    expect(() => parseDurationToSeconds('soon')).toThrow();
    expect(() => parseDurationToSeconds('10y')).toThrow();
  });
});

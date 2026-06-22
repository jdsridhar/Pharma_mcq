/**
 * Parse a short duration string (`"15m"`, `"30d"`, `"3600s"`, `"12h"`) — or a plain
 * number of seconds — into seconds. Used to align JWT TTLs with cookie max-age.
 */
const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
  w: 60 * 60 * 24 * 7,
};

export function parseDurationToSeconds(input: string): number {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const match = /^(\d+)\s*([smhdw])$/i.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid duration string: "${input}"`);
  }
  const value = Number(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  const unitSeconds = UNIT_SECONDS[unit];
  if (unitSeconds === undefined) {
    throw new Error(`Invalid duration string: "${input}"`);
  }
  return value * unitSeconds;
}

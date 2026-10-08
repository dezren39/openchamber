/**
 * How long a target is likely to stay out of rotation, from its own cooldown
 * history in OpenCode's `route_health` table. Samples are grouped by weekday and
 * hour; the estimate uses the chosen percentile of the closest group that has
 * enough samples, and never less than an ordinary cooldown.
 */

const DAY = 86_400_000;
export const ORDINARY_COOLDOWN_MS = 60_000;
const LOOKBACK_MS = 30 * DAY;
const MAX_ROWS = 2_000;

const nearHour = (a, b) => {
  const gap = Math.abs(a - b);
  return Math.min(gap, 24 - gap) <= 1;
};

const percentileOf = (values, percentile) => {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
};

/** The cooldown started in OpenCode's history for this target, with its end time when recorded. */
export const cooldownHistory = (db, { providerID, modelID, now }) =>
  db
    .prepare(
      `select time, until from route_health
        where provider_id = ? and model_id = ? and kind = 'cooldown-start' and until is not null and time >= ?
        order by time desc limit ?`,
    )
    .all(providerID, modelID, now - LOOKBACK_MS, MAX_ROWS);

export const estimateWait = (
  rows,
  { now, percentile = 25, minSamples = 5, floorMs = ORDINARY_COOLDOWN_MS } = {},
) => {
  const active = rows.find((row) => row.until > now) ?? null;
  const samples = rows
    .map((row) => ({ duration: row.until - row.time, when: new Date(row.time) }))
    .filter((sample) => sample.duration > 0);
  const here = new Date(now);
  const hour = here.getHours();
  const tiers = [
    ['weekday-hour', (sample) => sample.when.getDay() === here.getDay() && nearHour(sample.when.getHours(), hour)],
    ['hour', (sample) => nearHour(sample.when.getHours(), hour)],
    ['all', () => true],
  ];
  for (const [basis, matches] of tiers) {
    const picked = samples.filter(matches);
    if (picked.length >= minSamples) {
      return {
        active: active ? { until: active.until, remainingMs: active.until - now } : null,
        expectedMs: Math.max(floorMs, percentileOf(picked.map((sample) => sample.duration), percentile)),
        basis,
        samples: picked.length,
      };
    }
  }
  return {
    active: active ? { until: active.until, remainingMs: active.until - now } : null,
    expectedMs: null,
    basis: 'none',
    samples: samples.length,
  };
};

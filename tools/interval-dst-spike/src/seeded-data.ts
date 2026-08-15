import type { HalfOpenInterval, IntervalIndexEntry } from "./interval-index";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface SeededEvent {
  readonly id: number;
  readonly start: number;
  readonly end: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b_79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function seededEvents(count: number, seed = 0x16d57): readonly SeededEvent[] {
  const random = mulberry32(seed);
  const span = 365 * DAY_MS;
  const events: SeededEvent[] = [];

  for (let id = 0; id < count; id += 1) {
    const start = Math.floor((random() * span) / (5 * MINUTE_MS)) * 5 * MINUTE_MS;
    const durationMinutes = 15 + Math.floor(random() * 48) * 15;
    const end = start + durationMinutes * MINUTE_MS;
    events.push({ id, start, end });
  }

  return events;
}

export function indexEntries(
  events: readonly SeededEvent[],
): readonly IntervalIndexEntry<number>[] {
  return events.map((event) => ({
    interval: { start: event.start, end: event.end },
    value: event.id,
  }));
}

export function seededQueries(
  count: number,
  durationDays: number,
  seed = 0x16a11,
): readonly HalfOpenInterval[] {
  const random = mulberry32(seed + durationDays);
  const duration = durationDays * DAY_MS;
  const latestStart = 365 * DAY_MS - duration;
  const queries: HalfOpenInterval[] = [];

  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((random() * latestStart) / MINUTE_MS) * MINUTE_MS;
    queries.push({ start, end: start + duration });
  }

  return queries;
}

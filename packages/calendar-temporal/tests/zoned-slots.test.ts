import fc from "fast-check";
import { describe, expect, test } from "vite-plus/test";

import { slotsInZonedDay } from "../src/index";
import { NativeTemporal } from "./native-temporal";

const MINUTE_NANOSECONDS = 60_000_000_000n;

function totalPhysicalMinutes(result: ReturnType<typeof slotsInZonedDay>): number {
  return Number(result.physicalDurationNanoseconds / MINUTE_NANOSECONDS);
}

function totalNominalSlotMinutes(result: ReturnType<typeof slotsInZonedDay>): number {
  const nanoseconds = result.slots.reduce(
    (total, slot) => total + slot.physicalDurationNanoseconds,
    0n,
  );
  return Number(nanoseconds / MINUTE_NANOSECONDS);
}

describe("zoned wall-clock slots", () => {
  test("keeps ordinary wall grids adjacent, bounded, and physically complete", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.constantFrom(5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 360, 720),
        (year, month, slotMinutes) => {
          const date = NativeTemporal.PlainDate.from({ day: 15, month, year });
          const result = slotsInZonedDay(date, {
            disambiguation: "compatible",
            slotDuration: { minutes: slotMinutes },
            timeZone: "UTC",
          });

          expect(result.slots).toHaveLength(1_440 / slotMinutes);
          expect(totalPhysicalMinutes(result)).toBe(1_440);
          expect(new Set(result.slots.map((slot) => slot.key)).size).toBe(result.slots.length);
          expect(result.slots.every((slot) => slot.kind === "unique")).toBe(true);

          for (let index = 1; index < result.slots.length; index += 1) {
            expect(
              result.slots[index - 1]!.wallRange.end.equals(result.slots[index]!.wallRange.start),
            ).toBe(true);
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  test("marks spring gaps unavailable while preserving the physical day", () => {
    const result = slotsInZonedDay(NativeTemporal.PlainDate.from("2026-03-08"), {
      disambiguation: "compatible",
      slotDuration: { minutes: 30 },
      timeZone: "America/New_York",
    });
    const gaps = result.slots.filter((slot) => slot.kind === "gap");

    expect(result.slots).toHaveLength(48);
    expect(gaps.map((slot) => slot.wallRange.start.toString())).toEqual([
      "2026-03-08T02:00:00",
      "2026-03-08T02:30:00",
    ]);
    expect(gaps.every((slot) => slot.segments[0]!.occurrences.length === 0)).toBe(true);
    expect(gaps[0]!.segments[0]!.projection).toMatchObject({
      kind: "gap",
      selectedBy: "later",
      status: "resolved",
    });
    expect(
      gaps[0]!.segments[0]!.projection.status === "resolved" &&
        gaps[0]!.segments[0]!.projection.adjustment?.resolvedWallTime.toString(),
    ).toBe("2026-03-08T03:00:00");
    expect(totalPhysicalMinutes(result)).toBe(23 * 60);
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0]).toMatchObject({
      kind: "gap",
      offsetAfter: "-04:00",
      offsetBefore: "-05:00",
    });
  });

  test("emits two occurrence intervals and machine keys for fall folds", () => {
    const result = slotsInZonedDay(NativeTemporal.PlainDate.from("2026-11-01"), {
      disambiguation: "compatible",
      slotDuration: { minutes: 30 },
      timeZone: "America/New_York",
    });
    const folds = result.slots.filter((slot) => slot.kind === "fold");

    expect(folds.map((slot) => slot.wallRange.start.toString())).toEqual([
      "2026-11-01T01:00:00",
      "2026-11-01T01:30:00",
    ]);
    expect(folds.every((slot) => slot.segments[0]!.occurrences.length === 2)).toBe(true);
    for (const slot of folds) {
      const occurrences = slot.segments[0]!.occurrences;
      expect(occurrences[0]!.key).not.toBe(occurrences[1]!.key);
      expect(occurrences[0]!.interval.end.equals(occurrences[1]!.interval.start)).toBe(false);
    }
    expect(totalPhysicalMinutes(result)).toBe(25 * 60);
  });

  test("splits a configured slot when a half-hour transition falls inside it", () => {
    const result = slotsInZonedDay(NativeTemporal.PlainDate.from("2026-10-04"), {
      disambiguation: "compatible",
      slotDuration: { minutes: 45 },
      timeZone: "Australia/Lord_Howe",
    });
    const transitionSlot = result.slots.find(
      (slot) => slot.wallRange.start.toString() === "2026-10-04T01:30:00",
    );

    expect(transitionSlot?.kind).toBe("transition");
    expect(transitionSlot?.segments.map((segment) => segment.kind)).toEqual(["unique", "gap"]);
    expect(transitionSlot?.segments.map((segment) => segment.wallRange.end.toString())).toEqual([
      "2026-10-04T02:00:00",
      "2026-10-04T02:15:00",
    ]);
    expect(result.transitions[0]?.affectedWallRange.start.toString()).toBe("2026-10-04T02:00:00");
    expect(result.transitions[0]?.affectedWallRange.end.toString()).toBe("2026-10-04T02:30:00");
    expect(totalPhysicalMinutes(result)).toBe(23 * 60 + 30);
  });

  test("covers midnight transitions, unusual offsets, and date-line changes", () => {
    const santiago = slotsInZonedDay(NativeTemporal.PlainDate.from("2026-09-06"), {
      disambiguation: "reject",
      slotDuration: { minutes: 30 },
      timeZone: "America/Santiago",
    });
    expect(santiago.slots.slice(0, 2).map((slot) => slot.kind)).toEqual(["gap", "gap"]);
    expect(santiago.slots[0]!.segments[0]!.projection.status).toBe("rejected");
    expect(totalPhysicalMinutes(santiago)).toBe(23 * 60);

    const kathmandu = slotsInZonedDay(NativeTemporal.PlainDate.from("2026-01-15"), {
      disambiguation: "compatible",
      slotDuration: { hours: 1 },
      timeZone: "Asia/Kathmandu",
    });
    expect(kathmandu.slots.every((slot) => slot.kind === "unique")).toBe(true);
    expect(kathmandu.slots[0]!.segments[0]!.projection.occurrences[0]!.offset).toBe("+05:45");

    const apia = slotsInZonedDay(NativeTemporal.PlainDate.from("2011-12-30"), {
      disambiguation: "compatible",
      slotDuration: { hours: 1 },
      timeZone: "Pacific/Apia",
    });
    expect(apia.day.kind).toBe("skipped");
    expect(apia.slots).toHaveLength(24);
    expect(apia.slots.every((slot) => slot.kind === "gap")).toBe(true);
    expect(totalPhysicalMinutes(apia)).toBe(0);
  });

  test("allocates cross-midnight fold occurrences to actual day intervals", () => {
    const options = {
      disambiguation: "compatible" as const,
      slotDuration: { hours: 1 },
      timeZone: "Antarctica/Casey",
    };
    const march4 = slotsInZonedDay(NativeTemporal.PlainDate.from("2010-03-04"), options);
    const march5 = slotsInZonedDay(NativeTemporal.PlainDate.from("2010-03-05"), options);
    const march4Fold = march4.slots.find(
      (slot) => slot.wallRange.start.toString() === "2010-03-04T23:00:00",
    );
    const march5Folds = march5.slots.filter(
      (slot) => slot.kind === "fold" && slot.wallRange.start.hour < 2,
    );

    expect(march4.transitions).toHaveLength(1);
    expect(march5.transitions).toHaveLength(1);
    expect(march4Fold?.kind).toBe("fold");
    expect(march4Fold?.segments[0]!.projection.occurrences).toHaveLength(2);
    expect(march4Fold?.segments[0]!.occurrences).toHaveLength(1);
    expect(march5Folds).toHaveLength(2);
    expect(march5Folds.every((slot) => slot.segments[0]!.occurrences.length === 2)).toBe(true);
    expect(march4.carryoverOccurrences).toEqual([]);
    expect(march5.carryoverOccurrences).toHaveLength(1);
    expect(march5.carryoverOccurrences[0]!.start.wallTime.toString()).toBe("2010-03-04T23:00:00");
    expect(
      Number(
        (march5.carryoverOccurrences[0]!.interval.end.epochNanoseconds -
          march5.carryoverOccurrences[0]!.interval.start.epochNanoseconds) /
          MINUTE_NANOSECONDS,
      ),
    ).toBe(60);
    expect(totalNominalSlotMinutes(march4)).toBe(24 * 60);
    expect(totalNominalSlotMinutes(march5)).toBe(26 * 60);
    expect(totalNominalSlotMinutes(march5) + 60).toBe(totalPhysicalMinutes(march5));
    expect(totalPhysicalMinutes(march4)).toBe(24 * 60);
    expect(totalPhysicalMinutes(march5)).toBe(27 * 60);
    expect(totalPhysicalMinutes(march4)).toBe(
      Number(march4.day.durationNanoseconds / MINUTE_NANOSECONDS),
    );
    expect(totalPhysicalMinutes(march5)).toBe(
      Number(march5.day.durationNanoseconds / MINUTE_NANOSECONDS),
    );
  });

  test("materializes slots safely at Temporal's minimum instant", () => {
    const result = slotsInZonedDay(NativeTemporal.PlainDate.from("-271821-04-20"), {
      disambiguation: "compatible",
      slotDuration: { hours: 1 },
      timeZone: "UTC",
    });

    expect(result.slots).toHaveLength(24);
    expect(result.transitions).toEqual([]);
    expect(totalPhysicalMinutes(result)).toBe(24 * 60);
  });

  test("rejects calendar durations, zero steps, and accidental oversized grids", () => {
    const date = NativeTemporal.PlainDate.from("2026-01-15");
    const base = { disambiguation: "compatible" as const, timeZone: "UTC" };

    expect(() => slotsInZonedDay(date, { ...base, slotDuration: { days: 1 } })).toThrow(
      "invalid-zoned-slot-duration",
    );
    expect(() => slotsInZonedDay(date, { ...base, slotDuration: { minutes: 0 } })).toThrow(
      "invalid-zoned-slot-duration",
    );
    expect(() => slotsInZonedDay(date, { ...base, limit: 2, slotDuration: { hours: 1 } })).toThrow(
      "zoned-slot-limit-exceeded",
    );
  });
});

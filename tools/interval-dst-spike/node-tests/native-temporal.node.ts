import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildZonedDayGeometry } from "../src/native-temporal";

interface ExpectedFixture {
  readonly cases: readonly {
    readonly id: string;
    readonly date: string;
    readonly timeZone: string;
    readonly slotMinutes: number;
    readonly physicalMinutes: number;
    readonly kindCounts: Readonly<Record<"unique" | "gap" | "fold", number>>;
    readonly anomalies: readonly unknown[];
  }[];
}

const fixtureUrl = new URL("../artifacts/dst-wall-time-fixtures.json", import.meta.url);

function summarize(
  date: string,
  timeZone: string,
  slotMinutes: number,
): Omit<ExpectedFixture["cases"][number], "id"> {
  const geometry = buildZonedDayGeometry(date, timeZone, slotMinutes);

  return {
    date,
    timeZone,
    slotMinutes,
    physicalMinutes: geometry.physicalMinutes,
    kindCounts: {
      unique: geometry.slots.filter((slot) => slot.kind === "unique").length,
      gap: geometry.slots.filter((slot) => slot.kind === "gap").length,
      fold: geometry.slots.filter((slot) => slot.kind === "fold").length,
    },
    anomalies: geometry.slots.filter((slot) => slot.kind !== "unique"),
  };
}

void test("committed DST data fixtures match native Temporal output", () => {
  const fixture = JSON.parse(readFileSync(fixtureUrl, "utf8")) as ExpectedFixture;

  for (const expected of fixture.cases) {
    assert.deepEqual(
      { id: expected.id, ...summarize(expected.date, expected.timeZone, expected.slotMinutes) },
      expected,
    );
  }
});

void test("spring gaps produce unavailable wall slots", () => {
  const geometry = buildZonedDayGeometry("2026-03-08", "America/New_York", 30);
  const gapSlots = geometry.slots.filter((slot) => slot.kind === "gap");

  assert.deepEqual(
    gapSlots.map((slot) => slot.wallStart),
    ["2026-03-08T02:00", "2026-03-08T02:30"],
  );
  assert.ok(gapSlots.every((slot) => slot.occurrences.length === 0));
  assert.equal(geometry.physicalMinutes, 23 * 60);
});

void test("fall folds preserve two distinct instant identities at one wall coordinate", () => {
  const geometry = buildZonedDayGeometry("2026-11-01", "America/New_York", 30);
  const foldSlots = geometry.slots.filter((slot) => slot.kind === "fold");

  assert.deepEqual(
    foldSlots.map((slot) => slot.wallStart),
    ["2026-11-01T01:00", "2026-11-01T01:30"],
  );
  assert.ok(foldSlots.every((slot) => slot.occurrences.length === 2));
  assert.ok(
    foldSlots.every(
      (slot) => slot.occurrences[0]?.epochNanoseconds !== slot.occurrences[1]?.epochNanoseconds,
    ),
  );
  assert.equal(geometry.physicalMinutes, 25 * 60);
});

void test("non-hour and midnight transitions remain explicit", () => {
  const lordHowe = buildZonedDayGeometry("2026-10-04", "Australia/Lord_Howe", 30);
  const santiago = buildZonedDayGeometry("2026-09-06", "America/Santiago", 30);

  assert.deepEqual(
    lordHowe.slots.filter((slot) => slot.kind === "gap").map((slot) => slot.wallStart),
    ["2026-10-04T02:00"],
  );
  assert.equal(lordHowe.physicalMinutes, 23 * 60 + 30);

  assert.deepEqual(
    santiago.slots.filter((slot) => slot.kind === "gap").map((slot) => slot.wallStart),
    ["2026-09-06T00:00", "2026-09-06T00:30"],
  );
  assert.equal(santiago.physicalMinutes, 23 * 60);
});

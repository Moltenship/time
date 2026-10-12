import { describe, expect, test } from "vite-plus/test";

import { occurrenceId, parseOccurrenceId, recurrenceKey } from "../src";

describe("occurrence identity", () => {
  test("keys each kind of original start by its ISO form, instants in UTC", () => {
    const zoned = Temporal.ZonedDateTime.from("2026-10-28T10:00:00+01:00[Europe/Berlin]");
    expect(recurrenceKey(zoned.toInstant())).toBe("2026-10-28T09:00:00Z");
    expect(recurrenceKey(Temporal.PlainDate.from("2026-10-28"))).toBe("2026-10-28");
    expect(recurrenceKey(Temporal.PlainDateTime.from("2026-10-28T10:00"))).toBe(
      "2026-10-28T10:00:00",
    );
  });

  test("round-trips series IDs, including ones with the separator", () => {
    const start = Temporal.Instant.from("2026-10-28T09:00:00Z");
    expect(occurrenceId("review", start)).toBe("review::2026-10-28T09:00:00Z");
    expect(parseOccurrenceId(occurrenceId("team::review", start))).toEqual({
      recurrenceKey: "2026-10-28T09:00:00Z",
      seriesId: "team::review",
    });
    expect(parseOccurrenceId(occurrenceId(42, Temporal.PlainDate.from("2026-10-28")))).toEqual({
      recurrenceKey: "2026-10-28",
      seriesId: "42",
    });
  });

  test("keys dates in any calendar the same way", () => {
    const gregory = Temporal.PlainDate.from("2026-10-28").withCalendar("gregory");
    expect(recurrenceKey(gregory)).toBe("2026-10-28");
    expect(
      recurrenceKey(Temporal.PlainDateTime.from("2026-10-28T10:00").withCalendar("japanese")),
    ).toBe("2026-10-28T10:00:00");
  });

  test("parses every key form recurrenceKey writes", () => {
    for (const key of [
      "+275760-09-13",
      "2026-10-28T09:00:00.5Z",
      "2026-10-28T10:00:00.000000001",
    ]) {
      expect(parseOccurrenceId(`s::${key}`)).toEqual({ recurrenceKey: key, seriesId: "s" });
    }
  });

  test("finds no recurrence key in one-off IDs", () => {
    expect(parseOccurrenceId("x::2026-13-45")).toBeUndefined();
    expect(parseOccurrenceId("x::2026-10-28T99:99:99Z")).toBeUndefined();
    expect(parseOccurrenceId("x::2026-10-28[u-ca=gregory]")).toBeUndefined();
    expect(parseOccurrenceId("google::abc123")).toBeUndefined();
    expect(parseOccurrenceId("team::2026-10-28T09:00")).toBeUndefined();
    expect(parseOccurrenceId("review")).toBeUndefined();
    expect(parseOccurrenceId(42)).toBeUndefined();
    expect(parseOccurrenceId("::2026-10-28")).toBeUndefined();
    expect(parseOccurrenceId("review::")).toBeUndefined();
  });
});

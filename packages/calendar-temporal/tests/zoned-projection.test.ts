import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import {
  instantKey,
  plainDateKey,
  plainDateTimeKey,
  projectInstantToZonedTime,
  resolveZonedWallTime,
  zonedDayKey,
  zonedWallTimeKey,
  type ZonedWallTimeProjection,
} from "../src/index.ts";
import { NativeTemporal } from "./native-temporal.ts";

describe("zoned wall-time projection", () => {
  test("keeps both instant identities for a repeated wall time", () => {
    const wallTime = NativeTemporal.PlainDateTime.from("2026-11-01T01:30");
    const projection = resolveZonedWallTime(wallTime, {
      disambiguation: "compatible",
      timeZone: "America/New_York",
    });

    expect(projection.kind).toBe("fold");
    expect(projection.status).toBe("resolved");
    expect(projection.selectedBy).toBe("earlier");
    expect(projection.occurrences).toHaveLength(2);
    expect(projection.occurrences.map((item) => item.offset)).toEqual(["-04:00", "-05:00"]);
    expect(new Set(projection.occurrences.map((item) => item.key)).size).toBe(2);
    expect(projection.occurrences[0]!.instant.equals(projection.occurrences[1]!.instant)).toBe(
      false,
    );

    const later = resolveZonedWallTime(wallTime, {
      disambiguation: "later",
      timeZone: "America/New_York",
    });
    expect(later.status === "resolved" && later.selected.key).toBe(projection.occurrences[1]!.key);
  });

  test("makes compatible gap shifts observable and supports rejection", () => {
    const wallTime = NativeTemporal.PlainDateTime.from("2026-03-08T02:15");
    const compatible = resolveZonedWallTime(wallTime, {
      disambiguation: "compatible",
      timeZone: "America/New_York",
    });

    expect(compatible.kind).toBe("gap");
    expect(compatible.occurrences).toEqual([]);
    expect(compatible.status).toBe("resolved");
    if (compatible.status !== "resolved") {
      throw new Error("expected-compatible-gap-resolution");
    }
    expect(compatible.selectedBy).toBe("later");
    expect(compatible.selected.wallTime.toString()).toBe("2026-03-08T03:15:00");
    expect(compatible.adjustment).toMatchObject({ direction: "later" });
    expect(compatible.adjustment?.requestedWallTime.equals(wallTime)).toBe(true);
    expect(compatible.adjustment?.wallTimeDelta.toString()).toBe("PT1H");

    const earlier = resolveZonedWallTime(wallTime, {
      disambiguation: "earlier",
      timeZone: "America/New_York",
    });
    expect(earlier.status === "resolved" && earlier.selected.wallTime.toString()).toBe(
      "2026-03-08T01:15:00",
    );
    expect(earlier.status === "resolved" && earlier.adjustment?.wallTimeDelta.toString()).toBe(
      "-PT1H",
    );

    const rejected = resolveZonedWallTime(wallTime, {
      disambiguation: "reject",
      timeZone: "America/New_York",
    });
    expect(rejected).toMatchObject({
      adjustment: null,
      kind: "gap",
      selected: null,
      selectedBy: null,
      status: "rejected",
    });
  });

  test("projects unusual offsets with explicit metadata", () => {
    const instant = NativeTemporal.Instant.from("2026-01-15T00:00:00Z");
    const projection = projectInstantToZonedTime(instant, "Asia/Kathmandu");

    expect(projection.offset).toBe("+05:45");
    expect(projection.wallTime.toString()).toBe("2026-01-15T05:45:00");
    expect(projection.key).toBe(instantKey(instant));
    expect(projection.wallTimeKey).toContain("time-zone:Asia/Kathmandu");
    expect(Object.isFrozen(projection)).toBe(true);
  });

  test("builds deterministic machine keys without conflating wall and instant identity", () => {
    const date = NativeTemporal.PlainDate.from("2026-11-01");
    const wallTime = NativeTemporal.PlainDateTime.from("2026-11-01T01:30");

    expect(plainDateKey(date)).toBe("date:2026-11-01");
    expect(plainDateTimeKey(wallTime)).toBe("date-time:2026-11-01T01:30:00.000000000");
    expect(zonedDayKey(date, "America/New_York")).toBe(
      "date:2026-11-01|time-zone:America/New_York",
    );
    expect(zonedWallTimeKey(wallTime, "America/New_York")).toContain(
      "date-time:2026-11-01T01:30:00.000000000",
    );

    const fold = resolveZonedWallTime(wallTime, {
      disambiguation: "compatible",
      timeZone: "America/New_York",
    });
    expect(fold.occurrences[0]!.key).not.toBe(fold.occurrences[1]!.key);
    expect(fold.key).toBe(zonedWallTimeKey(wallTime, "America/New_York"));
  });

  test("keeps the public projection signature environment-driven", () => {
    expectTypeOf<
      ReturnType<typeof resolveZonedWallTime>
    >().toEqualTypeOf<ZonedWallTimeProjection>();
  });
});

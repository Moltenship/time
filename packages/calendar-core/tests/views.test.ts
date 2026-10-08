import { plainDateInterval } from "@moltenship/calendar-temporal";
import { describe, expect, test } from "vite-plus/test";

import { resolveViewInstantRange } from "../src/index";

describe("resolveViewInstantRange", () => {
  test("resolves visible dates to the instants between their local starts of day", () => {
    const range = plainDateInterval(
      Temporal.PlainDate.from("2026-08-15"),
      Temporal.PlainDate.from("2026-08-17"),
    );

    const instants = resolveViewInstantRange(range, "Asia/Tbilisi");

    expect(instants.start.toString()).toBe("2026-08-14T20:00:00Z");
    expect(instants.end.toString()).toBe("2026-08-16T20:00:00Z");
  });

  test("starts a day whose midnight is skipped at its first valid instant", () => {
    const range = plainDateInterval(
      Temporal.PlainDate.from("2018-11-04"),
      Temporal.PlainDate.from("2018-11-05"),
    );

    const instants = resolveViewInstantRange(range, "America/Sao_Paulo");

    expect(instants.start.toZonedDateTimeISO("America/Sao_Paulo").toPlainTime().toString()).toBe(
      "01:00:00",
    );
    expect(instants.end.since(instants.start).total("hours")).toBe(23);
  });
});

import { describe, expect, test } from "vite-plus/test";

import { readCalendarLocation, writeCalendarLocation } from "../src/url-state";

const fallback = { date: Temporal.PlainDate.from("2026-10-08"), view: "week" } as const;

describe("calendar location in the URL", () => {
  test("reads the view and date", () => {
    const location = readCalendarLocation("?view=month&date=2026-12-24", fallback);

    expect([location.view, location.date.toString()]).toEqual(["month", "2026-12-24"]);
  });

  test.each([
    ["no parameters", ""],
    ["an unknown view and a bad date", "?view=year&date=24.12.2026"],
  ])("falls back for %s", (_, search) => {
    const location = readCalendarLocation(search, fallback);

    expect([location.view, location.date.toString()]).toEqual(["week", "2026-10-08"]);
  });

  test("writes both parameters and keeps the rest of the URL", () => {
    const href = writeCalendarLocation("https://demo.test/app?debug=1#top", {
      date: Temporal.PlainDate.from("2027-01-02"),
      view: "agenda",
    });

    expect(href).toBe("https://demo.test/app?debug=1&view=agenda&date=2027-01-02#top");
  });
});

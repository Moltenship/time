import { readFileSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import { readSolidLocation, writeSolidLocation, type SolidView } from "../src/url-state";

/**
 * The React demo's view names, read from its source rather than imported: its module brings the
 * React calendar with it, which stays out of this app.
 */
const reactViewNames = [
  ...(readFileSync(new URL("../../demo/src/demo-model.ts", import.meta.url), "utf8")
    .match(/export const demoViewNames = \[([^\]]*)\]/u)?.[1]
    ?.matchAll(/"([^"]+)"/gu) ?? []),
].map((match) => match[1]);

const fallback = { date: Temporal.PlainDate.from("2026-10-08"), view: "month" } as const;

const read = (search: string) => {
  const location = readSolidLocation(search, fallback);
  return [location.view, location.date.toString()];
};

describe("the Solid demo's view and date in the URL", () => {
  test("reads the React demo's parameters", () => {
    expect(read("?view=month&date=2026-12-24")).toEqual(["month", "2026-12-24"]);
    expect(read("?view=agenda&date=2026-12-24")).toEqual(["agenda", "2026-12-24"]);
    expect(read("?view=week&date=2026-12-24")).toEqual(["week", "2026-12-24"]);
    expect(read("?view=day")[0]).toBe("day");
    expect(read("?view=3-day")[0]).toBe("3-day");
    expect(read("?view=year&date=2026-12-24")).toEqual(["year", "2026-12-24"]);
  });

  test.each([
    ["resources", "day"],
    ["timeline-week", "week"],
    ["scrolling-week", "week"],
    ["scrolling-day", "day"],
    ["scrolling-3-day", "3-day"],
    ["scrolling-month", "scrolling-month"],
    ["scrolling-agenda", "scrolling-agenda"],
  ])("shows the nearest view for %s: %s", (view, nearest) => {
    expect(read(`?view=${view}`)[0]).toBe(nearest);
  });

  test("has a view for every view of the React demo", () => {
    expect(reactViewNames).toContain("week");
    // A view without a mapping here shows the fallback, so two fallbacks tell it apart.
    const viewOf = (view: string, fallbackView: SolidView) =>
      readSolidLocation(`?view=${view}`, { ...fallback, view: fallbackView }).view;
    const unmapped = reactViewNames.filter(
      (view) => viewOf(view, "month") !== viewOf(view, "agenda"),
    );

    expect(unmapped).toEqual([]);
  });

  test.each([
    ["no parameters", ""],
    ["an unknown view and a bad date", "?view=decade&date=24.12.2026"],
    ["a date in another calendar", "?date=2026-12-24[u-ca=hebrew]"],
    ["the earliest date Temporal takes", "?date=-271821-04-19"],
    ["the latest date Temporal takes", "?date=%2B275760-09-13"],
    ["a month that doesn't exist", "?date=2026-13-01"],
    ["a name neither demo has", "?view=list"],
    ["a name of Object's prototype", "?view=toString"],
  ])("falls back for %s", (_, search) => {
    expect(read(search)).toEqual(["month", "2026-10-08"]);
  });

  test("writes a view the React demo has and keeps the rest of the URL", () => {
    const href = (view: SolidView) =>
      writeSolidLocation("https://demo.test/solid/?debug=1#top", {
        date: Temporal.PlainDate.from("2027-01-02"),
        view,
      });

    expect(href("agenda")).toBe("https://demo.test/solid/?debug=1&view=agenda&date=2027-01-02#top");
    expect(href("month")).toBe("https://demo.test/solid/?debug=1&view=month&date=2027-01-02#top");
  });

  test("keeps the React demo's view while it maps to the one shown", () => {
    const write = (search: string, view: SolidView) =>
      new URL(
        writeSolidLocation(`https://demo.test/solid/${search}`, {
          date: Temporal.PlainDate.from("2026-10-08"),
          view,
        }),
      ).searchParams.get("view");

    expect(write("?view=scrolling-week", "week")).toBe("scrolling-week");
    expect(write("?view=scrolling-month", "month")).toBe("scrolling-month");
    expect(write("?view=scrolling-week", "month")).toBe("month");
    expect(write("?view=year", "agenda")).toBe("agenda");
  });
});

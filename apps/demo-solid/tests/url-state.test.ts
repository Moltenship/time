import { describe, expect, test } from "vite-plus/test";

import { demoViewNames } from "@demo/demo-model";

import { readSolidLocation, writeSolidLocation } from "../src/url-state";

/** A page with the paged views, the scrolling month and agenda, the resource columns and timeline. */
const views = [
  "week",
  "day",
  "3-day",
  "month",
  "year",
  "agenda",
  "scrolling-month",
  "scrolling-agenda",
  "resources",
  "timeline-week",
];
type View = string;

const fallback = { date: Temporal.PlainDate.from("2026-10-08"), view: "month" } as const;

const read = (search: string, registered: readonly View[] = views) => {
  const location = readSolidLocation<View>(search, fallback, registered);
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
    ["resources", "resources"],
    ["timeline-week", "timeline-week"],
    ["scrolling-week", "week"],
    ["scrolling-day", "day"],
    ["scrolling-3-day", "3-day"],
    ["scrolling-month", "scrolling-month"],
    ["scrolling-agenda", "scrolling-agenda"],
  ])("shows the nearest view for %s: %s", (view, nearest) => {
    expect(read(`?view=${view}`)[0]).toBe(nearest);
  });

  test("shows a view itself once the page registers it", () => {
    expect(read("?view=scrolling-week", [...views, "scrolling-week"])[0]).toBe("scrolling-week");
    expect(read("?view=timeline-week", [...views, "timeline-week"])[0]).toBe("timeline-week");
  });

  test("has a view for every view of the React demo", () => {
    // A view without a mapping here shows the fallback, so two fallbacks tell it apart.
    const viewOf = (view: string, fallbackView: View) =>
      readSolidLocation(`?view=${view}`, { ...fallback, view: fallbackView }, views).view;
    const unmapped = demoViewNames.filter(
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
    const href = (view: View) =>
      writeSolidLocation(
        "https://demo.test/solid/?debug=1#top",
        { date: Temporal.PlainDate.from("2027-01-02"), view },
        views,
      );

    expect(href("agenda")).toBe("https://demo.test/solid/?debug=1&view=agenda&date=2027-01-02#top");
    expect(href("month")).toBe("https://demo.test/solid/?debug=1&view=month&date=2027-01-02#top");
  });

  test("keeps the React demo's view while it maps to the one shown", () => {
    const write = (search: string, view: View) =>
      new URL(
        writeSolidLocation(
          `https://demo.test/solid/${search}`,
          { date: Temporal.PlainDate.from("2026-10-08"), view },
          views,
        ),
      ).searchParams.get("view");

    expect(write("?view=scrolling-week", "week")).toBe("scrolling-week");
    expect(write("?view=scrolling-day", "day")).toBe("scrolling-day");
    expect(write("?view=scrolling-week", "month")).toBe("month");
    expect(write("?view=year", "agenda")).toBe("agenda");
    expect(write("?view=timeline-week", "week")).toBe("week");
  });
});

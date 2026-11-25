import { describe, expect, test } from "vite-plus/test";

import { isScrolling, viewFor } from "../src/scrolling";

/** A page with the paged views and the scrolling month and agenda. */
const views = [
  "week",
  "day",
  "3-day",
  "month",
  "year",
  "agenda",
  "scrolling-month",
  "scrolling-agenda",
];

describe("the setting that scrolls days, weeks, months and agenda", () => {
  test("turns the paged views into their scrolling versions, and back", () => {
    expect(viewFor("month", true, views)).toBe("scrolling-month");
    expect(viewFor("agenda", true, views)).toBe("scrolling-agenda");
    expect(viewFor("scrolling-month", false, views)).toBe("month");
    expect(viewFor("scrolling-agenda", false, views)).toBe("agenda");
  });

  test("leaves a view whose scrolling version the page doesn't register as it is", () => {
    expect(viewFor("week", true, views)).toBe("week");
    expect(viewFor("week", true, [...views, "scrolling-week"])).toBe("scrolling-week");
    expect(viewFor("year", true, views)).toBe("year");
  });

  test("leaves a view that's already in the set as it is", () => {
    expect(viewFor("scrolling-month", true, views)).toBe("scrolling-month");
    expect(viewFor("month", false, views)).toBe("month");
  });

  test("reads the setting from the view", () => {
    expect(isScrolling("scrolling-agenda")).toBe(true);
    expect(isScrolling("scrolling-month")).toBe(true);
    expect(isScrolling("month")).toBe(false);
    expect(isScrolling("agenda")).toBe(false);
  });
});

import { describe, expect, test } from "vite-plus/test";

import { isScrolling, viewFor } from "../src/scrolling";

describe("the setting that scrolls the month and the agenda", () => {
  test("turns the paged views into their scrolling versions, and back", () => {
    expect(viewFor("month", true)).toBe("scrolling-month");
    expect(viewFor("agenda", true)).toBe("scrolling-agenda");
    expect(viewFor("scrolling-month", false)).toBe("month");
    expect(viewFor("scrolling-agenda", false)).toBe("agenda");
  });

  test("leaves a view that's already in the set as it is", () => {
    expect(viewFor("scrolling-month", true)).toBe("scrolling-month");
    expect(viewFor("month", false)).toBe("month");
  });

  test("reads the setting from the view", () => {
    expect(isScrolling("scrolling-agenda")).toBe(true);
    expect(isScrolling("scrolling-month")).toBe(true);
    expect(isScrolling("month")).toBe(false);
    expect(isScrolling("agenda")).toBe(false);
  });
});

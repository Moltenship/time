import { expect, test } from "vite-plus/test";

import { viewFor } from "../src/scrolling";

test("day, week, and month follow the scrolling setting both ways", () => {
  expect(viewFor("week", true)).toBe("scrolling-week");
  expect(viewFor("day", true)).toBe("scrolling-day");
  expect(viewFor("month", true)).toBe("scrolling-month");
  expect(viewFor("scrolling-week", false)).toBe("week");
  expect(viewFor("scrolling-month", true)).toBe("scrolling-month");
  expect(viewFor("week", false)).toBe("week");
});

test("other views stay as they are", () => {
  expect(viewFor("agenda", true)).toBe("agenda");
  expect(viewFor("timeline-week", false)).toBe("timeline-week");
});

// @vitest-environment jsdom

import { expect, test } from "vite-plus/test";

import { recordAnnouncements } from "../src/announcements";

test("a message said again, with the no-break space that makes the region change, counts twice", () => {
  const container = document.createElement("div");
  const first = document.createElement("div");
  const second = document.createElement("div");
  for (const region of [first, second]) region.setAttribute("data-calendar-part", "announcer");
  container.append(first, second);
  const spoken = recordAnnouncements(container);

  second.textContent = "Moved Standup.";
  expect(spoken.all()).toEqual(["Moved Standup."]);
  second.textContent = "Moved Standup.\u00a0";
  expect(spoken.all()).toEqual(["Moved Standup.", "Moved Standup."]);
  first.textContent = "Picked up Review.";
  expect(spoken.current()).toBe("Picked up Review.");
  first.textContent = "";
  expect(spoken.current()).toBeUndefined();
  expect(spoken.all()).toHaveLength(3);
  spoken.stop();
});

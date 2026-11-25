import { flush } from "solid-js";
import { beforeAll, expect, test } from "vite-plus/test";

// The Solid quick start, run as its last step says: `main.tsx` renders `App` into `#root`. The
// page shows these files, so what a reader copies is what runs here.

beforeAll(async () => {
  document.body.innerHTML = '<div id="root"></div>';
  await import("../main");
  flush();
});

const calendar = () => document.querySelector("#root > section")!;
const title = () => calendar().querySelector("[data-calendar-part='title']")!.textContent;
const days = () => [...calendar().querySelectorAll("h3")].map((heading) => heading.textContent);
const events = () =>
  [...calendar().querySelectorAll("[data-event-id]")].map((event) => event.textContent);

function press(name: string): void {
  const button = [...calendar().querySelectorAll("button")].find(
    (candidate) => candidate.textContent === name,
  );
  if (button === undefined) throw new Error(`No "${name}" button`);
  button.click();
  flush();
}

test("it renders a named calendar with the seeded meeting under its day", () => {
  expect(calendar().getAttribute("aria-label")).toBe("Team calendar");
  expect(title()).toBe("Oct 5 – 18, 2026");
  expect(days()).toEqual(["Thursday, October 8, 2026"]);
  expect(events()).toEqual(["Standup"]);
});

test("the toolbar moves the two weeks the agenda shows, and back", () => {
  press("Next");
  expect(title()).toBe("Oct 19 – Nov 1, 2026");
  expect(events()).toEqual([]);
  expect(calendar().textContent).toContain("Nothing in these weeks.");

  press("Previous");
  expect(title()).toBe("Oct 5 – 18, 2026");
  expect(events()).toEqual(["Standup"]);

  press("Previous");
  expect(title()).toBe("Sep 21 – Oct 4, 2026");
  expect(events()).toEqual([]);
});

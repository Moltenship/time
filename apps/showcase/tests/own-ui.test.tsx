// @vitest-environment jsdom

// The Customization page's last example (content/docs/customization.mdx): a calendar with no file
// from the registry, and what the page says an agent bridge lists for it.

import { createAgent } from "@ui-sdk/react/agent";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, expect, test } from "vite-plus/test";

import { MeetingCalendar, type Meeting } from "../content/examples/own-ui";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const meetings: readonly Meeting[] = [
  {
    id: "planning",
    title: "Sprint planning",
    start: Temporal.Instant.from("2026-10-05T08:00:00Z"),
    end: Temporal.Instant.from("2026-10-05T09:30:00Z"),
  },
  {
    id: "retro",
    title: "Retrospective",
    start: Temporal.Instant.from("2026-10-13T12:00:00Z"),
    end: Temporal.Instant.from("2026-10-13T13:00:00Z"),
  },
];

let cleanup: (() => Promise<void>) | undefined;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function render() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<MeetingCalendar meetings={meetings} />));
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return container;
}

async function click(container: Element, text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (element) => element.textContent === text,
  );
  if (button === undefined) throw new Error(`No button reads "${text}".`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const titleOf = (container: Element) =>
  container.querySelector('[data-calendar-part="title"]')?.textContent;
const listOf = (container: Element) =>
  [...container.querySelectorAll(".meeting-list li")].map((item) =>
    item.textContent?.replace(/[   ]/gu, " "),
  );

test("the app's own markup shows the week, and its controls move it", async () => {
  const container = await render();

  expect(titleOf(container)).toBe("Oct 5, 2026");
  expect(listOf(container)).toEqual(["Oct 5, 2026, 10:00 AM Sprint planning"]);

  // A part from the calendar, with the app's class.
  await click(container, "Next");
  expect(titleOf(container)).toBe("Oct 12, 2026");
  expect(listOf(container)).toEqual(["Oct 13, 2026, 2:00 PM Retrospective"]);

  await click(container, "Previous");
  expect(titleOf(container)).toBe("Oct 5, 2026");
});

test("the app's own button calls an action", async () => {
  const container = await render();
  const today = Temporal.Now.plainDateISO("Europe/Berlin");

  await click(container, "Today");

  expect(titleOf(container)).toBe(today.toLocaleString("en-US", { dateStyle: "medium" }));
});

test("the parts bring no class, inline style or stylesheet of their own", async () => {
  // The test setup's own, which fills a gap in jsdom.
  const setupStyles = document.querySelectorAll("style").length;
  const container = await render();
  const parts = [...container.querySelectorAll("[data-calendar-part]")];

  expect(parts.map((part) => part.getAttribute("data-calendar-part"))).toEqual([
    "frame",
    "toolbar",
    "previous-trigger",
    "next-trigger",
    "title",
    "viewport",
  ]);
  expect(parts.map((part) => part.className)).toEqual([
    "calendar",
    "toolbar",
    "button",
    "button",
    "title",
    "",
  ]);
  expect(parts.every((part) => part.getAttribute("style") === null)).toBe(true);
  // Nor does rendering them add a stylesheet to the page.
  expect(document.querySelectorAll("style")).toHaveLength(setupStyles);
  expect(document.adoptedStyleSheets ?? []).toHaveLength(0);
});

test("an agent bridge lists the calendar and its actions, and not the app's own buttons", async () => {
  const agent = createAgent();
  await render();

  const entries = agent.snapshot() as readonly {
    readonly actions?: readonly string[];
    readonly component: string;
    readonly label?: string;
  }[];

  expect(entries.map(({ component, label }) => ({ component, label }))).toEqual([
    { component: "calendar", label: "Team meetings" },
  ]);
  // No `onEventChange`, so the reading and navigation actions.
  expect(entries[0]?.actions).toEqual([
    "describeCalendar",
    "getChange",
    "goToDate",
    "listEvents",
    "navigateNext",
    "navigatePrevious",
    "navigateToday",
    "selectEvent",
    "setTimeZone",
    "setView",
  ]);
});

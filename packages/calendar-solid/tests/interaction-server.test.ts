// @vitest-environment node

// No setup file: it installs jsdom stubs, and this file's renders must not see a document.

import type { CalendarFocus } from "@moltenship/calendar-core";
import { attachCalendarPointer } from "@moltenship/calendar-dnd";
import { createComponent, isServer, renderToString, type JSX } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { useCalendarPointer } from "../src";
import { element } from "../src/props";
import { KeyboardCalendar } from "./fixtures/interaction";

vi.mock("@moltenship/calendar-dnd", async (original) => {
  const actual = await original<typeof import("@moltenship/calendar-dnd")>();
  return { ...actual, attachCalendarPointer: vi.fn(actual.attachCalendarPointer) };
});

import {
  createRecordedHistory,
  createTestClock,
  InteractionApp,
  type InteractionAppProps,
} from "./fixtures/interaction-app";
import { createHydrationPage, type HydrationPage } from "./harness/hydration";

type Entry = typeof import("./fixtures/hydrate-entry");

const messages: string[] = [];
beforeEach(() => {
  messages.length = 0;
  const record = (...args: unknown[]) => void messages.push(args.join(" "));
  vi.spyOn(console, "warn").mockImplementation(record);
  vi.spyOn(console, "error").mockImplementation(record);
});

// The page's microtasks and the test's share one event loop.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const pages: HydrationPage[] = [];
const roots: (() => void)[] = [];
afterEach(async () => {
  for (const dispose of roots.splice(0)) dispose();
  await tick();
  for (const page of pages.splice(0)) await page.close();
  vi.restoreAllMocks();
  expect(messages).toEqual([]);
});

function render(props: Partial<InteractionAppProps> = {}) {
  return renderToString(() =>
    createComponent(InteractionApp, { history: createRecordedHistory(), ...props }),
  );
}

async function hydrate(html: string, options: Parameters<Entry["hydrateInteraction"]>[1] = {}) {
  const page = await createHydrationPage(html);
  pages.push(page);
  const entry = await page.load<Entry>("/tests/fixtures/hydrate-entry.ts");
  const before = [...page.container.querySelectorAll("[data-date], [data-event]")];
  const hydrated = entry.hydrateInteraction(page.container, options);
  roots.push(hydrated.dispose);
  await tick();
  const after = [...page.container.querySelectorAll("[data-date], [data-event]")];
  // The same nodes, claimed rather than rendered again.
  expect(after).toHaveLength(before.length);
  expect(after.every((node, index) => node === before[index])).toBe(true);
  return { ...hydrated, page };
}

const read = (html: string, name: string) =>
  new RegExp(`data-${name}(?:="")?[^>]*>([^<]*)<`).exec(html)?.[1];

function tabStops(container: ParentNode) {
  return [...container.querySelectorAll<HTMLElement>('[tabindex="0"]')].map(
    (node) => node.dataset.date ?? `${node.dataset.event}@${node.dataset.start}`,
  );
}

describe("server rendering", () => {
  test("renders one tab stop, an empty announcer, and nothing that reads the page's time", () => {
    expect(isServer).toBe(true);
    const html = render({ clock: createTestClock("2026-10-08T12:00:00Z") });
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    // Today is the page's to know, so the server's entry is the month's first day.
    expect(html).toMatch(/data-date="2026-10-01"[^>]*tabindex="0"/);
    expect(html).toMatch(/data-calendar-part="announcer"[^>]*><\/div>/);
    // The clock is the page's, and the history's steps are the page's to show.
    expect(read(html, "now")).toBe("pending");
    expect(read(html, "status")).toBe("pending");
    expect(read(html, "history")).toBe("0 back, 0 forward");
    expect(read(html, "draft")).toBe("none");
    expect(read(html, "session")).toBe("idle");
  });

  test("a fixed now renders on the server, and its today takes the tab stop", () => {
    const html = render();
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toMatch(/data-date="2026-10-08"[^>]*tabindex="0"/);
    expect(read(html, "now")).toBe("2026-10-08T12:00:00Z");
    expect(read(html, "status")).toBe("ready");
  });

  test.each([
    ["a date outside the view", { date: Temporal.PlainDate.from("2026-11-20"), kind: "day" }],
    [
      "a slot, which a month does not render",
      {
        date: Temporal.PlainDate.from("2026-10-12"),
        kind: "slot",
        time: Temporal.PlainTime.from("09:00"),
      },
    ],
    [
      "an event on a date it does not cover",
      { date: Temporal.PlainDate.from("2026-10-20"), eventId: "trip", kind: "event" },
    ],
  ] as const)("enters the view when focus is on %s", async (_, defaultFocus) => {
    const html = render({ defaultFocus: defaultFocus as CalendarFocus });
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    const { page } = await hydrate(html, { defaultFocus: defaultFocus as CalendarFocus });
    expect(tabStops(page.container)).toEqual(["2026-10-08"]);
  });
});

test("the pointer hook attaches nothing on the server", () => {
  const Div = element("div");
  function Region(): JSX.Element {
    // Never read on the server: no gesture starts there.
    const pointer = useCalendarPointer({} as Parameters<typeof useCalendarPointer>[0]);
    return createComponent(Div, { "data-region": "", ref: pointer });
  }
  const html = renderToString(() =>
    createComponent(KeyboardCalendar.Root, {
      defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
      defaultTimeZone: "UTC",
      events: [],
      locale: "en-US",
      weekRules: { firstDay: 7, minimalDays: 1, weekend: [6, 7] },
      get children() {
        return createComponent(Region, {});
      },
    }),
  );
  expect(html).toContain("data-region");
  expect(attachCalendarPointer).not.toHaveBeenCalled();
});

describe("hydration", () => {
  test("claims the server's nodes, then reads the page's clock and history", async () => {
    const html = render({ clock: createTestClock("2026-10-08T12:00:00Z") });
    const { clock, page } = await hydrate(html, { clock: "2026-10-08T12:00:00Z" });
    const text = (name: string) => page.container.querySelector(`[data-${name}]`)!.textContent;
    expect(tabStops(page.container)).toEqual(["2026-10-08"]);
    expect(text("now")).toBe("2026-10-08T12:00:00Z");
    expect(text("status")).toBe("ready");
    expect(text("history")).toBe("1 back, 0 forward");

    clock!.set("2026-10-08T12:00:01Z");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(text("now")).toBe("2026-10-08T12:00:01Z");
  });

  test("a rendered focus takes the tab stop once its element registers", async () => {
    const defaultFocus: CalendarFocus = {
      date: Temporal.PlainDate.from("2026-10-14"),
      kind: "day",
    };
    const html = render({ defaultFocus });
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    // No element registers on the server, so its tab stop is the view's entry, as React's is.
    expect(html).toMatch(/data-date="2026-10-08"[^>]*tabindex="0"/);
    const { page } = await hydrate(html, { defaultFocus });
    expect(tabStops(page.container)).toEqual(["2026-10-14"]);
  });

  test("the hydrated view takes keys", async () => {
    const html = render();
    const { page } = await hydrate(html);
    const today = page.container.querySelector<HTMLElement>('[data-date="2026-10-08"]')!;
    today.focus();
    await tick();
    today.dispatchEvent(
      new (page.window as unknown as typeof globalThis).KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowRight",
      }),
    );
    await tick();
    await tick();
    expect((page.window.document.activeElement as HTMLElement).dataset.date).toBe("2026-10-09");
    expect(tabStops(page.container)).toEqual(["2026-10-09"]);
  });
});

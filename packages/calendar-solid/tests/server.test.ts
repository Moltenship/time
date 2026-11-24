// @vitest-environment node

// No setup file: it installs jsdom stubs, and this file's renders must not see a document.

import { createComponent, isServer, renderToString } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { RatingApp } from "./fixtures/rating-app";
import type { CalendarFocus, CalendarSelection } from "@moltenship/calendar-core";

import { createCalendarStore } from "../src";
import { EngineCalendar, review, weekRules } from "./fixtures/calendar";
import { CalendarApp, createMeetingSource, LabelApp, standup } from "./fixtures/server-apps";
import { createHydrationPage, type HydrationPage } from "./harness/hydration";
import { createTestStore } from "./harness/store";

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
  // A page's Solid reads `document` from the globals when it runs, and some of its work comes a task
  // later. Dispose and let that work finish before the next page takes the globals, or a failed
  // test's leftovers break the next test's hydration.
  for (const dispose of roots.splice(0)) dispose();
  await tick();
  for (const page of pages.splice(0)) await page.close();
  vi.restoreAllMocks();
  expect(messages).toEqual([]);
});

async function openPage(html: string) {
  const page = await createHydrationPage(html);
  pages.push(page);
  const entry = await page.load<Entry>("/tests/fixtures/hydrate-entry.ts");
  return { page, entry };
}

describe("server rendering", () => {
  test("renders the primitive's parts with their ARIA, values and roving tab stop", () => {
    expect(isServer).toBe(true);
    const html = renderToString(() => createComponent(RatingApp, { defaultValue: 2 }));
    expect(html).toMatch(/^<section _hk=\w+ data-testid="app">/);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Rating"');
    const stars = html.match(/<button[^>]*>/g)!;
    expect(stars).toHaveLength(3);
    expect(stars.map((star) => /aria-checked="(\w+)"/.exec(star)![1])).toEqual([
      "false",
      "true",
      "false",
    ]);
    // Only the checked star is a tab stop, as the client renders it.
    expect(stars.map((star) => /tabindex="(-?\d)"/.exec(star)![1])).toEqual(["-1", "0", "-1"]);
  });

  test("a selector reads the server snapshot and never subscribes", () => {
    const store = createTestStore({ label: "client" }, { label: "server" });
    const html = renderToString(() => createComponent(LabelApp, { store }));
    expect(html).toContain(">server</output>");
    expect(store.listeners).toBe(0);

    const plain = createTestStore({ label: "only" });
    expect(renderToString(() => createComponent(LabelApp, { store: plain }))).toContain(
      ">only</output>",
    );
  });

  test("a store rendered on the server stays unbound: its actions reach no server root", () => {
    const store = createCalendarStore<"agenda" | "month", CalendarSelection, CalendarFocus>({
      defaultAnchorDate: Temporal.PlainDate.from("2026-08-15"),
      defaultTimeZone: "UTC",
      defaultView: "month",
    });
    const heard: string[] = [];
    const html = renderToString(() =>
      createComponent(EngineCalendar.Root, {
        // The store's state wins; the types ask for these as they do without a store.
        defaultAnchorDate: Temporal.PlainDate.from("2026-08-15"),
        defaultTimeZone: "UTC",
        events: [review],
        locale: "en-GB",
        onViewChange: (next) => void heard.push(next),
        store,
        weekRules,
        get children() {
          return createComponent(EngineCalendar.Title, {});
        },
      }),
    );
    expect(html).toContain("August 2026");

    store.actions.setView("agenda");

    expect(heard).toEqual([]);
    expect(store.getSnapshot().view).toBe("agenda");
  });

  test("a calendar renders its parts, its title, its view and the server's events", () => {
    const events = createMeetingSource([review], [review, standup]);
    const html = renderToString(() => createComponent(CalendarApp, { events }));

    const frame = /<section[^>]*data-calendar-part="frame"[^>]*>/.exec(html)![0];
    expect(frame).toContain('aria-label="Team calendar"');
    expect(html).toMatch(/data-calendar-part="title"[^>]*>August 2026</);
    // The option says which view is on screen: server HTML has no value on a select.
    expect(html).toMatch(/<option[^>]*selected[^>]*>month</);
    expect(html).not.toMatch(/<option[^>]*selected[^>]*>agenda</);
    const days = html.match(/data-date="[\d-]+"/g)!;
    expect(days[0]).toBe('data-date="2026-07-27"');
    // Weeks start on Monday, so August 2026 takes six rows.
    expect(days).toHaveLength(42);
    // A clock's today is the page's: the server marks none.
    expect(html).not.toContain("data-today");
    expect(html).toContain(">Architecture review</li>");
    expect(html).not.toContain("Standup");
    // Nothing on the server subscribes, so nothing leaks per request.
    expect(events.listeners).toBe(0);
  });
});

describe("hydration", () => {
  test("claims the server's nodes and makes them interactive", async () => {
    const html = renderToString(() => createComponent(RatingApp, { defaultValue: 2 }));
    const { page, entry } = await openPage(html);
    expect(entry.isServer).toBe(false);

    const before = [...page.container.querySelectorAll("button")];
    roots.push(entry.hydrateRating(page.container, 2));
    await tick();
    const after = [...page.container.querySelectorAll("button")];
    expect(after).toHaveLength(3);
    // The same nodes, not a re-render.
    expect(after.every((star, index) => star === before[index])).toBe(true);

    after[2]!.click();
    await tick();
    expect(after.map((star) => star.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "true",
    ]);
  });

  test("a selector shows the server snapshot while hydrating, then switches to the client's", async () => {
    const html = renderToString(() =>
      createComponent(LabelApp, {
        store: createTestStore({ label: "client" }, { label: "server" }),
      }),
    );
    const { page, entry } = await openPage(html);
    const output = page.container.querySelector("output")!;
    const hydrated = entry.hydrateLabel(page.container);
    roots.push(hydrated.dispose);
    // Hydration renders the server's label, so it claims the node without a key miss, and switches
    // to the client's in the flush that ends `hydrate`: the server's label is never seen after it.
    expect(page.container.querySelector("output")).toBe(output);
    expect(output.textContent).toBe("client");
    await tick();
    expect(hydrated.store.listeners).toBe(1);

    hydrated.store.set({ label: "later" });
    await tick();
    expect(output.textContent).toBe("later");
    for (const dispose of roots.splice(0)) dispose();
    expect(hydrated.store.listeners).toBe(0);
  });

  test("a store without a server snapshot reads the client's, and so does the next one", async () => {
    const html = renderToString(() =>
      createComponent(LabelApp, { store: createTestStore({ label: "plain" }) }),
    );
    const { page, entry } = await openPage(html);
    const hydrated = entry.hydrateLabelSwap(page.container);
    roots.push(hydrated.dispose);
    await tick();
    const output = page.container.querySelector("output")!;
    expect(output.textContent).toBe("plain");

    // Hydration is over: a store handed over later is read as the client's.
    hydrated.swap();
    await tick();
    expect(output.textContent).toBe("client");
  });

  test("a calendar hydrates the server's nodes, then shows today and the page's events", async () => {
    const html = renderToString(() =>
      createComponent(CalendarApp, { events: createMeetingSource([review]) }),
    );
    const { page, entry } = await openPage(html);
    const title = page.container.querySelector("[data-calendar-part='title']")!;
    const days = [...page.container.querySelectorAll("[data-date]")];

    const hydrated = entry.hydrateCalendar(page.container);
    roots.push(hydrated.dispose);
    await tick();

    // The same nodes, claimed rather than rendered again.
    expect(page.container.querySelector("[data-calendar-part='title']")).toBe(title);
    const claimed = [...page.container.querySelectorAll("[data-date]")];
    expect(claimed).toHaveLength(days.length);
    expect(claimed.every((day, index) => day === days[index])).toBe(true);
    expect(page.container.querySelector("[data-today]")?.getAttribute("data-date")).toBe(
      "2026-08-14",
    );
    expect(
      [...page.container.querySelectorAll("[data-event]")].map((event) => event.textContent),
    ).toEqual(["Architecture review", "Standup"]);
    expect(hydrated.events.listeners).toBe(1);

    page.container.querySelector<HTMLButtonElement>("[data-calendar-part='next-trigger']")!.click();
    await tick();
    expect(title.textContent).toBe("September 2026");

    for (const dispose of roots.splice(0)) dispose();
    expect(hydrated.events.listeners).toBe(0);
  });
});

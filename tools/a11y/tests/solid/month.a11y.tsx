import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEventChange,
} from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { cdp, page, server, userEvent } from "vite-plus/test/browser";

import { calendarAnnouncements } from "@registry/shared/calendar/announcements";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { createMonthView } from "@registry/month-view/month-view";

import { seriousViolations, setTheme, themes } from "../axe";
import { describeTree, opened } from "../kit-twins";
import {
  monthAnchor,
  monthAvailability,
  monthEvents,
  monthNow,
  monthWeekRules,
  type MonthFixture,
} from "../month-fixture";
import month from "../view-twins/month.txt?raw";
import monthMore from "../view-twins/month-more.txt?raw";
import { press, render, settled, until } from "./render";

// The Solid registry's month in a real browser, against what React's month files check
// (month-twins, registry-views, rtl-layout, phone-layout, touch, reduced-motion and the month's
// drags): it renders React's month, passes axe in both themes, mirrors in RTL, drags in both
// preview modes without re-rendering the grid, and its targets are 24 px on a phone.

type Change = CalendarEventChange<MonthFixture, string, string>;

const Calendar = createCalendar<MonthFixture>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [createMonthView<MonthFixture>({ getEventColor: (event) => event.data.color })],
});

function Month(props: {
  readonly dir?: "ltr" | "rtl";
  readonly dragPreview?: "free" | "snapped";
  readonly events?: readonly MonthFixture[];
  readonly onEventChange?: (change: Change) => void;
}) {
  // Saves each change, as an app does, so focus and the grid follow a dropped event.
  const [events, setEvents] = createSignal<readonly MonthFixture[]>(props.events ?? monthEvents);
  const save = (change: Change) => {
    props.onEventChange?.(change);
    const proposed = change.proposed;
    if (proposed == null || change.eventId === null) return;
    setEvents((all) =>
      all.map((event) =>
        event.id === change.eventId ? ({ ...event, ...proposed } as MonthFixture) : event,
      ),
    );
  };
  return (
    <Calendar.Root
      availability={monthAvailability}
      defaultAnchorDate={monthAnchor}
      defaultTimeZone="UTC"
      defaultView="month"
      direction={props.dir ?? "ltr"}
      events={events()}
      locale="en-US"
      now={monthNow}
      onEventChange={save}
      viewOptions={{ month: { dragPreview: props.dragPreview } }}
      weekRules={monthWeekRules}
    >
      <Calendar.Frame class="flex h-dvh flex-col" dir={props.dir ?? "ltr"}>
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
      <Calendar.Announcer messages={calendarAnnouncements} />
    </Calendar.Root>
  );
}

const grid = () => document.querySelector<HTMLElement>('[data-slot="month-view"]')!;
const more = () => grid().querySelector<HTMLElement>('[aria-label*=" more events on Thursday"]')!;
const cell = (date: string) =>
  grid()
    .querySelector<HTMLElement>(`[data-date="${date}"]`)!
    .closest<HTMLElement>('[role="gridcell"]')!;
const chip = (id: string) => grid().querySelector<HTMLElement>(`[data-event-id="${id}"]`)!;
const spoken = () =>
  document
    .querySelector('[data-calendar-part="announcer"]')
    ?.textContent?.replace(/\s/g, " ")
    .trim();
const lanesMeasured = () =>
  until(() => expect(grid().querySelector('[aria-label*=" more events on "]')).not.toBeNull());

/** Where the first change puts the event. */
function placed(onEventChange: ReturnType<typeof vi.fn<(change: Change) => void>>) {
  const change = onEventChange.mock.calls[0]?.[0];
  const proposed = change?.proposed;
  return change === undefined || proposed == null
    ? undefined
    : `${change.cause} ${proposed.start.toString()}/${proposed.end.toString()}`;
}

function middle(element: Element): [number, number] {
  const box = element.getBoundingClientRect();
  return [box.left + box.width / 2, box.top + box.height / 2];
}

/** A mouse's pointer event at a point of the page, on what's under it. */
function fire(type: string, [x, y]: readonly [number, number]) {
  (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      cancelable: true,
      clientX: x,
      clientY: y,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    }),
  );
}

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** Presses at `from`, moves to `to` in `steps` frames, and holds it there. */
async function dragTo(from: readonly [number, number], to: readonly [number, number], steps = 6) {
  fire("pointerdown", from);
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    fire("pointermove", [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    await frame();
  }
}

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("the Solid month renders React's", () => {
  test("the month, and its +N more list open", async () => {
    await render(() => <Month />);
    await lanesMeasured();
    expect(describeTree(grid())).toBe(month);

    more().click();
    await until(() =>
      expect(opened(document.querySelector('[data-slot="popover-content"]'))).toBe(true),
    );
    await settled();
    expect(describeTree(grid())).toBe(monthMore);
  });
});

describe.each(themes)("the Solid month, %s theme", (theme) => {
  test("has no serious violations, with its +N more list closed and open", async () => {
    setTheme(theme);
    await render(() => <Month />);
    await lanesMeasured();
    expect(await seriousViolations()).toEqual([]);

    more().click();
    await until(() =>
      expect(document.querySelector('[data-slot="popover-content"]')).not.toBeNull(),
    );
    expect(await seriousViolations()).toEqual([]);
  });

  test.each([
    ["an event", '[data-event-id$=" call"]'],
    ["a day outside the month", 'div[data-date="2026-09-28"] > button'],
  ])("%s keeps its contrast while hovered", async (_, selector) => {
    setTheme(theme);
    await render(() => <Month />);
    await userEvent.hover(document.querySelector<HTMLElement>(selector)!);

    expect(await seriousViolations()).toEqual([]);
  });
});

describe.each(["ltr", "rtl"] as const)("the Solid month, %s", (dir) => {
  const px = (value: number) => Math.round(value) + 0;

  test("days, bars and their continuations follow the reading order", async () => {
    await render(() => <Month dir={dir} />);
    const box = (date: string) => cell(date).getBoundingClientRect();
    const gap = (first: DOMRect, second: DOMRect) =>
      px(dir === "ltr" ? second.left - first.right : first.left - second.right);

    expect(gap(box("2026-10-12"), box("2026-10-13"))).toBe(0);
    // The offsite continues from last week: its bar meets the week's inline start, squared off.
    const continuation = grid().querySelectorAll('[data-event-id="Offsite"]')[1]!;
    const { left, right } = continuation.getBoundingClientRect();
    const week = box("2026-10-12");
    expect(px(dir === "ltr" ? left - week.left : week.right - right)).toBe(0);
    expect(getComputedStyle(continuation.querySelector("svg")!).rotate).toBe(
      dir === "rtl" ? "180deg" : "none",
    );
  });
});

describe("the Solid month's keyboard in a real browser", () => {
  test("Space grabs an event, arrows move it, Enter drops it, and focus stays on it", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <Month onEventChange={onEventChange} />);
    cell("2026-10-05").focus();
    await press("Enter");
    // The conference doesn't start this week; the blue call is the day's first event.
    expect(document.activeElement?.getAttribute("data-event-id")).toBe("blue call");

    await press(" ");
    await press("ArrowRight");
    await press("Enter");

    await until(() =>
      expect(placed(onEventChange)).toBe("move 2026-10-06T15:00:00Z/2026-10-06T15:30:00Z"),
    );
    await until(() =>
      expect(document.activeElement?.closest('[role="gridcell"]')).toBe(cell("2026-10-06")),
    );
    expect(document.activeElement?.getAttribute("data-event-id")).toBe("blue call");
    expect(spoken()).toBe("Moved blue call to Tuesday, October 6, 3:00 – 3:30 PM.");
  });

  test("Escape cancels a grab and puts focus back on the event", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <Month onEventChange={onEventChange} />);
    cell("2026-10-05").focus();
    await press("Enter");
    await press(" ");
    await press("ArrowDown");
    await press("Escape");

    expect(onEventChange).not.toHaveBeenCalled();
    expect(document.activeElement?.getAttribute("data-event-id")).toBe("blue call");
    expect(document.activeElement?.closest('[role="gridcell"]')).toBe(cell("2026-10-05"));
    expect(spoken()).toBe("Cancelled. blue call is back where it was.");
  });
});

describe.each(["snapped", "free"] as const)("the Solid month's %s drag preview", (preview) => {
  test("drags an event to another day, keeping its time, without re-rendering the grid", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <Month dragPreview={preview} onEventChange={onEventChange} />);
    const cells = [...grid().querySelectorAll('[role="gridcell"]')];
    const changed = new Set<Node>();
    const observer = new MutationObserver((records) => {
      const ghost = (node: Node) =>
        node instanceof Element &&
        node.matches("[data-calendar-ghost], [data-calendar-ghost-origin]");
      // The pointer layer adds its preview to the grid; nothing else may change.
      for (const record of records) {
        if (![...record.addedNodes, ...record.removedNodes].every(ghost)) {
          changed.add(record.target);
        }
      }
    });
    observer.observe(grid(), { childList: true, subtree: true });

    await dragTo(middle(chip("blue call")), middle(cell("2026-10-13")));
    try {
      expect(grid().getAttribute("data-interaction")).toBe("move");
      const ghosts = [...document.querySelectorAll("[data-calendar-ghost]")].map((ghost) =>
        ghost.getAttribute("data-calendar-ghost"),
      );
      // A free drag's copy follows the pointer over a marker of where it lands; a snapped one's
      // range fills the day it would land on.
      expect(ghosts.includes("landing")).toBe(preview === "free");
      expect(ghosts.length).toBeGreaterThan(0);
      expect([...changed]).toEqual([]);
      expect([...grid().querySelectorAll('[role="gridcell"]')]).toEqual(cells);
    } finally {
      observer.disconnect();
      fire("pointerup", middle(cell("2026-10-13")));
    }

    await until(() =>
      expect(placed(onEventChange)).toBe("move 2026-10-13T15:00:00Z/2026-10-13T15:30:00Z"),
    );
    await until(() => expect(document.querySelector("[data-calendar-ghost]")).toBeNull());
  });

  test("drags across empty days to create an all-day event", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <Month dragPreview={preview} onEventChange={onEventChange} />);
    const [x, y] = middle(cell("2026-10-20"));
    const [toX] = middle(cell("2026-10-22"));

    await dragTo([x, y + 20], [toX, y + 20]);
    expect(grid().getAttribute("data-interaction")).toBe("create");
    fire("pointerup", [toX, y + 20]);

    await until(() => expect(placed(onEventChange)).toBe("create 2026-10-20/2026-10-23"));
  });

  test("Escape during a drag cancels it", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <Month dragPreview={preview} onEventChange={onEventChange} />);
    const to = middle(cell("2026-10-13"));

    await dragTo(middle(chip("blue call")), to);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
    );
    await settled();
    fire("pointerup", to);
    await frame();

    expect(onEventChange).not.toHaveBeenCalled();
    await until(() => expect(document.querySelector("[data-calendar-ghost]")).toBeNull());
    expect(grid().hasAttribute("data-interaction")).toBe(false);
  });
});

// A phone's coarse pointer, which the month's taller lanes are for, needs Chromium's touch
// emulation through CDP.
describe.runIf(server.browser === "chromium")("the Solid month on a 375 px touch screen", () => {
  beforeAll(async () => {
    await page.viewport(375, 667);
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  });
  afterAll(async () => {
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await page.viewport(1280, 800);
  });

  test("events and +N more are 24 px tall, and end inside their week", async () => {
    await render(() => <Month />);
    await lanesMeasured();

    for (const target of grid().querySelectorAll<HTMLElement>(
      "[data-event-id], [data-slot='popover-trigger']",
    )) {
      const row = target.closest("[role='row']")!.getBoundingClientRect();
      expect([target.offsetHeight, target.getBoundingClientRect().bottom <= row.bottom]).toEqual([
        24,
        true,
      ]);
    }
  });

  test("timed events are tinted blocks, and the grid selects no text", async () => {
    await render(() => <Month />);

    expect(getComputedStyle(chip("blue call")).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(grid()).userSelect).toBe("none");
  });
});

describe.runIf(server.browser === "chromium")("the Solid month with reduced motion", () => {
  beforeAll(async () => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
  });
  afterAll(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  });

  test("its +N more list fades in without zooming or sliding", async () => {
    expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    await render(() => <Month />);
    await lanesMeasured();
    more().click();
    await settled();
    const content = document.querySelector<HTMLElement>('[data-slot="popover-content"]')!;
    const { scale, translate } = getComputedStyle(content);

    // Only opacity moves on the way in.
    expect([scale, translate]).toEqual(["none", "none"]);
    await until(() => expect(opened(content)).toBe(true));
  });
});

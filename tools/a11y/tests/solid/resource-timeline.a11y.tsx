import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEventChange,
} from "@moltenship/calendar-solid";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { cdp, page, server } from "vite-plus/test/browser";

import { calendarAnnouncements } from "@registry/shared/calendar/announcements";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  createTimelineDayView,
  createTimelineWeekView,
} from "@registry/resource-timeline-view/resource-timeline-view";

import { seriousViolations, setTheme, themes } from "../axe";
import { describeLayout } from "../kit-twins";
import {
  timelineAnchor,
  timelineAvailability,
  timelineBookings,
  timelineExpanded,
  timelineNow,
  timelineResources,
  timelineWeekRules,
  type TimelineBooking,
  type TimelineResource,
} from "../timeline-fixture";
import timelineDay from "../view-twins/timeline-day.txt?raw";
import timelineWeek from "../view-twins/timeline-week.txt?raw";
import timelineWeekCollapsed from "../view-twins/timeline-week-collapsed.txt?raw";
import { atRest, press, render, settled, until } from "./render";

type Change = CalendarEventChange<TimelineBooking, string, string>;
type View = "timeline-day" | "timeline-week";

const getEventColor = (event: TimelineBooking) => event.data.color;
const Calendar = createCalendar<TimelineBooking, TimelineResource>()({
  eventAdapter: createCanonicalEventAdapter<
    { readonly color: CalendarEventColor },
    string,
    string
  >(),
  views: [
    createTimelineDayView<TimelineBooking>({ getEventColor, resourceStatus: true }),
    createTimelineWeekView<TimelineBooking>({ getEventColor, unassigned: "bucket" }),
  ],
});

function Timeline(props: {
  readonly dir?: "ltr" | "rtl";
  readonly dragPreview?: "free" | "snapped";
  readonly onEventChange?: (change: Change) => void;
  readonly size?: string;
  readonly view: View;
}) {
  return (
    <Calendar.Root
      availability={timelineAvailability}
      defaultAnchorDate={timelineAnchor}
      defaultExpandedResourceIds={timelineExpanded}
      defaultTimeZone="UTC"
      defaultView={props.view}
      direction={props.dir ?? "ltr"}
      events={timelineBookings}
      locale="en-US"
      now={timelineNow}
      onEventChange={(change) => props.onEventChange?.(change)}
      resources={timelineResources}
      viewOptions={{
        "timeline-day": { dragPreview: props.dragPreview },
        "timeline-week": { dragPreview: props.dragPreview },
      }}
      weekRules={timelineWeekRules}
    >
      <Calendar.Frame class={props.size ?? "h-[600px] w-[1000px]"} dir={props.dir ?? "ltr"}>
        <Calendar.ActiveView />
      </Calendar.Frame>
      <Calendar.Announcer messages={calendarAnnouncements} />
    </Calendar.Root>
  );
}

const grid = () => document.querySelector<HTMLElement>('[data-slot="resource-timeline"]')!;
const viewport = () =>
  document.querySelector<HTMLElement>('[data-slot="resource-timeline-viewport"]')!;

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("the Solid timeline renders React's", () => {
  test("a day of hours, opened on now, with each resource's status", async () => {
    await render(() => <Timeline view="timeline-day" />);
    await until(() =>
      expect(grid().querySelector('[data-slot="resource-timeline-now"]')).not.toBeNull(),
    );
    await until(() => expect(viewport().scrollLeft).toBeGreaterThan(0));
    await atRest(viewport());
    expect(describeLayout(grid())).toBe(timelineDay);
  });

  test("a week of days, and a site collapsed from its toggle", async () => {
    await render(() => <Timeline view="timeline-week" />);
    await until(() => expect(grid().querySelector('[data-event-id="Workshop"]')).not.toBeNull());
    await atRest(viewport());
    expect(describeLayout(grid())).toBe(timelineWeek);

    grid().querySelector<HTMLElement>('[aria-label="Collapse Site 1"]')!.click();
    await settled();
    await until(() => expect(grid().querySelector('[aria-label="Expand Site 1"]')).not.toBeNull());
    await atRest(viewport());
    expect(describeLayout(grid())).toBe(timelineWeekCollapsed);
  });
});

const row = (title: string) =>
  grid().querySelector<HTMLElement>(`[role="row"][aria-label="${title}"]`)!;
const bar = (id: string, within: Element = grid()) =>
  within.querySelector<HTMLElement>(`[data-event-id="${id}"]`)!;
const tabStops = () => grid().querySelectorAll<HTMLElement>('[tabindex="0"]');
const spoken = () =>
  document
    .querySelector('[data-calendar-part="announcer"]')
    ?.textContent?.replace(/\s/g, " ")
    .trim();

/** Where the first change puts the event, and on which resources. */
function placed(onEventChange: ReturnType<typeof vi.fn<(change: Change) => void>>) {
  const change = onEventChange.mock.calls[0]?.[0];
  const proposed = change?.proposed;
  return change === undefined || proposed == null
    ? undefined
    : [
        change.cause,
        `${proposed.start.toString()}/${proposed.end.toString()}`,
        (proposed.resourceIds ?? []).join(" "),
      ].join(" ");
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

/**
 * Presses at `from`, moves to `to` in `steps` frames, and holds it there; returns where it ends.
 * WebKit scrolls the viewport back a step or two as a drag starts, in React's timeline too, so
 * each point follows the scroll: the pointer lands on the same time either way.
 */
async function dragTo(from: readonly [number, number], to: readonly [number, number], steps = 6) {
  const start = viewport().scrollLeft;
  const along = ([x, y]: readonly [number, number]): [number, number] => [
    x + start - viewport().scrollLeft,
    y,
  ];
  fire("pointerdown", from);
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    fire("pointermove", along([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]));
    await frame();
  }
  return along(to);
}

/**
 * Records every change to the grid's tree that isn't the pointer layer's preview, or, once the
 * viewport has scrolled (see `dragTo`), a slot's header or cell coming into view or leaving it.
 */
function watchGrid() {
  const changed = new Set<Node>();
  const start = viewport().scrollLeft;
  const expected = (node: Node) =>
    node instanceof Element &&
    (node.matches("[data-calendar-ghost], [data-calendar-ghost-origin]") ||
      (viewport().scrollLeft !== start &&
        node.matches('[role="columnheader"], [role="gridcell"]')));
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (![...record.addedNodes, ...record.removedNodes].every(expected)) {
        changed.add(record.target);
      }
    }
  });
  observer.observe(grid(), { childList: true, subtree: true });
  return {
    changed: () => [...changed],
    stop: () => observer.disconnect(),
  };
}

/** An hour's width along a day of hours, or a day's along a week. */
const slotWidth = () =>
  grid().querySelector<HTMLElement>('[role="columnheader"][aria-colindex="2"]')!.offsetWidth;

const opened = async (view: View) => {
  await until(() => expect(bar("Audit")).not.toBeNull());
  if (view === "timeline-day") await until(() => expect(viewport().scrollLeft).toBeGreaterThan(0));
  await atRest(viewport());
};

describe.each(themes)("the Solid timeline, %s theme", (theme) => {
  test.each(["timeline-day", "timeline-week"] as const)(
    "%s has no serious violations",
    async (view) => {
      setTheme(theme);
      await render(() => <Timeline view={view} />);
      await opened(view);

      expect(await seriousViolations()).toEqual([]);
    },
  );
});

describe.each(["ltr", "rtl"] as const)("the Solid timeline, %s", (dir) => {
  test("days run in the reading order, behind a resource column that stays at its start", async () => {
    await render(() => <Timeline dir={dir} view="timeline-week" />);
    await opened("timeline-week");
    const box = (selector: string) => grid().querySelector(selector)!.getBoundingClientRect();
    const day = (date: number) => box(`[role="columnheader"][aria-colindex="${date - 3}"]`);
    const own = grid().getBoundingClientRect();
    const header = box('[role="rowheader"]');

    expect(dir === "ltr" ? header.left : header.right).toBe(dir === "ltr" ? own.left : own.right);
    expect(dir === "ltr" ? day(6).left - day(5).right : day(5).left - day(6).right).toBe(0);
    // A bar starts 2px past its day's 1px grid line, from the reading start.
    const audit = bar("Audit").getBoundingClientRect();
    const thursday = day(8);
    expect(
      Math.round(dir === "ltr" ? audit.left - thursday.left : thursday.right - audit.right),
    ).toBe(3);

    viewport().scrollLeft = dir === "ltr" ? 300 : -300;
    await frame();
    await settled();
    expect(dir === "ltr" ? box('[role="rowheader"]').left : box('[role="rowheader"]').right).toBe(
      dir === "ltr" ? own.left : own.right,
    );
  });
});

describe("the Solid timeline's keyboard in a real browser", () => {
  test("one tab stop; Space grabs an event, ArrowDown moves it to the next room, Enter drops it", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <Timeline onEventChange={onEventChange} view="timeline-week" />);
    await opened("timeline-week");

    expect(tabStops()).toHaveLength(1);
    tabStops()[0]!.focus();
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Site 1, expanded, Thursday, October 8, 2026",
    );
    await press("ArrowDown");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Room 1.1, Thursday, October 8, 2026",
    );
    await press("Enter");
    expect(document.activeElement?.getAttribute("data-event-id")).toBe("Standup");
    await press(" ");
    await press("ArrowDown");
    await press("Enter");

    await until(() =>
      expect(placed(onEventChange)).toBe(
        "move 2026-10-08T09:00:00Z/2026-10-08T10:00:00Z site-0-room-1",
      ),
    );
    expect(spoken()).toBe("Moved Standup to Thursday, October 8, 9:00 – 10:00 AM, Room 1.2.");
  });

  test("Escape cancels a grab, and Shift+Enter on a group's cell collapses it", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <Timeline onEventChange={onEventChange} view="timeline-week" />);
    await opened("timeline-week");
    tabStops()[0]!.focus();
    await press("ArrowDown");
    await press("Enter");
    await press(" ");
    await press("ArrowDown");
    await press("Escape");

    expect(onEventChange).not.toHaveBeenCalled();
    expect(document.activeElement?.getAttribute("data-event-id")).toBe("Standup");
    expect(document.activeElement?.closest('[role="row"]')).toBe(row("Room 1.1"));
    expect(spoken()).toBe("Cancelled. Standup is back where it was.");

    await press("Escape");
    await press("ArrowUp");
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Site 1, expanded, Thursday, October 8, 2026",
    );
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Enter",
        shiftKey: true,
      }),
    );
    await settled();
    await until(() => expect(grid().querySelector('[aria-label="Expand Site 1"]')).not.toBeNull());
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Site 1, collapsed, Thursday, October 8, 2026",
    );
    expect(row("Room 1.1")).toBeNull();
  });
});

describe.each(["snapped", "free"] as const)("the Solid timeline's %s drag preview", (preview) => {
  test("moves a bar to another room, adding only the preview to the grid", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => (
      <Timeline dragPreview={preview} onEventChange={onEventChange} view="timeline-week" />
    ));
    await opened("timeline-week");
    const cells = [...grid().querySelectorAll('[role="gridcell"]')];
    const [x, y] = middle(bar("Audit"));
    const to: [number, number] = [x + 96, middle(row("Room 2.2"))[1]];
    const watch = watchGrid();

    const end = await dragTo([x, y], to);
    try {
      expect(grid().getAttribute("data-interaction")).toBe("move");
      const ghosts = [...document.querySelectorAll("[data-calendar-ghost]")].map((ghost) =>
        ghost.getAttribute("data-calendar-ghost"),
      );
      expect(ghosts.includes("landing")).toBe(preview === "free");
      expect(ghosts.length).toBeGreaterThan(0);
      expect(watch.changed()).toEqual([]);
      expect([...grid().querySelectorAll('[role="gridcell"]')]).toEqual(cells);
    } finally {
      watch.stop();
      fire("pointerup", end);
    }

    await until(() => expect(onEventChange).toHaveBeenCalled());
    expect(placed(onEventChange)).toBe(
      "move 2026-10-09T10:00:00Z/2026-10-09T11:00:00Z site-1-room-1",
    );
    await until(() => expect(document.querySelector("[data-calendar-ghost]")).toBeNull());
  });

  test("resizes a bar from its end along an hour row", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => (
      <Timeline dragPreview={preview} onEventChange={onEventChange} view="timeline-day" />
    ));
    await opened("timeline-day");
    const [x, y] = middle(bar("Audit").querySelector('[data-resize="end"]')!);
    // To 1:10 PM, which snaps to 1 PM.
    const to: [number, number] = [x + 3 + (2 + 10 / 60) * slotWidth(), y];
    const watch = watchGrid();

    const end = await dragTo([x, y], to);
    try {
      expect(grid().getAttribute("data-interaction")).toBe("resize");
      expect(watch.changed()).toEqual([]);
    } finally {
      watch.stop();
      fire("pointerup", end);
    }

    await until(() => expect(onEventChange).toHaveBeenCalled());
    expect(placed(onEventChange)).toBe(
      "resize-end 2026-10-08T10:00:00Z/2026-10-08T13:00:00Z site-1-room-2",
    );
  });

  test("creates an event across empty hours of a room", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => (
      <Timeline dragPreview={preview} onEventChange={onEventChange} view="timeline-day" />
    ));
    await opened("timeline-day");
    // From 10:30 AM, beside the audit, to 1:25 PM: the new event ends at 1:30 PM.
    const [x] = middle(bar("Audit"));
    const [, roomY] = middle(row("Room 2.2"));
    const to: [number, number] = [x + (2 + 55 / 60) * slotWidth(), roomY];
    const watch = watchGrid();

    const end = await dragTo([x, roomY], to);
    try {
      expect(grid().getAttribute("data-interaction")).toBe("create");
      expect(watch.changed()).toEqual([]);
    } finally {
      watch.stop();
      fire("pointerup", end);
    }

    await until(() => expect(onEventChange).toHaveBeenCalled());
    expect(placed(onEventChange)).toBe(
      "create 2026-10-08T10:30:00Z/2026-10-08T13:30:00Z site-1-room-1",
    );
  });
});

// A phone's coarse pointer needs Chromium's touch emulation through CDP.
describe.runIf(server.browser === "chromium")("the Solid timeline on a 375 px touch screen", () => {
  beforeAll(async () => {
    await page.viewport(375, 667);
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  });
  afterAll(async () => {
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await page.viewport(1280, 800);
  });

  test("the resource column narrows, bars are 24 px tall, and the grid selects no text", async () => {
    await render(() => <Timeline size="h-[600px] w-[375px]" view="timeline-day" />);
    await opened("timeline-day");

    expect(grid().querySelector<HTMLElement>('[role="rowheader"]')!.offsetWidth).toBe(128);
    for (const target of grid().querySelectorAll<HTMLElement>("[data-event-id]")) {
      expect(target.offsetHeight).toBe(24);
    }
    expect(getComputedStyle(grid()).userSelect).toBe("none");
  });
});

describe.runIf(server.browser === "chromium")("the Solid timeline with reduced motion", () => {
  beforeAll(async () => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
  });
  afterAll(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  });

  test("a drag's preview jumps between slots, without a transition", async () => {
    expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    await render(() => <Timeline onEventChange={() => {}} view="timeline-week" />);
    await opened("timeline-week");
    const [x, y] = middle(bar("Audit"));

    const end = await dragTo([x, y], [x + 96, y]);
    try {
      const ghost = document.querySelector<HTMLElement>("[data-calendar-ghost]")!;
      expect(getComputedStyle(ghost).transitionDuration).toBe("0s");
    } finally {
      fire("pointerup", end);
    }
  });
});

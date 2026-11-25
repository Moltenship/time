import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEventChange,
} from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { cdp, page, server } from "vite-plus/test/browser";

import { calendarAnnouncements } from "@registry/shared/calendar/announcements";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";

import { seriousViolations, setTheme, themes } from "../axe";
import { describeLayout } from "../kit-twins";
import {
  columnsAnchor,
  columnsAvailability,
  columnsBookings,
  columnsExpanded,
  columnsNow,
  columnsResources,
  columnsWeekRules,
  type ColumnsBooking,
  type ColumnsResource,
} from "../resource-columns-fixture";
import resourceColumnsCollapsed from "../view-twins/resource-columns-collapsed.txt?raw";
import resourceColumnsDays from "../view-twins/resource-columns-days.txt?raw";
import resourceColumns from "../view-twins/resource-columns.txt?raw";
import { atRest, press, render, settled, until } from "./render";

// The Solid registry's resource columns in a real browser, against what React's files check
// (resource-columns-twins, rtl-layout, availability, phone-layout, interactions and reduced-motion):
// they render React's grids, pass axe in both themes, mirror in RTL, shade each resource's own
// hours, move events across resources by pointer in both preview modes without re-rendering the
// grid and by keyboard, draft by keyboard, and their targets are 24 px on a phone.

type Change = CalendarEventChange<ColumnsBooking, string, string>;

const getEventColor = (event: ColumnsBooking) => event.data.color;
const eventAdapter = createCanonicalEventAdapter<
  { readonly color: CalendarEventColor },
  string,
  string
>();
const OneDay = createCalendar<ColumnsBooking, ColumnsResource>()({
  eventAdapter,
  views: [
    createResourceColumnsView<ColumnsBooking>({
      getEventColor,
      resourceStatus: true,
      unassigned: "bucket",
    }),
  ],
});
const ThreeDays = createCalendar<ColumnsBooking, ColumnsResource>()({
  eventAdapter,
  views: [createResourceColumnsView<ColumnsBooking>({ getEventColor }, 3)],
});

function Columns(props: {
  readonly days?: 1 | 3;
  readonly dir?: "ltr" | "rtl";
  readonly dragPreview?: "free" | "snapped";
  readonly onEventChange?: (change: Change) => void;
  readonly size?: string;
}) {
  const Calendar = props.days === 3 ? ThreeDays : OneDay;
  // Saves each change, as an app does, so focus and the grid follow a dropped event.
  const [events, setEvents] = createSignal<readonly ColumnsBooking[]>(columnsBookings);
  const save = (change: Change) => {
    props.onEventChange?.(change);
    const proposed = change.proposed;
    if (proposed == null || change.eventId === null) return;
    setEvents((all) =>
      all.map((event) =>
        event.id === change.eventId ? ({ ...event, ...proposed } as ColumnsBooking) : event,
      ),
    );
  };
  return (
    <Calendar.Root
      availability={columnsAvailability}
      defaultAnchorDate={columnsAnchor}
      defaultExpandedResourceIds={columnsExpanded}
      defaultTimeZone="UTC"
      defaultView="resources"
      direction={props.dir ?? "ltr"}
      events={events()}
      locale="en-US"
      now={columnsNow}
      onEventChange={save}
      resources={columnsResources}
      viewOptions={{ resources: { dragPreview: props.dragPreview } }}
      weekRules={columnsWeekRules}
    >
      <Calendar.Frame
        class={props.size ?? "flex h-[600px] w-[1000px] flex-col"}
        dir={props.dir ?? "ltr"}
      >
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
      <Calendar.Announcer messages={calendarAnnouncements} />
    </Calendar.Root>
  );
}

const grid = () => document.querySelector<HTMLElement>('[data-slot="resource-columns"]')!;
const body = () => document.querySelector<HTMLElement>('[data-slot="resource-columns-body"]')!;
/** A resource's column of the day. */
const column = (resourceId: string) =>
  body().querySelector<HTMLElement>(`[data-resource-id="${resourceId}"] [data-date]`)!;
const chip = (id: string, within: Element = grid()) =>
  within.querySelector<HTMLElement>(`[data-event-id="${id}"]`)!;
const label = () => document.activeElement?.getAttribute("aria-label")?.replace(/\s/g, " ");
const focusedResource = () =>
  document.activeElement?.closest("[data-resource-id]")?.getAttribute("data-resource-id");
const spoken = () =>
  document
    .querySelector('[data-calendar-part="announcer"]')
    ?.textContent?.replace(/\s/g, " ")
    .trim();

/** Opened on now, with the columns measured. */
async function opened() {
  await until(() => expect(grid().querySelector('[data-event-id="Audit"]')).not.toBeNull());
  await until(() => expect(body().scrollTop).toBeGreaterThan(0));
  await atRest(body());
}

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

/** A point `hours` below `point`, on the grid's scale of 24 hours to a column. */
function below([x, y]: readonly [number, number], hours: number): [number, number] {
  const box = column("ada").getBoundingClientRect();
  return [x, y + (hours * box.height) / 24];
}

/** A point at `time` in a resource's column, a quarter of the way across it. */
function at(resourceId: string, time: string): [number, number] {
  const box = column(resourceId).getBoundingClientRect();
  const { hour, minute } = Temporal.PlainTime.from(time);
  return [box.left + box.width / 4, box.top + ((hour * 60 + minute) / 1440) * box.height];
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

/** The grid's elements a drag changed, other than the pointer layer's ghosts and their insides. */
function watchGrid() {
  const changed = new Set<Node>();
  const ghosts = "[data-calendar-ghost], [data-calendar-ghost-origin]";
  const ghost = (node: Node) => node instanceof Element && node.matches(ghosts);
  // A ghost's time label follows the range it would land on, and the header's status the draft.
  const followsDraft = (node: Node) =>
    (node instanceof Element ? node : node.parentElement)?.closest(
      `${ghosts}, [data-slot="resource-status"]`,
    ) != null;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (followsDraft(record.target)) continue;
      if (![...record.addedNodes, ...record.removedNodes].every(ghost)) changed.add(record.target);
    }
  });
  observer.observe(grid(), { childList: true, subtree: true });
  return { changed, stop: () => observer.disconnect() };
}

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("the Solid resource columns render React's", () => {
  test("a day, a column per resource, with each one's status and hours", async () => {
    await render(() => <Columns />);
    await opened();
    expect(describeLayout(grid())).toBe(resourceColumns);
  });

  test("three days per resource, and the team collapsed from its toggle", async () => {
    await render(() => <Columns days={3} />);
    await opened();
    expect(describeLayout(grid())).toBe(resourceColumnsDays);

    grid().querySelector<HTMLElement>('[aria-label="Collapse Team"]')!.click();
    await settled();
    await until(() => expect(grid().querySelector('[aria-label="Expand Team"]')).not.toBeNull());
    await atRest(body());
    expect(describeLayout(grid())).toBe(resourceColumnsCollapsed);
  });
});

describe.each(themes)("the Solid resource columns, %s theme", (theme) => {
  test.each([1, 3] as const)("%i day(s) a resource has no serious violations", async (days) => {
    setTheme(theme);
    await render(() => <Columns days={days} />);
    await opened();

    expect(await seriousViolations()).toEqual([]);
  });
});

describe.each(["ltr", "rtl"] as const)("the Solid resource columns, %s", (dir) => {
  const px = (value: number) => Math.round(value) + 0;
  /** Inline distance from the end of `first` to the start of `second`, in reading order. */
  const gap = (first: DOMRect, second: DOMRect) =>
    px(dir === "ltr" ? second.left - first.right : first.left - second.right);
  const box = (resourceId: string) =>
    body().querySelector(`[data-resource-id="${resourceId}"]`)!.getBoundingClientRect();
  const header = (title: string) =>
    grid()
      .querySelector(`[role="columnheader"] [title="${title}"]`)!
      .closest('[role="columnheader"]')!
      .getBoundingClientRect();

  test("gutter, resource columns and their headers follow the reading order", async () => {
    await render(() => <Columns dir={dir} />);
    await opened();

    expect(
      gap(grid().querySelector('[role="rowheader"]')!.getBoundingClientRect(), box("team")),
    ).toBe(0);
    expect(gap(box("team"), box("ada"))).toBe(0);
    expect(gap(box("ada"), box("grace"))).toBe(0);
    // Each header sits over its column.
    for (const [id, title] of [
      ["ada", "Ada"],
      ["borealis", "Borealis"],
    ] as const) {
      expect(px(header(title).left)).toBe(px(box(id).left));
      expect(px(header(title).right)).toBe(px(box(id).right));
    }
  });

  test("scrolling sideways moves the headers with the columns", async () => {
    await render(() => <Columns days={3} dir={dir} />);
    await opened();
    const before = header("Ada").left - box("ada").left;

    body().scrollLeft = dir === "ltr" ? 300 : -300;
    await frame();
    await settled();
    await atRest(body());

    expect(px(header("Ada").left - box("ada").left)).toBe(px(before));
  });
});

describe("the Solid resource columns' own hours", () => {
  test("each resource's closed time is shaded from its own hours", async () => {
    await render(() => <Columns />);
    await opened();
    // Where each band starts and how tall it is, in hours; engines print the percentages apart.
    const hours = (percent: string) => Math.round((parseFloat(percent) * 24) / 100);
    const bands = (resourceId: string) =>
      [
        ...column(resourceId).querySelectorAll<HTMLElement>('[data-slot="time-grid-unavailable"]'),
      ].map((band) => [hours(band.style.top), hours(band.style.height)]);

    // The calendar's 09:00 to 17:00, and Borealis's own 12:00 to 20:00.
    expect(bands("ada")).toEqual([
      [0, 9],
      [17, 7],
    ]);
    expect(bands("borealis")).toEqual([
      [0, 12],
      [20, 4],
    ]);
  });
});

describe.each(["snapped", "free"] as const)(
  "the Solid resource columns' %s drag preview",
  (preview) => {
    test("moves an event to another resource's column without re-rendering the grid", async () => {
      const onEventChange = vi.fn<(change: Change) => void>();
      await render(() => <Columns dragPreview={preview} onEventChange={onEventChange} />);
      await opened();
      const cells = [...grid().querySelectorAll('[role="gridcell"]')];
      const from = middle(chip("Audit"));
      // An hour later, in Aurora's column.
      const to: [number, number] = [middle(column("aurora"))[0], below(from, 1)[1]];
      const watch = watchGrid();

      await dragTo(from, to);
      try {
        expect(grid().getAttribute("data-interaction")).toBe("move");
        const ghosts = [...document.querySelectorAll("[data-calendar-ghost]")].map((ghost) =>
          ghost.getAttribute("data-calendar-ghost"),
        );
        expect(ghosts.includes("landing")).toBe(preview === "free");
        expect(ghosts.length).toBeGreaterThan(0);
        expect([...watch.changed]).toEqual([]);
        expect([...grid().querySelectorAll('[role="gridcell"]')]).toEqual(cells);
      } finally {
        watch.stop();
        fire("pointerup", to);
      }

      await until(() =>
        expect(placed(onEventChange)).toBe("move 2026-10-08T15:00:00Z/2026-10-08T16:00:00Z aurora"),
      );
      expect(onEventChange).toHaveBeenCalledTimes(1);
      await until(() => expect(document.querySelector("[data-calendar-ghost]")).toBeNull());
      await until(() => expect(chip("Audit", column("aurora"))).not.toBeNull());
      expect(spoken()).toBe("Moved Audit to Thursday, October 8, 3:00 – 4:00 PM, Aurora.");
    });

    test("drags an event's end handle to make it longer", async () => {
      const onEventChange = vi.fn<(change: Change) => void>();
      await render(() => <Columns dragPreview={preview} onEventChange={onEventChange} />);
      await opened();
      const from = middle(chip("Audit").querySelector('[data-resize="end"]')!);

      await dragTo(from, below(from, 1));
      expect(grid().getAttribute("data-interaction")).toBe("resize");
      fire("pointerup", below(from, 1));

      await until(() =>
        expect(placed(onEventChange)).toBe(
          "resize-end 2026-10-08T14:00:00Z/2026-10-08T16:00:00Z borealis",
        ),
      );
    });

    test("drags across a resource's empty time to create an event there", async () => {
      const onEventChange = vi.fn<(change: Change) => void>();
      await render(() => <Columns dragPreview={preview} onEventChange={onEventChange} />);
      await opened();
      const from = at("grace", "11:05");
      const to = at("grace", "12:20");

      await dragTo(from, to);
      expect(grid().getAttribute("data-interaction")).toBe("create");
      expect(document.querySelector("[data-calendar-ghost]")).not.toBeNull();
      fire("pointerup", to);

      await until(() =>
        expect(placed(onEventChange)).toBe(
          "create 2026-10-08T11:00:00Z/2026-10-08T12:30:00Z grace",
        ),
      );
    });
  },
);

describe("the Solid resource columns' keyboard in a real browser", () => {
  test("one tab stop; the arrow keys cross resources, past the last to the next day", async () => {
    await render(() => <Columns />);
    await opened();
    const stops = grid().querySelectorAll<HTMLElement>('[tabindex="0"]');

    expect(stops).toHaveLength(1);
    stops[0]!.focus();
    expect(label()).toBe("Team, Thursday, October 8, 2026, no all-day events");
    await press("ArrowDown");
    expect(label()).toBe("Team, Thursday, October 8 at 12:00 AM, outside working hours");
    await press("ArrowRight");
    expect([label(), focusedResource()]).toEqual([
      "Ada, Thursday, October 8 at 12:00 AM, outside working hours",
      "ada",
    ]);
    await press("End");
    expect(focusedResource()).toBe("");
    await press("ArrowRight");
    await until(() => expect(grid().getAttribute("aria-label")).toBe("October 9, 2026"));
    expect(focusedResource()).toBe("team");
  });

  test("Space grabs an event, ArrowRight moves it to the next resource, Enter drops it", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <Columns onEventChange={onEventChange} />);
    await opened();
    chip("Standup").focus();

    await press(" ");
    expect(spoken()).toBe(
      "Picked up Standup, Thursday, October 8, 9:00 – 10:00 AM, Ada. Use the arrow keys to move it, then Enter to drop it or Escape to cancel.",
    );
    await press("ArrowRight");
    expect(spoken()).toBe("Thursday, October 8, 9:00 – 10:00 AM, Grace");
    await press("Enter");

    await until(() =>
      expect(placed(onEventChange)).toBe("move 2026-10-08T09:00:00Z/2026-10-08T10:00:00Z grace"),
    );
    await until(() => expect(focusedResource()).toBe("grace"));
    expect(document.activeElement?.getAttribute("data-event-id")).toBe("Standup");
    expect(spoken()).toBe("Moved Standup to Thursday, October 8, 9:00 – 10:00 AM, Grace.");
  });

  test("Escape cancels a grab and puts focus back on the event in its column", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <Columns onEventChange={onEventChange} />);
    await opened();
    chip("Standup").focus();
    await press(" ");
    await press("ArrowRight");
    await press("Escape");

    expect(onEventChange).not.toHaveBeenCalled();
    expect([document.activeElement?.getAttribute("data-event-id"), focusedResource()]).toEqual([
      "Standup",
      "ada",
    ]);
    expect(spoken()).toBe("Cancelled. Standup is back where it was.");
  });

  test("Space on a resource's slot drafts an event there that Enter creates", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <Columns onEventChange={onEventChange} />);
    await opened();
    grid().querySelector<HTMLElement>('[tabindex="0"]')!.focus();
    await press("ArrowDown");
    await press("ArrowRight");
    await press("ArrowRight");
    expect(label()).toBe("Grace, Thursday, October 8 at 12:00 AM, outside working hours");

    await press(" ");
    expect(column("grace").querySelector('[data-slot="time-grid-draft"]')).not.toBeNull();
    // The header says whether Grace is free while the draft is placed.
    expect(
      grid()
        .querySelector('[title="Grace"]')!
        .closest('[role="columnheader"]')!
        .querySelector('[data-slot="resource-status"]')
        ?.getAttribute("data-state"),
    ).toBe("outside-hours");
    await press("ArrowDown");
    await press("Enter");

    await until(() =>
      expect(placed(onEventChange)).toBe("create 2026-10-08T00:00:00Z/2026-10-08T01:15:00Z grace"),
    );
    expect(grid().querySelector('[data-slot="time-grid-draft"]')).toBeNull();
  });
});

/** The pointer targets in view smaller than 24 × 24 px, and not spaced as WCAG 2.5.8 allows. */
function undersizedTargets(): string[] {
  const targets = [
    ...document.querySelectorAll<HTMLElement>("a[href], button, [role='button'], [data-event-id]"),
  ]
    .filter((element) => getComputedStyle(element).pointerEvents !== "none")
    .map((element) => ({ box: element.getBoundingClientRect(), element }))
    .filter(
      ({ box }) =>
        box.width > 0 &&
        box.bottom > 0 &&
        box.top < innerHeight &&
        box.right > 0 &&
        box.left < innerWidth,
    );
  // A timed event's box is its time span, which excuses its height but not its width.
  const spansTime = (element: HTMLElement) =>
    element.hasAttribute("data-event-id") &&
    element.closest("[data-date]:not([data-all-day])") !== null;
  const small = targets.filter(
    ({ box, element }) => box.width < 24 || (box.height < 24 && !spansTime(element)),
  );
  const centre = ({ box }: (typeof targets)[number]) =>
    [box.left + box.width / 2, box.top + box.height / 2] as const;
  const nested = (a: HTMLElement, b: HTMLElement) => a === b || a.contains(b) || b.contains(a);
  return small
    .filter((target) => {
      const [x, y] = centre(target);
      const reachesTarget = targets.some(
        ({ box, element }) =>
          !nested(element, target.element) &&
          Math.hypot(
            Math.max(box.left - x, 0, x - box.right),
            Math.max(box.top - y, 0, y - box.bottom),
          ) < 12,
      );
      const reachesCircle = small.some((other) => {
        if (nested(other.element, target.element)) return false;
        const [ox, oy] = centre(other);
        return Math.hypot(x - ox, y - oy) < 24;
      });
      return reachesTarget || reachesCircle;
    })
    .map(({ box, element }) => {
      const name = element.getAttribute("aria-label") ?? element.textContent ?? "";
      return `${name.trim().slice(0, 30)} ${Math.round(box.width)}×${Math.round(box.height)}`;
    });
}

// A phone's coarse pointer needs Chromium's touch emulation through CDP.
describe.runIf(server.browser === "chromium")(
  "the Solid resource columns on a 375 px touch screen",
  () => {
    beforeAll(async () => {
      await page.viewport(375, 667);
      await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    });
    afterAll(async () => {
      await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await page.viewport(1280, 800);
    });

    test("columns keep their width and scroll sideways, and targets are 24 px", async () => {
      await render(() => <Columns size="flex h-[600px] w-[375px] flex-col" />);
      await opened();

      expect(column("ada").offsetWidth).toBe(128);
      expect(body().scrollWidth).toBeGreaterThan(body().clientWidth);
      expect(undersizedTargets()).toEqual([]);
    });

    test("a long-press on the grid selects no text", async () => {
      await render(() => <Columns size="flex h-[600px] w-[375px] flex-col" />);

      expect(getComputedStyle(grid()).userSelect).toBe("none");
    });
  },
);

describe.runIf(server.browser === "chromium")(
  "the Solid resource columns with reduced motion",
  () => {
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
      await render(() => <Columns onEventChange={() => {}} />);
      await opened();
      const from = middle(chip("Audit"));
      const to: [number, number] = [middle(column("aurora"))[0], from[1]];

      await dragTo(from, to);
      try {
        const ghost = document.querySelector<HTMLElement>("[data-calendar-ghost]")!;
        expect(getComputedStyle(ghost).transitionDuration).toBe("0s");
      } finally {
        fire("pointerup", to);
      }
    });
  },
);

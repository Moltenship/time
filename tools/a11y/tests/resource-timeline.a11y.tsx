import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarFocus,
  type CalendarResource,
} from "@moltenship/calendar";
import { describe, expect, test, vi } from "vite-plus/test";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import {
  createTimelineDayView,
  createTimelineMonthView,
  createTimelineWeekView,
} from "@registry/resource-timeline-view/resource-timeline-view";

import { seriousViolations, setTheme, themes } from "./axe";
import { render } from "./render";

type Booking = CalendarEvent<{ readonly color: CalendarEventColor }, string, string>;

/** Ten sites of four rooms, the second site collapsed. */
const resources: readonly CalendarResource<null>[] = Array.from({ length: 10 }, (_, site) => [
  { data: null, id: `site-${site}`, title: `Site ${site + 1}` },
  ...Array.from({ length: 4 }, (_, room) => ({
    data: null,
    id: `site-${site}-room-${room}`,
    parentId: `site-${site}`,
    title: `Room ${site + 1}.${room + 1}`,
  })),
]).flat();

function booking(
  color: CalendarEventColor,
  title: string,
  resourceIds: readonly string[],
  start: string,
  hours: number,
): Booking {
  const from = Temporal.Instant.from(start);
  return {
    data: { color },
    end: from.add({ minutes: hours * 60 }),
    id: title,
    kind: "timed",
    resourceIds,
    start: from,
    title,
  };
}

const events: readonly Booking[] = [
  booking("blue", "Standup", ["site-0-room-0"], "2026-10-06T09:00:00Z", 1),
  booking("green", "Review", ["site-0-room-0", "site-0-room-2"], "2026-10-06T13:00:00Z", 2),
  booking("purple", "Workshop", ["site-0-room-1"], "2026-10-07T09:00:00Z", 30),
  booking("orange", "Audit", ["site-2-room-3"], "2026-10-08T10:00:00Z", 1),
  booking("pink", "Check-in", ["site-0-room-3"], "2026-10-08T08:00:00Z", 0.25),
  booking("teal", "Lunch", [], "2026-10-09T12:00:00Z", 1),
];

const getEventColor = (event: Booking) => event.data.color;
const Calendar = createCalendar<Booking, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<
    { readonly color: CalendarEventColor },
    string,
    string
  >(),
  views: [
    createTimelineWeekView<Booking>({ getEventColor, unassigned: "bucket" }),
    createTimelineMonthView<Booking>({ getEventColor }),
    createTimelineDayView<Booking>({ getEventColor }),
  ],
});

function Timeline({
  defaultFocus = null,
  direction = "ltr",
  onEventChange,
  shown = events,
  size = "h-[600px] w-[1000px]",
  view,
}: {
  readonly defaultFocus?: CalendarFocus | null;
  readonly direction?: "ltr" | "rtl";
  readonly onEventChange?: () => void;
  readonly shown?: readonly Booking[];
  readonly size?: string;
  readonly view: "timeline-day" | "timeline-month" | "timeline-week";
}) {
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultFocus={defaultFocus}
      defaultExpandedResourceIds={resources
        .filter(({ id, parentId }) => parentId === undefined && id !== "site-1")
        .map(({ id }) => id)}
      defaultTimeZone="UTC"
      defaultView={view}
      direction={direction}
      events={shown}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T10:20:00Z")}
      onEventChange={onEventChange}
      resources={resources}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame className={size} dir={direction}>
        <Calendar.ActiveView />
      </Calendar.Frame>
    </Calendar.Root>
  );
}

describe.each(themes)("resource timeline, %s theme", (theme) => {
  test.each(["timeline-day", "timeline-week", "timeline-month"] as const)("%s", async (view) => {
    setTheme(theme);
    await render(<Timeline view={view} />);

    expect(document.querySelectorAll("[data-event-id]").length).toBeGreaterThan(0);
    expect(await seriousViolations()).toEqual([]);
  });
});

test("RTL: days run from the right, behind a resource column that stays there", async () => {
  await render(<Timeline direction="rtl" view="timeline-month" />);
  const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
  const fullDate = new Intl.DateTimeFormat("en-US", { dateStyle: "full" });
  const day = (date: number) =>
    box(
      `[role="columnheader"][aria-label="${fullDate.format(new Temporal.PlainDate(2026, 10, date))}"]`,
    );
  const grid = box('[role="grid"]');
  const viewport = document.querySelector<HTMLElement>('[data-slot="resource-timeline-viewport"]')!;

  expect(box('[role="rowheader"]').right).toBe(grid.right);
  expect(day(2).right).toBe(day(1).left);
  // A bar starts 2px past its day's 1px grid line, and its accent border is on the right.
  const standup = document.querySelector<HTMLElement>('[data-event-id="Standup"]')!;
  expect(Math.round(day(6).right - standup.getBoundingClientRect().right)).toBe(3);
  expect(getComputedStyle(standup).borderRightWidth).toBe("3px");

  viewport.scrollLeft = -300;
  await new Promise((resolve) => requestAnimationFrame(resolve));

  expect(box('[role="rowheader"]').right).toBe(grid.right);
  expect(day(1).right).toBe(grid.right - 208 + 300);
});

test("the sticky header and resource column hide the cells scrolled beneath them from drags", async () => {
  const onEventChange = vi.fn();
  await render(<Timeline onEventChange={onEventChange} view="timeline-month" />);
  const grid = document.querySelector<HTMLElement>('[data-slot="resource-timeline"]')!;
  const viewport = grid.querySelector<HTMLElement>('[data-slot="resource-timeline-viewport"]')!;
  viewport.scrollTop = 100;
  viewport.scrollLeft = 200;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  /** A mouse drag from one point to another, through real hit testing. */
  async function dragFrom(from: readonly [number, number], to: readonly [number, number]) {
    const fire = (type: string, [x, y]: readonly [number, number]) =>
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
    fire("pointerdown", from);
    fire("pointermove", [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]);
    fire("pointermove", to);
    await frame();
    const interaction = grid.getAttribute("data-interaction");
    fire("pointerup", to);
    await frame();
    return interaction;
  }
  const center = (element: Element) => {
    const { height, left, top, width } = element.getBoundingClientRect();
    return [left + width / 2, top + height / 2] as const;
  };
  const header = grid
    .querySelector('[data-slot="resource-timeline-header"]')!
    .getBoundingClientRect();
  const rowHeader = grid.querySelector('[role="rowheader"]')!.getBoundingClientRect();

  // Rows and days have scrolled under the header and the resource column.
  const [x] = center(grid.querySelector('[role="columnheader"][aria-colindex="10"]')!);
  expect(await dragFrom([x, header.bottom - 10], [x + 96, header.bottom - 10])).toBeNull();
  expect(
    await dragFrom(
      [rowHeader.left + 150, rowHeader.top + 20],
      [rowHeader.left + 190, rowHeader.top + 20],
    ),
  ).toBeNull();
  // A bar dropped on the header lands nowhere.
  const bar = [...grid.querySelectorAll("[data-event-id]")].find(
    (element) => element.getBoundingClientRect().top > header.bottom,
  )!;
  const [barX, barY] = center(bar);
  expect(await dragFrom([barX, barY], [barX, header.bottom - 10])).toBe("move");
  expect(grid.querySelectorAll("[data-calendar-ghost]")).toHaveLength(0);
  expect(onEventChange).not.toHaveBeenCalled();
});

const tabStops = () => document.querySelectorAll('[data-slot="resource-timeline"] [tabindex="0"]');

test("an empty day keeps one tab stop after it opens on now and scrolls both axes", async () => {
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  await render(<Timeline shown={[]} size="h-[420px] w-[500px]" view="timeline-day" />);
  await frame();
  const viewport = document.querySelector<HTMLElement>('[data-slot="resource-timeline-viewport"]')!;

  // A day opens on the current time, scrolled well past midnight's entry.
  expect(viewport.scrollLeft).toBeGreaterThan(200);
  expect(tabStops()).toHaveLength(1);
  viewport.scrollTop = 400;
  viewport.scrollLeft = 900;
  await frame();
  expect(tabStops()).toHaveLength(1);
  (tabStops()[0] as HTMLElement).focus();
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "Site 1, expanded, Thursday, October 8 at 12:00 AM",
  );
});

test("focus kept from a view without resources leaves one tab stop, on the first row", async () => {
  // A week or month view's day focus names no resource.
  await render(
    <Timeline
      defaultFocus={{ date: Temporal.PlainDate.from("2026-10-06"), kind: "day" }}
      shown={[]}
      view="timeline-week"
    />,
  );

  expect(tabStops()).toHaveLength(1);
  expect(tabStops()[0]?.getAttribute("aria-label")).toBe(
    "Site 1, expanded, Tuesday, October 6, 2026",
  );
});

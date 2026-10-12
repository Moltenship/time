import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarResource,
} from "@moltenship/calendar";
import { describe, expect, test } from "vite-plus/test";

import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { createScrollingWeekView } from "@registry/scrolling-time-grid-view/scrolling-time-grid-view";
import { createDayView, createWeekView } from "@registry/time-grid-view/time-grid-view";
import { TooltipProvider } from "@registry/ui/tooltip";

import { seriousViolations, setTheme, themes } from "./axe";
import { render } from "./render";

type Fixture = CalendarEvent<null, string>;

const Calendar = createCalendar<Fixture, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [
    createWeekView(),
    createDayView(),
    createScrollingWeekView(),
    createResourceColumnsView(),
  ],
});
type View = (typeof Calendar.views)[number]["name"];

const views = ["week", "day", "scrolling-week", "resources"] as const satisfies readonly View[];
const resources: readonly CalendarResource<null>[] = [
  { data: null, id: "ada", title: "Ada" },
  { data: null, id: "grace", title: "Grace" },
];

const events: readonly Fixture[] = [
  ["standup", "2026-10-29T08:00:00Z", "2026-10-29T08:30:00Z"],
  ["sync", "2026-11-01T15:00:00Z", "2026-11-01T16:00:00Z"],
].map(([id, start, end]) => ({
  data: null,
  end: Temporal.Instant.from(end!),
  id: id!,
  kind: "timed",
  resourceIds: ["ada"],
  start: Temporal.Instant.from(start!),
  title: id!,
}));

/**
 * The week New York leaves daylight saving time, a week after Berlin: Sunday's times shift. India
 * is off the hour, and its labels are the widest: "12:30 AM+1".
 */
function Screen({
  dir,
  view,
  width,
}: {
  readonly dir?: "ltr" | "rtl";
  readonly view: View;
  /** The calendar's width in px; the page's by default. */
  readonly width?: number;
}) {
  return (
    <TooltipProvider>
      <Calendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-29")}
        defaultTimeZone="Europe/Berlin"
        defaultView={view}
        direction={dir}
        events={events}
        locale="en-US"
        now={Temporal.Instant.from("2026-10-29T08:30:00Z")}
        resources={resources}
        secondaryTimeZones={["America/New_York", { label: "Kolkata", timeZone: "Asia/Kolkata" }]}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Calendar.Frame className="flex h-dvh flex-col" dir={dir} style={{ width }}>
          <Calendar.Viewport className="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </Calendar.Frame>
      </Calendar.Root>
    </TooltipProvider>
  );
}

describe.each(themes)("secondary time zones, %s theme", (theme) => {
  test.each(views)("the %s view has no serious violations", async (view) => {
    setTheme(theme);
    await render(<Screen view={view} />);

    expect(document.querySelectorAll('[data-slot="time-grid-zone-hours"]')).toHaveLength(2);
    expect(await seriousViolations()).toEqual([]);
  });
});

describe.each(["ltr", "rtl"] as const)("secondary time zone layout, %s", (dir) => {
  test.each(views)("the %s view fits each label in its column, under its name", async (view) => {
    await render(<Screen dir={dir} view={view} />);
    const columns = [...document.querySelectorAll('[data-slot="time-grid-zone-hours"]')];
    const names = [...document.querySelectorAll('[data-slot="time-grid-zone-label"]')];

    expect(columns).toHaveLength(2);
    for (const [index, column] of columns.entries()) {
      const box = column.getBoundingClientRect();
      const name = names[index]!.getBoundingClientRect();
      // The name sits over its hours, and no label spills out of its column.
      expect(Math.round(name.left)).toBe(Math.round(box.left));
      expect(Math.round(name.right)).toBe(Math.round(box.right));
      for (const label of column.children) {
        const { left, right } = label.getBoundingClientRect();
        expect(left).toBeGreaterThanOrEqual(box.left - 0.5);
        expect(right).toBeLessThanOrEqual(box.right + 0.5);
      }
    }
    // The secondary zones come first along the inline axis, the display zone's hours last.
    const [first, second] = columns.map((column) => column.getBoundingClientRect());
    expect(dir === "ltr" ? first!.left < second!.left : first!.left > second!.left).toBe(true);
  });
});

test("day notes stay inside their day's header in a narrow week", async () => {
  // Seven days beside the 12rem gutter in 400px leave each day about 30px, less than "EST -1h".
  await render(<Screen view="week" width={400} />);
  const notes = [...document.querySelectorAll('[data-slot="time-grid-zone-note"] > span')];

  expect(notes.length).toBeGreaterThan(0);
  for (const note of notes) {
    const header = note.closest('[role="columnheader"]')!.getBoundingClientRect();
    const { left, right } = note.getBoundingClientRect();
    expect(left).toBeGreaterThanOrEqual(header.left - 0.5);
    expect(right).toBeLessThanOrEqual(header.right + 0.5);
  }
});

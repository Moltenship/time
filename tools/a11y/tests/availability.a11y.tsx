import {
  availabilityPolicy,
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarAvailability,
  type CalendarEvent,
  type CalendarResource,
} from "@moltenship/calendar";
import { describe, expect, test } from "vite-plus/test";

import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { createTimelineDayView } from "@registry/resource-timeline-view/resource-timeline-view";
import { createWeekView } from "@registry/time-grid-view/time-grid-view";

import { render } from "./render";

type Meeting = CalendarEvent<null, string>;

const Calendar = createCalendar<Meeting, never>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [createWeekView<Meeting>()],
});
const officeHours: CalendarAvailability = {
  weekly: [
    {
      days: [1, 2, 3, 4, 5],
      end: Temporal.PlainTime.from("17:00"),
      start: Temporal.PlainTime.from("09:00"),
    },
  ],
};
const review: Meeting = {
  data: null,
  end: Temporal.Instant.from("2026-10-08T15:30:00Z"),
  id: "review",
  kind: "timed",
  start: Temporal.Instant.from("2026-10-08T15:00:00Z"),
  title: "Review",
};
const policies = [availabilityPolicy<Meeting, string, string>()];

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

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

/** Starts a drag at `from` and holds it at `to`; returns how its preview is outlined. */
async function previewOutline(from: readonly [number, number], to: readonly [number, number]) {
  fire("pointerdown", from);
  fire("pointermove", [from[0], from[1] + 10]);
  fire("pointermove", to);
  await frame();
  const ghost = document.querySelector("[data-calendar-ghost]");
  const { outlineColor, outlineStyle, outlineWidth } = getComputedStyle(ghost!);
  fire("pointerup", to);
  await frame();
  return {
    ghost: ghost?.getAttribute("data-calendar-ghost"),
    outlineColor,
    outlineStyle,
    outlineWidth,
  };
}

test("drag previews outside working hours are outlined in dashes", async () => {
  await render(
    <Calendar.Root
      availability={officeHours}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      events={[review]}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T14:00:00Z")}
      onEventChange={() => {}}
      policies={policies}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <div className="h-dvh">
        <Calendar.ActiveView />
      </div>
    </Calendar.Root>,
  );
  const body = document.querySelector<HTMLElement>('[data-slot="time-grid-body"]')!;
  body.scrollTop = (14 / 24) * body.scrollHeight;
  await frame();
  const column = document
    .querySelector('[data-date="2026-10-08"]:not([data-all-day])')!
    .getBoundingClientRect();
  const at = (hours: number) => column.top + (hours / 24) * column.height;
  const x = column.left + column.width / 3;
  const invalid = getComputedStyle(document.body).getPropertyValue("--calendar-invalid");
  expect(invalid).not.toBe("");

  const moved = await previewOutline([x, at(15.1)], [x, at(17.1)]);
  expect(moved).toMatchObject({ ghost: "event", outlineStyle: "dashed", outlineWidth: "2px" });
  const created = await previewOutline([x, at(18)], [x, at(19)]);
  expect(created).toMatchObject({ ghost: "range", outlineStyle: "dashed", outlineWidth: "2px" });
  expect(created.outlineColor).toBe(moved.outlineColor);

  // Inside working hours, the same drag is not outlined.
  expect(await previewOutline([x, at(15.1)], [x, at(16)])).toMatchObject({ outlineStyle: "none" });
});

test.each(["ltr", "rtl"] as const)(
  "%s: a timeline shades closed hours from the reading start, beside the resource column",
  async (direction) => {
    const Timeline = createCalendar<Meeting, CalendarResource<null>>()({
      eventAdapter: createCanonicalEventAdapter<null, string>(),
      views: [createTimelineDayView<Meeting>()],
    });
    await render(
      <Timeline.Root
        availability={officeHours}
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="UTC"
        direction={direction}
        events={[]}
        locale="en-US"
        now={Temporal.Instant.from("2026-10-08T00:30:00Z")}
        resources={[{ data: null, id: "ada", title: "Ada" }]}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <div className="h-dvh" dir={direction}>
          <Timeline.ActiveView />
        </div>
      </Timeline.Root>,
    );
    const viewport = document.querySelector<HTMLElement>(
      '[data-slot="resource-timeline-viewport"]',
    )!;
    viewport.scrollLeft = 0;
    await frame();
    const header = document.querySelector('[role="rowheader"]')!.getBoundingClientRect();
    // The first stretch is midnight to 09:00, which starts where the resource column ends.
    const [early] = document.querySelectorAll('[data-slot="resource-timeline-unavailable"]');
    const box = early!.getBoundingClientRect();

    if (direction === "ltr") expect(Math.round(box.left)).toBe(Math.round(header.right));
    else expect(Math.round(box.right)).toBe(Math.round(header.left));
  },
);

describe.each(["columns", "equal", "stack"] as const)("%s overlap layout", (overlapLayout) => {
  test.each(["week", "resources"] as const)(
    "the %s view paints events over the shading",
    async (view) => {
      const Overlapping = createCalendar<Meeting, CalendarResource<null>>()({
        eventAdapter: createCanonicalEventAdapter<null, string>(),
        views: [createWeekView<Meeting>(), createResourceColumnsView<Meeting>()],
      });
      // Three overlapping events after hours, so every one of them sits on shading.
      const late = (id: string, start: string, end: string): Meeting => ({
        data: null,
        end: Temporal.Instant.from(`2026-10-08T${end}:00Z`),
        id,
        kind: "timed",
        resourceIds: ["ada"],
        start: Temporal.Instant.from(`2026-10-08T${start}:00Z`),
        title: id,
      });
      await render(
        <Overlapping.Root
          availability={officeHours}
          defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
          defaultTimeZone="UTC"
          defaultView={view}
          events={[
            late("talk", "18:00", "19:30"),
            late("dinner", "18:30", "20:00"),
            late("call", "19:00", "19:45"),
          ]}
          locale="en-US"
          now={Temporal.Instant.from("2026-10-08T18:00:00Z")}
          resources={[{ data: null, id: "ada", title: "Ada" }]}
          viewOptions={{ resources: { overlapLayout }, week: { overlapLayout } }}
          weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
        >
          <div className="h-dvh">
            <Overlapping.ActiveView />
          </div>
        </Overlapping.Root>,
      );
      const body = document.querySelector<HTMLElement>(
        '[data-slot="time-grid-body"], [data-slot="resource-columns-body"]',
      )!;
      body.scrollTop = (17 / 24) * body.scrollHeight;
      await frame();
      // Let the shading take part in hit testing, which follows paint order.
      const bands = document.querySelectorAll<HTMLElement>('[data-slot="time-grid-unavailable"]');
      expect(bands.length).toBeGreaterThan(0);
      for (const band of bands) band.style.pointerEvents = "auto";

      const events = [
        ...document.querySelectorAll<HTMLElement>("[data-event-id]:not([data-calendar-ghost])"),
      ];
      expect(events).toHaveLength(3);
      for (const event of events) {
        const { left, top } = event.getBoundingClientRect();
        expect(
          document.elementFromPoint(left + 4, top + 4)?.closest("[data-event-id]"),
        ).not.toBeNull();
      }
    },
  );
});

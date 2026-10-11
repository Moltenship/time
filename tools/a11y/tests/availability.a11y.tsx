import {
  availabilityPolicy,
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarAvailability,
  type CalendarEvent,
} from "@moltenship/calendar";
import { expect, test } from "vite-plus/test";

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

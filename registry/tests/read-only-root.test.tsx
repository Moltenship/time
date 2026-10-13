// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  useCalendarInteraction,
  type CalendarEvent,
  type CalendarResource,
} from "@moltenship/calendar";
import { act } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { createAgendaView } from "../list-view/agenda-view";
import { createMonthView } from "../month-view/month-view";
import { createResourceColumnsView } from "../resource-columns-view/resource-columns-view";
import { createTimelineDayView } from "../resource-timeline-view/resource-timeline-view";
import { createScrollingAgendaView } from "../scrolling-list-view/scrolling-agenda-view";
import { createScrollingMonthView } from "../scrolling-month-view/scrolling-month-view";
import { createScrollingWeekView } from "../scrolling-time-grid-view/scrolling-time-grid-view";
import { createWeekView } from "../time-grid-view/time-grid-view";
import { createYearView } from "../year-view/year-view";
import { layOut, pointer } from "./pointer";
import { render } from "./render";
import { StubResizeObserver } from "./timeline-fixtures";

type Meeting = CalendarEvent<null, string, string>;

const standup: Meeting = {
  data: null,
  end: Temporal.Instant.from("2026-10-08T10:00:00Z"),
  id: "standup",
  kind: "timed",
  resourceIds: ["ana"],
  start: Temporal.Instant.from("2026-10-08T09:00:00Z"),
  title: "Standup",
};
const team: readonly CalendarResource<null>[] = [
  { data: null, id: "ana", title: "Ana" },
  { data: null, id: "ben", title: "Ben" },
];

/** A view from each registry item. */
const Calendar = createCalendar<Meeting, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [
    createWeekView<Meeting>(),
    createScrollingWeekView<Meeting>(),
    createMonthView<Meeting>(),
    createScrollingMonthView<Meeting>(),
    createResourceColumnsView<Meeting>(),
    createTimelineDayView<Meeting>(),
    createAgendaView<Meeting>(),
    createScrollingAgendaView<Meeting>(),
    createYearView<Meeting>(),
  ],
});
type View = (typeof Calendar.views)[number]["name"];

/** The keyboard gesture in progress, by its cause. */
function Grab() {
  const cause = useCalendarInteraction((session) => session?.cause ?? "none");
  return <output data-testid="grab">{cause}</output>;
}

function Screen({ editable, view }: { readonly editable: boolean; readonly view: View }) {
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      defaultView={view}
      events={[standup]}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T12:00:00Z")}
      onEventChange={editable ? () => {} : undefined}
      resources={team}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
      <Grab />
    </Calendar.Root>
  );
}

let cleanup: (() => Promise<void>) | undefined;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
});

async function press(key: string) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
    );
    await Promise.resolve();
  });
}

/**
 * What each way of editing does in a view: how many resize handles its event has, what pressing and
 * dragging the event or an empty slot starts (the view's `data-interaction`, and whether a preview
 * renders), and what Space grabs on the event and on the cell it's in, or on the date's cell in a
 * view without events to focus. Drags and grabs end with Escape, so nothing is proposed.
 */
async function gestures(container: HTMLElement) {
  const grab = () => container.querySelector('[data-testid="grab"]')!.textContent;
  const event = container.querySelector<HTMLElement>('[data-event-id="standup"]');
  const cell =
    event?.closest<HTMLElement>("[data-date]:not([data-all-day])") ??
    container.querySelector<HTMLElement>('[data-date="2026-10-08"]:not([data-all-day])')!;

  // The event sits at the top of its cell, which runs on below it.
  layOut([
    ...(event === null ? [] : ([[event, { height: 50, width: 100 }]] as const)),
    [cell, { height: 1000, width: 100 }],
  ]);
  const drag = (target: Element | null, from: [number, number], to: [number, number]) => {
    if (target === null) return "none";
    act(() => {
      pointer(target, "pointerdown", from);
      pointer(target, "pointermove", to);
    });
    const started =
      container.querySelector("[data-interaction]")?.getAttribute("data-interaction") ?? "none";
    const previewed = container.querySelector("[data-calendar-ghost]") !== null;
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { cancelable: true, key: "Escape" }));
      pointer(target, "pointerup", to);
    });
    return previewed ? `${started}, previewed` : started;
  };
  const space = async () => {
    await press(" ");
    const cause = grab();
    if (cause !== "none") await press("Escape");
    return cause;
  };

  const handles = container.querySelectorAll("[data-resize]").length;
  const eventDrag = drag(event, [50, 25], [50, 40]);
  const slotDrag = drag(cell, [50, 500], [50, 600]);
  let eventSpace = "none";
  if (event === null) {
    await act(async () => cell.closest<HTMLElement>("[tabindex]")?.focus());
  } else {
    await act(async () => event.focus());
    eventSpace = await space();
    // Escape leaves the event for its cell.
    await press("Escape");
  }
  const cellSpace = await space();
  return { cellSpace, eventDrag, eventSpace, handles, slotDrag };
}

type Gestures = Awaited<ReturnType<typeof gestures>>;

/** A time grid or timeline: events move and resize, and empty time creates. */
const timeAxis: Gestures = {
  cellSpace: "create",
  eventDrag: "move, previewed",
  eventSpace: "move",
  handles: 2,
  slotDrag: "create, previewed",
};
/** Nothing starts. */
const inert: Gestures = {
  cellSpace: "none",
  eventDrag: "none",
  eventSpace: "none",
  handles: 0,
  slotDrag: "none",
};

test.each<{ readonly view: View; readonly editable: Gestures }>([
  { view: "week", editable: timeAxis },
  { view: "scrolling-week", editable: timeAxis },
  // Month events move across days and have no handles.
  { view: "month", editable: { ...timeAxis, handles: 0 } },
  { view: "scrolling-month", editable: { ...timeAxis, handles: 0 } },
  { view: "resources", editable: timeAxis },
  { view: "timeline-day", editable: timeAxis },
  // The agenda and the year show events without editing them.
  { view: "agenda", editable: inert },
  { view: "scrolling-agenda", editable: inert },
  { view: "year", editable: inert },
])(
  "$view: a root without onEventChange starts no drag, grab, or resize",
  async ({ editable, view }) => {
    const screen = await render(<Screen editable view={view} />);
    cleanup = screen.unmount;
    expect(await gestures(screen.container)).toEqual(editable);

    await screen.rerender(<Screen editable={false} view={view} />);
    expect(await gestures(screen.container)).toEqual(inert);
  },
);

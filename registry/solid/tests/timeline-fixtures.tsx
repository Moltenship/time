import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarFocus,
  type CalendarResource,
} from "@moltenship/calendar-solid";

import {
  createTimelineDayView,
  createTimelineMonthView,
  createTimelineWeekView,
} from "@registry/resource-timeline-view/resource-timeline-view";
import { calendarAnnouncements } from "@registry/shared/calendar/announcements";

import { settled } from "./render";

// The React timeline's fixtures (registry/tests/timeline-fixtures.tsx), in Solid.

export type Booking = CalendarEvent<null, string, string>;
export type BookingChange = CalendarEventChange<Booking, string, string>;

/** 50 sites of 9 rooms each: 500 resources. */
export const sites: readonly CalendarResource<null>[] = Array.from({ length: 50 }, (_, site) => [
  { data: null, id: `site-${site + 1}`, title: `Site ${site + 1}` },
  ...Array.from({ length: 9 }, (_, room) => ({
    data: null,
    id: `site-${site + 1}-room-${room + 1}`,
    parentId: `site-${site + 1}`,
    title: `Room ${site + 1}.${room + 1}`,
  })),
]).flat();
const allSites = sites.filter(({ parentId }) => parentId === undefined).map(({ id }) => id);

export function booking(id: string, resourceIds: readonly string[], start: string, end: string) {
  return {
    data: null,
    end: Temporal.Instant.from(end),
    id,
    kind: "timed",
    resourceIds,
    start: Temporal.Instant.from(start),
    title: id,
  } as const satisfies Booking;
}

export function allDay(id: string, resourceIds: readonly string[], start: string, end: string) {
  return {
    data: null,
    end: Temporal.PlainDate.from(end),
    id,
    kind: "all-day",
    resourceIds,
    start: Temporal.PlainDate.from(start),
    title: id,
  } as const satisfies Booking;
}

const Calendar = createCalendar<Booking, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [
    createTimelineMonthView<Booking>(),
    createTimelineWeekView<Booking>({ unassigned: "bucket" }),
    createTimelineDayView<Booking>(),
  ],
});

type TimelineName = (typeof Calendar.views)[number]["name"];

export interface TimelineProps {
  /** The date shown, which another time zone can put in a clock change. */
  readonly anchor?: string;
  readonly defaultFocus?: CalendarFocus | null;
  readonly direction?: "ltr" | "rtl";
  readonly events?: readonly Booking[];
  readonly expanded?: readonly string[];
  /** Focus the owner holds; changes then only reach `onFocusChange`. */
  readonly focus?: CalendarFocus | null;
  readonly onEventChange?: (change: BookingChange) => void;
  readonly onFocusChange?: (focus: CalendarFocus | null) => void;
  readonly timeZone?: string;
  readonly view?: TimelineName;
}

/** The timeline views over the 500 resources, on Thursday, October 8, 2026, at noon UTC. */
export function Timeline(props: TimelineProps) {
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from(props.anchor ?? "2026-10-08")}
      defaultExpandedResourceIds={props.expanded ?? allSites}
      defaultFocus={props.defaultFocus ?? null}
      defaultTimeZone={props.timeZone ?? "UTC"}
      defaultView={props.view ?? "timeline-month"}
      direction={props.direction ?? "ltr"}
      events={props.events ?? []}
      focus={props.focus}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T12:00:00Z")}
      onEventChange={props.onEventChange}
      onFocusChange={props.onFocusChange}
      resources={sites}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
      <Calendar.Announcer messages={calendarAnnouncements} />
    </Calendar.Root>
  );
}

/** jsdom lays nothing out, so the viewport keeps the timeline's initial 1024 × 640 geometry. */
export class StubResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

/** A `ResizeObserver` the test resizes: `resizeViewport` sets a width and calls its callbacks. */
export class ResizingObserver {
  static readonly callbacks = new Set<() => void>();
  readonly #callback: () => void;
  constructor(callback: () => void) {
    this.#callback = callback;
  }
  disconnect() {
    ResizingObserver.callbacks.delete(this.#callback);
  }
  observe() {
    ResizingObserver.callbacks.add(this.#callback);
  }
  unobserve() {}
}

/** Gives the viewport a client width, as a layout would, and tells its observers. */
export async function resizeViewport(element: HTMLElement, width: number) {
  Object.defineProperty(element, "clientWidth", { configurable: true, value: width });
  for (const callback of ResizingObserver.callbacks) callback();
  await settled();
}

export const viewport = (container: Element) =>
  container.querySelector<HTMLElement>('[data-slot="resource-timeline-viewport"]')!;
export const rows = (container: Element) => [
  ...container.querySelectorAll<HTMLElement>('[role="row"][data-resource-id]'),
];
export const row = (container: Element, id: string) =>
  container.querySelector<HTMLElement>(`[role="row"][data-resource-id="${id}"]`)!;
/** A day's pointer target in a row: its day cell, or its date strip in an hour row. */
export const dayTarget = (container: Element, id: string, date: string) =>
  row(container, id).querySelector<HTMLElement>(`[data-date="${date}"]`)!;

/** Scrolls the viewport as the browser would, firing its scroll event. */
export async function scrollTo(element: HTMLElement, { left = 0, top = 0 }) {
  Object.defineProperties(element, {
    scrollLeft: { configurable: true, value: left, writable: true },
    scrollTop: { configurable: true, value: top, writable: true },
  });
  element.dispatchEvent(new Event("scroll"));
  await settled();
}

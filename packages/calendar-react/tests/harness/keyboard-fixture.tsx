import {
  createCanonicalEventAdapter,
  getMonthRange,
  getMonthTitle,
  monthSpatialNavigation,
  navigateMonth,
  projectMonth,
  type CalendarAnnouncementMessages,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarFocus,
  type CalendarPolicy,
  type DayGridSegment,
  type EventId,
  type MonthProjection,
  type ResourceId,
} from "@moltenship/calendar-core";
import { useState, type ReactNode } from "react";

import {
  createCalendar,
  defineCalendarView,
  useCalendarInteraction,
  useCalendarKeyboard,
  useRovingFocus,
  type CalendarViewRendererProps,
} from "@moltenship/calendar-react";

export type FixtureEvent = CalendarEvent<null, string, string>;
type Change = CalendarEventChange<FixtureEvent, string, string>;

/** Renders per element key, to check that moving focus re-renders only what changed. */
export const renders = new Map<string, number>();

function counted(key: string) {
  renders.set(key, (renders.get(key) ?? 0) + 1);
}

function DayCell({ date }: { readonly date: Temporal.PlainDate }) {
  counted(date.toString());
  const draft = useCalendarInteraction(
    (session) =>
      session?.eventId === null &&
      session.proposed.kind === "all-day" &&
      Temporal.PlainDate.compare(session.proposed.start, date) <= 0 &&
      Temporal.PlainDate.compare(date, session.proposed.end) < 0,
  );
  return (
    <button
      data-date={date.toString()}
      data-draft={draft ? "" : undefined}
      type="button"
      {...useRovingFocus({ date, kind: "day" })}
    >
      {date.day}
    </button>
  );
}

function EventSegment({
  date,
  segment,
}: {
  readonly date: Temporal.PlainDate;
  readonly segment: DayGridSegment<unknown, EventId, ResourceId>;
}) {
  const { event } = segment;
  counted(`${String(event.id)}@${date.toString()}`);
  const roving = useRovingFocus({ date, eventId: event.id, kind: "event" }, { days: segment.span });
  return (
    <button data-event={String(event.id)} data-start={date.toString()} type="button" {...roving}>
      {event.title}
    </button>
  );
}

function MonthFixture({
  projection,
}: CalendarViewRendererProps<MonthProjection<unknown, EventId, ResourceId>, undefined>) {
  return (
    <div data-testid="grid" {...useCalendarKeyboard()}>
      {projection.weeks.map((week) => (
        <div key={week.range.start.toString()}>
          {week.days.map((day) => (
            <DayCell key={day.date.toString()} date={day.date} />
          ))}
          {week.segments.map((segment) => (
            <EventSegment
              key={String(segment.event.id)}
              date={week.days[segment.column]!.date}
              segment={segment}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export const monthView = defineCalendarView({
  name: "month",
  strategy: {
    getRange: getMonthRange,
    getSpatialNavigation: monthSpatialNavigation,
    getTitle: getMonthTitle,
    navigate: navigateMonth,
    project: projectMonth,
  },
  Renderer: MonthFixture,
});

export const KeyboardCalendar = createCalendar<FixtureEvent>()({
  eventAdapter: {
    ...createCanonicalEventAdapter<null, string, string>(),
    isReadOnly: (event) => event.title === "Locked",
  },
  views: [monthView],
});

/** Speaks `phase cause title range`, so tests read what a screen reader would hear. */
export const testMessages: CalendarAnnouncementMessages = {
  cancel: ({ cause, event }) => `cancel ${cause} ${event?.title ?? "new"}`,
  commit: ({ cause, event, proposed }, { formatRange }) =>
    `commit ${cause} ${event?.title ?? "new"} ${formatRange(proposed)}`,
  reject: ({ cause, event, reason }) => `reject ${cause} ${event?.title ?? "new"} ${reason}`,
  start: ({ cause, event, proposed }, { formatRange }) =>
    `start ${cause} ${event?.title ?? "new"} ${proposed === null ? "" : formatRange(proposed)}`,
  step: ({ proposed }, { formatRange }) => (proposed === null ? null : formatRange(proposed)),
};

export function allDay(id: string, start: string, end: string, title = id): FixtureEvent {
  return {
    data: null,
    end: Temporal.PlainDate.from(end),
    id,
    kind: "all-day",
    start: Temporal.PlainDate.from(start),
    title,
  };
}

/**
 * Applies each accepted change to its events, as an application would; `persist` saves it first
 * and the change rolls back when it rejects. `controlFocus` owns focus in React state.
 */
export function KeyboardFixture({
  children,
  controlFocus = false,
  defaultFocus = null,
  initialEvents,
  onChange,
  persist,
  policies,
}: {
  readonly children?: ReactNode;
  readonly controlFocus?: boolean;
  readonly defaultFocus?: CalendarFocus | null;
  readonly initialEvents: readonly FixtureEvent[];
  readonly onChange?: (change: Change) => void;
  readonly persist?: (change: Change) => Promise<void>;
  readonly policies?: readonly CalendarPolicy<FixtureEvent, string, string>[];
}) {
  const [events, setEvents] = useState(initialEvents);
  const [focus, setFocus] = useState(defaultFocus);
  const apply = (change: Change) =>
    setEvents((current) =>
      change.cause === "create"
        ? [
            ...current,
            {
              ...change.proposed,
              data: null,
              id: `new-${current.length}`,
              title: "New",
            } as FixtureEvent,
          ]
        : current.map((event) =>
            event.id === change.eventId && change.proposed !== null
              ? ({ ...event, ...change.proposed } as FixtureEvent)
              : event,
          ),
    );
  return (
    <KeyboardCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultFocus={defaultFocus}
      defaultTimeZone="UTC"
      events={events}
      focus={controlFocus ? focus : undefined}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T12:00:00Z")}
      onEventChange={(change) => {
        onChange?.(change);
        if (persist === undefined) return apply(change);
        return persist(change).then(() => apply(change));
      }}
      onFocusChange={controlFocus ? setFocus : undefined}
      policies={policies}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      {children}
      <KeyboardCalendar.ActiveView />
      <KeyboardCalendar.Announcer messages={testMessages} />
    </KeyboardCalendar.Root>
  );
}

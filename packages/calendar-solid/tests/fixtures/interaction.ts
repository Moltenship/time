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
  type CalendarProposalDetail,
  type CalendarTransactionResult,
  type DayGridSegment,
  type EventId,
  type MonthProjection,
  type ResourceId,
} from "@moltenship/calendar-core";
import type { CalendarClock } from "@moltenship/calendar-temporal";
import { createComponent, type JSX } from "@solidjs/web";
import { createSignal, For, merge, untrack, type Accessor, type Component } from "solid-js";

import {
  createCalendar,
  defineCalendarView,
  eventIdAttributes,
  useCalendarAnnouncer,
  useCalendarDraftReporter,
  useCalendarInteraction,
  useCalendarKeyboard,
  useCalendarPointer,
  useRovingFocus,
  type CalendarViewRendererProps,
} from "../../src";
import { element } from "../../src/props";

// A month grid on the keyboard, roving focus and the pointer layer, as React's keyboard fixture
// is: written without JSX, as the other fixtures are.

export type FixtureEvent = CalendarEvent<null, string, string>;
type Change = CalendarEventChange<FixtureEvent, string, string>;
type Month = MonthProjection<unknown, EventId, ResourceId>;

const Div = element("div");
const Button = element("button");

/** Renders per element key, to check that moving focus updates only what changed. */
export const renders = new Map<string, number>();
/** Tab stop updates per element key. */
export const tabStopReads = new Map<string, number>();

function count(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

/** `For` keyed by `key`, whose item comes as an accessor. */
function listBy<T>(
  each: () => readonly T[],
  key: (item: T) => string,
  render: (item: Accessor<T>) => JSX.Element,
): JSX.Element {
  return createComponent(For as Component<ForByProps<T>>, {
    get each() {
      return each();
    },
    keyed: key,
    children: (item: Accessor<T>) => render(item),
  });
}

interface ForByProps<T> {
  readonly each: readonly T[];
  readonly keyed: (item: T) => string;
  readonly children: (item: Accessor<T>) => JSX.Element;
}

function DayCell(props: { readonly date: Temporal.PlainDate }): JSX.Element {
  const date = untrack(() => props.date);
  const key = date.toString();
  count(renders, key);
  const draft = useCalendarInteraction(
    (session) =>
      session?.eventId === null &&
      session.proposed.kind === "all-day" &&
      Temporal.PlainDate.compare(session.proposed.start, date) <= 0 &&
      Temporal.PlainDate.compare(date, session.proposed.end) < 0,
  );
  const roving = useRovingFocus({ date, kind: "day" });
  return createComponent(
    Button,
    merge(roving, {
      "data-date": key,
      get "data-draft"() {
        return draft() ? "" : undefined;
      },
      get tabindex() {
        count(tabStopReads, key);
        return roving.tabindex;
      },
      type: "button",
      children: String(date.day),
    } as const),
  );
}

function EventSegment(props: {
  readonly date: Temporal.PlainDate;
  readonly segment: DayGridSegment<unknown, EventId, ResourceId>;
}): JSX.Element {
  const event = untrack(() => props.segment.event);
  count(
    renders,
    untrack(() => `${String(event.id)}@${props.date.toString()}`),
  );
  const roving = useRovingFocus(
    () => ({ date: props.date, eventId: event.id, kind: "event" }),
    () => ({ days: props.segment.span }),
  );
  return createComponent(
    Button,
    merge(roving, eventIdAttributes(event.id), {
      "data-event": String(event.id),
      get "data-start"() {
        return props.date.toString();
      },
      type: "button",
      get children() {
        return [
          props.segment.event.title,
          createComponent(Div, { "data-resize": "end" }),
        ] as JSX.Element;
      },
    } as const),
  );
}

function MonthFixture(props: CalendarViewRendererProps<Month, undefined>): JSX.Element {
  const keyboard = useCalendarKeyboard();
  const announcer = useCalendarAnnouncer();
  const onPreview = useCalendarDraftReporter();
  const pointer = useCalendarPointer(() => ({
    announcer,
    disabled: props.isReadOnly,
    events: props.events,
    onPreview,
    onPropose: (proposal) => props.actions.proposeEventChange(proposal, { input: "pointer" }),
    timeZone: props.environment.timeZone,
  }));
  return createComponent(Div, {
    "data-testid": "grid",
    ref: [keyboard, pointer],
    get children() {
      return listBy(
        () => props.projection.weeks,
        (week) => week.range.start.toString(),
        (week) =>
          createComponent(Div, {
            "data-week": "",
            get children() {
              return [
                listBy(
                  () => week().days,
                  (day) => day.date.toString(),
                  (day) =>
                    createComponent(DayCell, {
                      get date() {
                        return day().date;
                      },
                    }),
                ),
                listBy(
                  () => week().segments,
                  (segment) => String(segment.event.id),
                  (segment) =>
                    createComponent(EventSegment, {
                      get date() {
                        return week().days[segment().column]!.date;
                      },
                      get segment() {
                        return segment();
                      },
                    }),
                ),
              ];
            },
          }),
      );
    },
  });
}

const monthView = defineCalendarView({
  name: "month",
  Renderer: MonthFixture,
  strategy: {
    getRange: getMonthRange,
    getSpatialNavigation: monthSpatialNavigation,
    getTitle: getMonthTitle,
    navigate: navigateMonth,
    project: projectMonth,
  },
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
  reject: ({ cause, error, event, reason }) =>
    `reject ${cause} ${event?.title ?? "new"} ${reason}${error instanceof Error ? ` (${error.message})` : ""}`,
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

export interface KeyboardFixtureProps {
  readonly children?: JSX.Element;
  /** A clock in place of the fixed `now`, so what reads the time waits for the page. */
  readonly clock?: CalendarClock;
  /** Owns focus in a signal, as an application that controls it does. */
  readonly controlFocus?: boolean;
  readonly defaultFocus?: CalendarFocus | null;
  readonly initialEvents: readonly FixtureEvent[];
  readonly onChange?: (change: Change) => void;
  readonly onResult?: (
    result: CalendarTransactionResult<FixtureEvent, string, string>,
    detail: CalendarProposalDetail,
  ) => void;
  /** Hears the anchor date's and focus's changes as `slice reason event`. */
  readonly onStateChange?: (heard: string) => void;
  /** Saves a change first; the change rolls back when it rejects. */
  readonly persist?: (change: Change) => Promise<void>;
  readonly policies?: readonly CalendarPolicy<FixtureEvent, string, string>[];
  readonly readOnly?: boolean;
}

/** Applies each accepted change to its events, as an application would. */
export function KeyboardFixture(props: KeyboardFixtureProps): JSX.Element {
  const [events, setEvents] = createSignal(untrack(() => props.initialEvents));
  // In an object: Solid 2 reads a function given to createSignal as a derivation.
  const [focus, setFocus] = createSignal({ value: untrack(() => props.defaultFocus ?? null) });
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
  return createComponent(KeyboardCalendar.Root, {
    defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
    get defaultFocus() {
      return props.defaultFocus ?? null;
    },
    defaultTimeZone: "UTC",
    get events() {
      return events();
    },
    get focus() {
      return props.controlFocus === true ? focus().value : undefined;
    },
    // One of `clock` and `now`; the types can't tell from two getters.
    get clock() {
      return props.clock as never;
    },
    locale: "en-US",
    get now() {
      return (
        props.clock === undefined ? Temporal.Instant.from("2026-10-08T12:00:00Z") : undefined
      ) as never;
    },
    get onEventChange() {
      return props.readOnly === true
        ? undefined
        : (change: Change) => {
            props.onChange?.(change);
            if (props.persist === undefined) {
              apply(change);
              return undefined;
            }
            return props.persist(change).then(() => {
              apply(change);
            });
          };
    },
    onAnchorDateChange: (_value, detail) =>
      props.onStateChange?.(`${detail.slice} ${detail.reason} ${detail.event?.type ?? "no-event"}`),
    get onEventChangeResult() {
      return props.onResult;
    },
    onFocusChange: (next, detail) => {
      props.onStateChange?.(`${detail.slice} ${detail.reason} ${detail.event?.type ?? "no-event"}`);
      if (props.controlFocus === true) setFocus({ value: next });
    },
    get policies() {
      return props.policies;
    },
    weekRules: { firstDay: 7, minimalDays: 1, weekend: [6, 7] },
    get children() {
      return [
        props.children,
        createComponent(KeyboardCalendar.ActiveView, {}),
        createComponent(KeyboardCalendar.Announcer, { messages: testMessages }),
      ];
    },
  });
}

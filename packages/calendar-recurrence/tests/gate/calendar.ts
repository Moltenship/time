import {
  createEventSnapshot,
  createResourceTree,
  getMonthRange,
  getMonthTitle,
  getYearRange,
  getYearTitle,
  navigateMonth,
  navigateYear,
  projectMonth,
  projectYear,
  resolveViewInstantRange,
  resolveViewLoadRange,
  scrollingTimeGridStrategy,
  timeGridStrategy,
  type CalendarEnvironmentBase,
  type CalendarViewStrategy,
  type EventId,
  type MonthProjection,
  type ResourceId,
  type TimeGridProjection,
  type YearProjection,
} from "@moltenship/calendar-core";

import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceAdapter,
  createOccurrenceExpander,
  parseRecurrenceRule,
  type OccurrenceExpander,
  type RecurrenceOccurrence,
  type RecurringCalendarEvent,
} from "../../src";

export type Event = RecurringCalendarEvent<null>;
export type Occurrence = RecurrenceOccurrence<Event, string>;

const adapters = createCanonicalRecurrenceAdapter<null>();
const occurrenceAdapter = createOccurrenceAdapter(adapters.event);

export function createExpander(): OccurrenceExpander<Event, string> {
  return createOccurrenceExpander(adapters);
}

function ruleOf(text: string) {
  const { issues, rule } = parseRecurrenceRule(text);
  if (rule === undefined || issues.length > 0) throw new Error(`${text}: ${issues[0]?.message}`);
  return rule;
}

/** A series whose first occurrence starts at `start`, a wall time in `timeZone`. */
export function timedSeries(
  id: string,
  start: string,
  timeZone: string,
  minutes: number,
  rule: string,
): Event {
  const first = Temporal.PlainDateTime.from(start).toZonedDateTime(timeZone).toInstant();
  return {
    data: null,
    end: first.add({ minutes }),
    id,
    kind: "timed",
    recurrence: { rule: ruleOf(rule) },
    sourceTimeZone: timeZone,
    start: first,
    title: id,
  };
}

export function allDaySeries(id: string, start: string, days: number, rule: string): Event {
  const first = Temporal.PlainDate.from(start);
  const end = first.add({ days });
  return {
    data: null,
    end,
    id,
    kind: "all-day",
    recurrence: { rule: ruleOf(rule) },
    start: first,
    title: id,
  };
}

export function floatingSeries(id: string, start: string, minutes: number, rule: string): Event {
  const first = Temporal.PlainDateTime.from(start);
  const end = first.add({ minutes });
  return {
    data: null,
    end,
    id,
    kind: "floating",
    recurrence: { rule: ruleOf(rule) },
    start: first,
    title: id,
  };
}

export function environment(timeZone: string): CalendarEnvironmentBase {
  return {
    direction: "ltr",
    disambiguation: "compatible",
    locale: "en-GB",
    timeZone,
    weekRules: { firstDay: 1, minimalDays: 4, weekend: [6, 7] },
  };
}

type Strategy<TProjection> = CalendarViewStrategy<TProjection, undefined, Occurrence>;

/** The paged week the registry's week view shows. */
export const weekView: Strategy<TimeGridProjection<Occurrence>> = timeGridStrategy({
  kind: "week",
});
/** A week that scrolls, which loads a week on each side. */
export const scrollingWeekView: Strategy<TimeGridProjection<Occurrence>> =
  scrollingTimeGridStrategy({ kind: "week" });
/** The registry's month view, which projects with `projectMonth`. */
export const monthView: Strategy<MonthProjection<Occurrence, EventId, ResourceId>> = {
  getRange: getMonthRange,
  getTitle: getMonthTitle,
  navigate: navigateMonth,
  project: projectMonth,
};
/** The registry's year view, which projects with `projectYear`. */
export const yearView: Strategy<YearProjection<Occurrence, EventId, ResourceId>> = {
  getRange: getYearRange,
  getTitle: getYearTitle,
  navigate: navigateYear,
  project: projectYear,
};

/**
 * What a calendar root and an application do to show a view at `anchor` in `timeZone`: the root
 * resolves the view's range and load range, the application expands its series over the load range
 * that `onVisibleRangeChange` reports and hands the occurrences over through
 * `createOccurrenceAdapter`, and the view projects their snapshot.
 */
export function show<TProjection>(
  strategy: Strategy<TProjection>,
  anchor: string,
  timeZone: string,
  events: readonly Event[],
  expander = createExpander(),
) {
  const env = environment(timeZone);
  const date = Temporal.PlainDate.from(anchor);
  const range = strategy.getRange(date, env, undefined);
  const loadRange = resolveViewLoadRange(strategy, date, env, undefined, range);
  const expansion = expander.expand(events, { range: loadRange, timeZone });
  const snapshot = createEventSnapshot(expansion.occurrences, occurrenceAdapter);
  const projection = strategy.project({
    environment: env,
    expandedResourceIds: [],
    instantRange: resolveViewInstantRange(range, timeZone),
    loadRange,
    options: undefined,
    range,
    resources: createResourceTree([]),
    snapshot,
    today: null,
  });
  return { expansion, loadRange, projection, range, snapshot };
}

/** Minutes from midnight for a position on a time grid column, where `1` is the next midnight. */
export const minutesOf = (fraction: number) => Math.round(fraction * 24 * 60);
const pad = (value: number) => String(value).padStart(2, "0");

/** `HH:MM` for minutes from midnight; the end of the day is `24:00`. */
export function clock(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * A time grid as it reads on screen: each day column's blocks from top to bottom, as
 * `HH:MM–HH:MM title`, the block's top and bottom on the column's 24-hour wall clock. Blocks with
 * the same top go by title.
 */
export function timeGridText(projection: TimeGridProjection<Occurrence>): Record<string, string> {
  const columns: Record<string, string> = {};
  for (const { column, events } of projection.days) {
    columns[column.date.toString()] = events
      .map(({ fragment, height, top }) => ({
        bottom: minutesOf(top + height),
        title: fragment.event.title,
        top: minutesOf(top),
      }))
      .sort((left, right) => left.top - right.top || (left.title < right.title ? -1 : 1))
      .map(({ bottom, title, top }) => `${clock(top)}–${clock(bottom)} ${title}`)
      .join(" · ");
  }
  return columns;
}

/** The time grid's all-day row, as `YYYY-MM-DD title` from each segment's first day. */
export function allDayRowText(projection: TimeGridProjection<Occurrence>): string[] {
  return projection.allDay.segments.map(({ event, fragments, span }) => {
    const days = span === 1 ? "" : ` (${span} days)`;
    return `${fragments[0]!.date.toString()} ${event.title}${days}`;
  });
}

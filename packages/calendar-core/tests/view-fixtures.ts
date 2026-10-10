import { plainDateInterval, type PlainDateInterval } from "@moltenship/calendar-temporal";

import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  createResourceTree,
  resolveViewInstantRange,
  type CalendarEnvironmentBase,
  type CalendarEvent,
  type CalendarViewProjectionInput,
  type EventSnapshot,
  type IsoDayOfWeek,
} from "../src/index";

export type FixtureEvent = CalendarEvent<null, string, string>;

export function timed(id: string, start: string, end: string): FixtureEvent {
  return {
    data: null,
    end: Temporal.Instant.from(end),
    id,
    kind: "timed",
    start: Temporal.Instant.from(start),
    title: id,
  };
}

export function allDay(id: string, start: string, end: string): FixtureEvent {
  return {
    data: null,
    end: Temporal.PlainDate.from(end),
    id,
    kind: "all-day",
    start: Temporal.PlainDate.from(start),
    title: id,
  };
}

export function floating(id: string, start: string, end: string): FixtureEvent {
  return {
    data: null,
    end: Temporal.PlainDateTime.from(end),
    id,
    kind: "floating",
    start: Temporal.PlainDateTime.from(start),
    title: id,
  };
}

export function snapshotOf(events: readonly FixtureEvent[]) {
  return createEventSnapshot(events, createCanonicalEventAdapter<null, string, string>());
}

export function dates(start: string, end: string) {
  return plainDateInterval(Temporal.PlainDate.from(start), Temporal.PlainDate.from(end));
}

export function environment(
  timeZone: string,
  options: { readonly firstDay?: IsoDayOfWeek } = {},
): CalendarEnvironmentBase {
  return {
    direction: "ltr",
    disambiguation: "compatible",
    locale: "en-US",
    timeZone,
    weekRules: { firstDay: options.firstDay ?? 7, minimalDays: 1, weekend: [6, 7] },
  };
}

/** The input a calendar root hands to `strategy.project` for `range`. */
export function viewInput<TEvent>(
  snapshot: EventSnapshot<TEvent, string, string>,
  range: PlainDateInterval,
  environment: CalendarEnvironmentBase,
  today: string | null = null,
): CalendarViewProjectionInput<unknown, TEvent> {
  return {
    environment,
    expandedResourceIds: [],
    instantRange: resolveViewInstantRange(range, environment.timeZone),
    options: undefined,
    range,
    resources: createResourceTree([]),
    snapshot,
    today: today === null ? null : Temporal.PlainDate.from(today),
  };
}

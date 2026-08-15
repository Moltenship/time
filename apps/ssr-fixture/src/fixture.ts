"use client";

import {
  createCalendar,
  defineEventAdapter,
  type CalendarContextValue,
  type CalendarViewRegistration,
} from "@moltenship/calendar";

import { createElement, useId, useState, type ReactNode } from "react";

export interface CalendarFixtureEnvironment {
  readonly locale: string;
  readonly timeZone: string;
  readonly weekStartsOn: 1;
  readonly now: string;
  readonly anchorDate: string;
  readonly identifierPrefix: string;
}

export const deterministicEnvironment: CalendarFixtureEnvironment = {
  locale: "en-GB",
  timeZone: "Asia/Tbilisi",
  weekStartsOn: 1,
  now: "2026-08-15T08:30:00Z",
  anchorDate: "2026-08-15",
  identifierPrefix: "time-ssr-fixture-",
};

export interface DeterministicCalendarFixtureProps {
  readonly environment: CalendarFixtureEnvironment;
}

interface FixtureEvent {
  readonly end: Temporal.Instant;
  readonly id: string;
  readonly resourceIds: readonly string[];
  readonly start: Temporal.Instant;
  readonly title: string;
}

interface FixtureResource {
  readonly id: string;
  readonly title: string;
}

const fixtureEventAdapter = defineEventAdapter<FixtureEvent>()({
  getId: (event) => event.id,
  getInterval: (event) => ({ end: event.end, kind: "timed", start: event.start }),
  getResourceIds: (event) => event.resourceIds,
  getTitle: (event) => event.title,
});
const fixtureView: CalendarViewRegistration<FixtureEvent, FixtureResource> = Object.freeze({
  capabilities: Object.freeze(["fixture:view"]),
  getTitle: (anchor: Temporal.PlainDate) => anchor.toString(),
  name: "fixture",
  navigate: (anchor: Temporal.PlainDate, direction: -1 | 1) => anchor.add({ days: direction }),
  render: (calendar: CalendarContextValue<FixtureEvent, FixtureResource>) =>
    createElement(
      "output",
      { "data-calendar-view": true },
      `${calendar.state.view}:${calendar.meta.eventSnapshot.size}`,
    ),
});
const FixtureCalendar = createCalendar<FixtureEvent, FixtureResource>({
  eventAdapter: fixtureEventAdapter,
  views: [fixtureView],
});
const fixtureEvents: readonly FixtureEvent[] = Object.freeze([
  Object.freeze({
    end: Temporal.Instant.from("2026-08-15T10:00:00Z"),
    id: "fixture-event",
    resourceIds: Object.freeze(["fixture-resource"]),
    start: Temporal.Instant.from("2026-08-15T09:00:00Z"),
    title: "Fixture event",
  }),
]);
const fixtureResources: readonly FixtureResource[] = Object.freeze([
  Object.freeze({ id: "fixture-resource", title: "Fixture resource" }),
]);

export function DeterministicCalendarFixture({
  environment,
}: DeterministicCalendarFixtureProps): ReactNode {
  const interactionDescriptionId = useId();
  const [interactionCount, setInteractionCount] = useState(0);

  return createElement(
    FixtureCalendar.Root,
    {
      defaultAnchorDate: Temporal.PlainDate.from(environment.anchorDate),
      defaultTimeZone: environment.timeZone,
      defaultView: "fixture",
      events: fixtureEvents,
      locale: environment.locale,
      now: Temporal.Instant.from(environment.now),
      resources: fixtureResources,
      weekRules: { firstDay: environment.weekStartsOn, minimalDays: 4, weekend: [6, 7] },
    },
    createElement(
      FixtureCalendar.Frame,
      null,
      createElement(
        "main",
        {
          "data-anchor-date": environment.anchorDate,
          "data-locale": environment.locale,
          "data-time-zone": environment.timeZone,
          "data-week-starts-on": environment.weekStartsOn,
        },
        createElement("h1", null, "Moltenship Time SSR fixture"),
        createElement(FixtureCalendar.Title),
        createElement(FixtureCalendar.ActiveView),
        createElement("span", { "data-environment-locale": true }, environment.locale),
        createElement("time", { dateTime: environment.now }, environment.now),
        createElement("p", { id: interactionDescriptionId }, "Deterministic interaction count"),
        createElement(
          "output",
          { "aria-describedby": interactionDescriptionId, "data-interaction-count": true },
          interactionCount,
        ),
        createElement(
          "button",
          { type: "button", onClick: () => setInteractionCount((count) => count + 1) },
          "Interact",
        ),
      ),
    ),
  );
}

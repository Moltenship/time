import {
  defineEventAdapter,
  type CalendarEnvironment,
  type CalendarViewStrategy,
} from "@moltenship/calendar-core";
import { createCalendar } from "@moltenship/calendar-react";
import { plainDateInterval } from "@moltenship/calendar-temporal";

import {
  type GateEvent,
  type GateFocus,
  type GateResource,
  type GateSelection,
  type GateView,
} from "./builders";

interface GateViewOptions {
  readonly days: number;
  readonly label: string;
}

const gateEventAdapter = defineEventAdapter<GateEvent>()({
  getId: (event) => event.id,
  getInterval: (event) => ({ end: event.end, kind: "timed", start: event.start }),
  getResourceIds: (event) => event.resourceIds,
  getTitle: (event) => event.title,
});

export const GateCalendar = createCalendar<
  GateEvent,
  GateResource,
  GateView,
  GateSelection,
  GateFocus
>({
  capabilities: ["gate:react"],
  eventAdapter: gateEventAdapter,
});

function createGateViewStrategy<const TName extends GateView>(name: TName, days: number) {
  return {
    getInteractionGeometry: (input: number) => input,
    getRange: (anchor: Temporal.PlainDate) => plainDateInterval(anchor, anchor.add({ days })),
    getSpatialNavigation: (input: string) => input,
    getTitle: (
      range: ReturnType<typeof plainDateInterval>,
      _environment: CalendarEnvironment,
      options: GateViewOptions,
    ) => `${options.label}:${range.start.toString()}`,
    name,
    navigate: (anchor: Temporal.PlainDate, direction: -1 | 1) =>
      anchor.add({ days: direction * days }),
    project: (input: number) => input,
  } satisfies CalendarViewStrategy<
    TName,
    GateViewOptions,
    number,
    number,
    string,
    string,
    number,
    number
  >;
}

export const gateMonthView = GateCalendar.defineView({
  capabilities: ["gate:view:month"],
  defaultOptions: { days: 7, label: "Month" },
  Renderer({ calendar, options }) {
    return (
      <output
        data-gate-anchor={calendar.state.anchorDate.toString()}
        data-gate-event-count={calendar.meta.eventSnapshot.size}
        data-gate-view={calendar.state.view}
      >
        {calendar.state.view}:{options.days}:{calendar.meta.resources.length}
      </output>
    );
  },
  strategy: createGateViewStrategy("month", 7),
});

export const gateAgendaView = GateCalendar.defineView({
  capabilities: ["gate:view:agenda"],
  defaultOptions: { days: 1, label: "Agenda" },
  Renderer({ calendar, options }) {
    return (
      <output
        data-gate-anchor={calendar.state.anchorDate.toString()}
        data-gate-event-count={calendar.meta.eventSnapshot.size}
        data-gate-view={calendar.state.view}
      >
        {calendar.state.view}:{options.days}:{calendar.meta.resources.length}
      </output>
    );
  },
  strategy: createGateViewStrategy("agenda", 1),
});

export const gateViews = Object.freeze([gateMonthView, gateAgendaView]);

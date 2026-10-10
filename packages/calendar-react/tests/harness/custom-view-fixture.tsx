import { defineEventAdapter } from "@moltenship/calendar-core";
import { createCalendar, defineCalendarView } from "@moltenship/calendar-react";
import { plainDateInterval } from "@moltenship/calendar-temporal";

import { type GateEvent, type GateFocus, type GateResource, type GateSelection } from "./builders";
import { createTestCounter } from "./counters";

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

/** Counts `project` calls across every gate view. */
export const gateProjections = createTestCounter();

function defineGateView<const TName extends string>(name: TName, defaultOptions: GateViewOptions) {
  return defineCalendarView({
    defaultOptions,
    name,
    strategy: {
      getRange: (anchor, _environment, { days }) => plainDateInterval(anchor, anchor.add({ days })),
      getTitle: (range, _environment, { label }) => `${label}:${range.start.toString()}`,
      navigate: (anchor, delta, { days }) => anchor.add({ days: delta * days }),
      project({ instantRange, resources, snapshot }) {
        gateProjections.increment();
        return {
          eventIds: snapshot.queryTimed(instantRange).map((event) => event.id),
          resourceCount: resources.byId.size,
        };
      },
    },
    Renderer({ options, projection, range }) {
      return (
        <output
          data-gate-anchor={range.start.toString()}
          data-gate-event-count={projection.eventIds.length}
          data-gate-view={name}
        >
          {name}:{options.days}:{projection.resourceCount}
        </output>
      );
    },
  });
}

export const gateMonthView = defineGateView("month", { days: 7, label: "Month" });
export const gateAgendaView = defineGateView("agenda", { days: 1, label: "Agenda" });

export const GateCalendar = createCalendar<GateEvent, GateResource, GateSelection, GateFocus>()({
  eventAdapter: gateEventAdapter,
  views: [gateMonthView, gateAgendaView],
});

export type GateView = (typeof GateCalendar.views)[number]["name"];

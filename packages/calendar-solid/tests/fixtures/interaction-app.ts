import {
  createEventHistory,
  type CalendarFocus,
  type EventHistory,
} from "@moltenship/calendar-core";
import type { CalendarClock } from "@moltenship/calendar-temporal";
import { createComponent, type JSX } from "@solidjs/web";

import {
  useCalendarDraft,
  useCalendarHistory,
  useCalendarInteraction,
  useNow,
  useResourceStatus,
} from "../../src";
import { element } from "../../src/props";
import { allDay, KeyboardFixture, type FixtureEvent } from "./interaction";

// The keyboard fixture with a probe for each hook that reads the time or the page: both the server
// tests and the page they hydrate render it, so they build the same tree.

type History = EventHistory<FixtureEvent, string, string>;

const Output = element("output");

function Probe(props: { readonly name: string; readonly read: () => string }): JSX.Element {
  return createComponent(Output, {
    get [`data-${props.name}`]() {
      return "";
    },
    get children() {
      return props.read();
    },
  });
}

function Probes(props: { readonly history: History }): JSX.Element {
  const now = useNow({ intervalMs: 10 });
  // oxlint-disable-next-line solid/reactivity -- read once: the history is the same for the page.
  const history = useCalendarHistory(props.history);
  const status = useResourceStatus();
  const draft = useCalendarDraft();
  const session = useCalendarInteraction();
  return [
    createComponent(Probe, { name: "now", read: () => now()?.toString() ?? "pending" }),
    createComponent(Probe, {
      name: "history",
      read: () => `${history().past.length} back, ${history().future.length} forward`,
    }),
    createComponent(Probe, {
      name: "status",
      read: () => (status() === null ? "pending" : "ready"),
    }),
    createComponent(Probe, { name: "draft", read: () => (draft() === null ? "none" : "some") }),
    createComponent(Probe, { name: "session", read: () => (session() === null ? "idle" : "busy") }),
  ] as unknown as JSX.Element;
}

/** A clock a test sets; the server's and the page's each read their own. */
export function createTestClock(initial: string) {
  let current = Temporal.Instant.from(initial);
  return {
    instant: () => current,
    set(instant: string) {
      current = Temporal.Instant.from(instant);
    },
  } satisfies CalendarClock & { set(instant: string): void };
}

/** A history with one step recorded before the page renders, as one kept across pages has. */
export function createRecordedHistory(): History {
  const history = createEventHistory<FixtureEvent, string, string>();
  const trip = allDay("trip", "2026-10-07", "2026-10-09", "Trip");
  history.record(
    {
      change: {
        cause: "move",
        event: trip,
        eventId: "trip",
        id: "change-1",
        original: { ...trip, resourceIds: [] },
        proposed: { ...trip, resourceIds: [] },
      },
      status: "committed",
    },
    { input: "pointer" },
  );
  return history;
}

export interface InteractionAppProps {
  readonly clock?: CalendarClock;
  readonly defaultFocus?: CalendarFocus | null;
  readonly history: History;
}

export function InteractionApp(props: InteractionAppProps): JSX.Element {
  return createComponent(KeyboardFixture, {
    get clock() {
      return props.clock;
    },
    get defaultFocus() {
      return props.defaultFocus;
    },
    initialEvents: [allDay("trip", "2026-10-07", "2026-10-09", "Trip")],
    get onResult() {
      return props.history.record;
    },
    get children() {
      return createComponent(Probes, {
        get history() {
          return props.history;
        },
      });
    },
  });
}

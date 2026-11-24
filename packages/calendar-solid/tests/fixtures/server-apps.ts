import { createComponent, type JSX } from "@solidjs/web";

import type { CalendarEventSource } from "@moltenship/calendar-core";
import type { CalendarStateSource } from "@moltenship/calendar-primitives";
import { createFixedClock } from "@moltenship/calendar-temporal";

import { element } from "../../src/props";
import { createStateSelector } from "../../src/state-selector";
import { EngineCalendar, weekRules, type Meeting } from "./calendar";

// Rendered once on the server and once in the page, so the two must build the same tree.

const Output = element("output");
const Article = element("article");

/** Shows the label a store selects: the server snapshot's, then the client's once hydrated. */
export function LabelApp(props: {
  readonly store: CalendarStateSource<{ readonly label: string }>;
}): JSX.Element {
  // An accessor of the store, so a test can hand it another one.
  const label = createStateSelector(
    () => props.store,
    (state) => state.label,
  );
  return createComponent(Output, {
    get children() {
      return label();
    },
  });
}

/** Events whose server snapshot differs from the page's, as when the page has news. */
export function createMeetingSource(
  server: readonly Meeting[],
  client: readonly Meeting[] = server,
): CalendarEventSource<Meeting> & { readonly listeners: number } {
  const listeners = new Set<() => void>();
  return {
    get listeners() {
      return listeners.size;
    },
    getServerSnapshot: () => server,
    getSnapshot: () => client,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export const standup: Meeting = {
  id: "meeting-2",
  interval: {
    end: Temporal.Instant.from("2026-08-20T09:15:00Z"),
    kind: "timed",
    start: Temporal.Instant.from("2026-08-20T09:00:00Z"),
  },
  title: "Standup",
};

// A clock, not `now`: the server knows no today, so its HTML and hydration match, and the page
// shows today once it has hydrated.
const clock = createFixedClock(Temporal.Instant.from("2026-08-14T08:00:00Z"));

/** A month and an agenda from the engine, with every structural part, as an application has. */
export function CalendarApp(props: { readonly events: CalendarEventSource<Meeting> }): JSX.Element {
  return createComponent(Article, {
    get children() {
      return createComponent(EngineCalendar.Root, {
        clock,
        defaultAnchorDate: Temporal.PlainDate.from("2026-08-15"),
        defaultTimeZone: "UTC",
        defaultView: "month",
        get events() {
          return props.events;
        },
        label: "Team calendar",
        locale: "en-GB",
        weekRules,
        get children() {
          return createComponent(EngineCalendar.Frame, {
            get children() {
              return [
                createComponent(EngineCalendar.Toolbar, {
                  get children() {
                    return [
                      createComponent(EngineCalendar.PreviousTrigger, { children: "Previous" }),
                      createComponent(EngineCalendar.Title, {}),
                      createComponent(EngineCalendar.NextTrigger, { children: "Next" }),
                      createComponent(EngineCalendar.TodayTrigger, { children: "Today" }),
                      createComponent(EngineCalendar.ViewSwitcher, {
                        "aria-label": "View",
                        getViewLabel: (view: string) => view,
                      }),
                    ];
                  },
                }),
                createComponent(EngineCalendar.Viewport, {
                  get children() {
                    return createComponent(EngineCalendar.ActiveView, {});
                  },
                }),
              ];
            },
          });
        },
      });
    },
  });
}

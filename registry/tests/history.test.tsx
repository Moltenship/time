// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  createEventHistory,
  useCalendarHistory,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarHistory,
  type EventHistory,
} from "@moltenship/calendar";
import { act, useState } from "react";
import { afterEach, expect, test } from "vite-plus/test";

import { createWeekView } from "../time-grid-view/time-grid-view";
import { drag, layOut } from "./pointer";
import { render } from "./render";

type Meeting = CalendarEvent<null, string, string>;
type Change = CalendarEventChange<Meeting, string, string>;

const standup: Meeting = {
  data: null,
  end: Temporal.Instant.from("2026-10-08T10:00:00Z"),
  id: "standup",
  kind: "timed",
  start: Temporal.Instant.from("2026-10-08T09:00:00Z"),
  title: "Standup",
};

const Calendar = createCalendar<Meeting, never>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [createWeekView<Meeting>()],
});

let controls: CalendarHistory<Meeting, string, string> | undefined;
/** The application's events after its last save. */
let saved: readonly Meeting[] = [];

function Controls({ history }: { readonly history: EventHistory<Meeting, string, string> }) {
  controls = useCalendarHistory(history);
  return null;
}

function Application({ history }: { readonly history: EventHistory<Meeting, string, string> }) {
  const [events, setEvents] = useState<readonly Meeting[]>([standup]);
  saved = events;
  const save = (change: Change) =>
    setEvents((current) =>
      current.map((event) =>
        event.id === change.eventId && change.proposed !== null
          ? ({ ...event, ...change.proposed } as Meeting)
          : event,
      ),
    );
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      defaultView="week"
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T12:00:00Z")}
      onEventChange={save}
      onEventChangeResult={history.record}
      weekRules={{ firstDay: 1, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
      <Controls history={history} />
    </Calendar.Root>
  );
}

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

test("a pointer drag in the week view is undone and redone through onEventChange", async () => {
  const history = createEventHistory<Meeting, string, string>();
  const view = await render(<Application history={history} />);
  cleanup = view.unmount;

  // Monday-first columns, 100px wide and 100px per hour, below a 100px header.
  const hour = (hours: number) => 100 + hours * 100;
  const columns = [...view.container.querySelectorAll("[data-date]:not([data-all-day])")];
  const event = view.container.querySelector('[data-event-id="standup"]')!;
  layOut([
    [event, { height: 100, width: 100, x: 300, y: hour(9) }],
    ...columns.map(
      (column, index) => [column, { height: 2400, width: 100, x: index * 100, y: 100 }] as const,
    ),
  ]);
  drag(event, [
    [350, hour(9.5)],
    [360, hour(9.75)],
    [450, hour(11.5)],
  ]);
  await act(async () => undefined);
  const where = () => saved.find(({ id }) => id === "standup")?.start.toString();
  expect(controls!.past).toMatchObject([{ cause: "move", eventId: "standup", input: "pointer" }]);
  expect(where()).toBe("2026-10-09T11:00:00Z");

  let outcome: Awaited<ReturnType<CalendarHistory<Meeting, string, string>["undo"]>> | undefined;
  await act(async () => {
    outcome = await controls!.undo();
  });
  expect(outcome).toMatchObject({
    result: { change: { cause: "move", proposed: { start: standup.start } } },
    status: "committed",
  });
  expect(where()).toBe("2026-10-08T09:00:00Z");

  await act(async () => {
    outcome = await controls!.redo();
  });
  expect(outcome?.status).toBe("committed");
  expect(where()).toBe("2026-10-09T11:00:00Z");
  expect(controls!.future).toEqual([]);
});

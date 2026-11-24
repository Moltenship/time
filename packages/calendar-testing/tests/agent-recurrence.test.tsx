// @vitest-environment jsdom

import {
  createCalendar,
  defineCalendarView,
  plainDateInterval,
  type CalendarEventChange,
} from "@moltenship/calendar";
import {
  applyRecurrenceEdit,
  createCanonicalRecurrenceAdapter,
  createOccurrenceAdapter,
  createOccurrenceExpander,
  isRecurringChange,
  resolveRecurrenceEdit,
  type RecurrenceEditScope,
  type RecurrenceOccurrence,
  type RecurringCalendarEvent,
} from "@moltenship/calendar-recurrence";
import { createAgent } from "@ui-sdk/react/agent";
import { act, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, expect, test } from "vite-plus/test";

import { buildRecurringEvent } from "../src/index";

/**
 * An agent and a repeating event: what ID an agent sees for an occurrence, and what a change to
 * one gives the application. Only this package can render the React calendar with recurrence.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

const agent = createAgent();

type Series = RecurringCalendarEvent<null>;
type Occurrence = RecurrenceOccurrence<Series, string>;

const adapters = createCanonicalRecurrenceAdapter<null>();
const expander = createOccurrenceExpander(adapters);
const range = {
  end: Temporal.PlainDate.from("2026-10-26"),
  start: Temporal.PlainDate.from("2026-10-19"),
};

const week = defineCalendarView({
  name: "week",
  Renderer: () => null,
  strategy: {
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 7 })),
    getTitle: (visible) => `Week ${visible.start.toString()}`,
    navigate: (anchor, delta) => anchor.add({ days: delta * 7 }),
    project: () => null,
  },
});

const Calendar = createCalendar<Occurrence>()({
  eventAdapter: createOccurrenceAdapter(adapters.event),
  views: [week],
});

/** A daily standup, Monday to Wednesday of the week the calendar shows. */
const standup = buildRecurringEvent({
  id: "standup",
  rule: "FREQ=DAILY;COUNT=3",
  start: "2026-10-19T09:00",
  timeZone: "UTC",
  title: "Standup",
});

const roots: Root[] = [];
afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

/**
 * The application's side: it expands its series into occurrences, and applies a change to one with
 * the scope the agent asked for in its fields, `"this"` unless it said otherwise.
 */
function TeamCalendar({
  changes,
}: {
  readonly changes: CalendarEventChange<Occurrence, string, string>[];
}) {
  const [events, setEvents] = useState<readonly Series[]>([standup]);
  const { occurrences } = useMemo(
    () => expander.expand(events, { range, timeZone: "UTC" }),
    [events],
  );
  return (
    <Calendar.Root
      defaultAnchorDate={range.start}
      defaultTimeZone="UTC"
      events={occurrences}
      label="Team calendar"
      locale="en-GB"
      now={Temporal.Instant.from("2026-10-19T08:00:00Z")}
      onEventChange={(change, detail) => {
        changes.push(change);
        if (!isRecurringChange(change)) throw new Error("Only the standup is here.");
        const scope = (detail.fields?.scope ?? "this") as RecurrenceEditScope;
        const edit = resolveRecurrenceEdit(change, scope, adapters, {
          newSeriesId: "standup-2",
          occurrences,
          timeZone: "UTC",
        });
        if (edit.type === "rejected") throw new Error(edit.message);
        if (edit.type === "event") throw new Error("Not an edit of the series.");
        setEvents((current) =>
          applyRecurrenceEdit(current, edit, { createId: () => "override-1" }),
        );
      }}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame>
        <Calendar.Title />
      </Calendar.Frame>
    </Calendar.Root>
  );
}

async function render(changes: CalendarEventChange<Occurrence, string, string>[] = []) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<TeamCalendar changes={changes} />));
  return changes;
}

async function value<T>(action: string, ...args: unknown[]): Promise<T> {
  let outcome: Awaited<ReturnType<typeof agent.act>> | undefined;
  await act(async () => {
    outcome = await agent.act({ steps: [{ action, args, ref: "Team calendar" }] });
  });
  expect(outcome!.error).toBeUndefined();
  return outcome!.steps[0]!.result as T;
}

interface Listed {
  readonly id: string;
  readonly start: string;
  readonly title: string;
}

const starts = (events: readonly Listed[]) => events.map(({ id, start }) => `${id} ${start}`);

test("an agent sees each occurrence under its own ID: the series' and its original start", async () => {
  await render();

  expect(starts(await value<Listed[]>("listEvents"))).toEqual([
    "standup::2026-10-19T09:00:00Z 2026-10-19T09:00:00+00:00",
    "standup::2026-10-20T09:00:00Z 2026-10-20T09:00:00+00:00",
    "standup::2026-10-21T09:00:00Z 2026-10-21T09:00:00+00:00",
  ]);
});

test("moving one occurrence hands the application that occurrence, and moves only it", async () => {
  const changes = await render();

  const change = await value("moveEvent", {
    eventId: "standup::2026-10-20T09:00:00Z",
    start: "2026-10-20T11:00",
  });

  expect(change).toMatchObject({
    cause: "move",
    eventId: "standup::2026-10-20T09:00:00Z",
    status: "saved",
  });
  // The occurrence the agent named, with its series, as a person's drag gives it.
  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({ cause: "move", eventId: "standup::2026-10-20T09:00:00Z" });
  // The override keeps the occurrence's ID, so the agent can name it again.
  expect(starts(await value<Listed[]>("listEvents"))).toEqual([
    "standup::2026-10-19T09:00:00Z 2026-10-19T09:00:00+00:00",
    "standup::2026-10-20T09:00:00Z 2026-10-20T11:00:00+00:00",
    "standup::2026-10-21T09:00:00Z 2026-10-21T09:00:00+00:00",
  ]);
});

test("an agent asks for the whole series through its fields", async () => {
  await render();

  await value("updateEvent", {
    eventId: "standup::2026-10-20T09:00:00Z",
    fields: { scope: "all" },
    start: "2026-10-20T10:00",
  });

  // The series moved, so its occurrences start at new times, under IDs of their new starts.
  // An agent that held an old ID lists the events again before its next step.
  expect(starts(await value<Listed[]>("listEvents"))).toEqual([
    "standup::2026-10-19T10:00:00Z 2026-10-19T10:00:00+00:00",
    "standup::2026-10-20T10:00:00Z 2026-10-20T10:00:00+00:00",
    "standup::2026-10-21T10:00:00Z 2026-10-21T10:00:00+00:00",
  ]);
});

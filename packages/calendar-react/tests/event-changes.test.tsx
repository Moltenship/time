// @vitest-environment jsdom

import {
  defineEventAdapter,
  snapPolicy,
  type CalendarEventChange,
  type CalendarEventChangeHandler,
  type CalendarEventProposal,
  type CalendarPolicy,
  type CalendarTransactionResult,
  type EventId,
  type EventSnapshot,
  type ResourceId,
} from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";
import { act, useState, type ReactNode } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  type CalendarViewActions,
} from "@moltenship/calendar-react";

import { gateWeekRules } from "./harness/builders";
import { renderWithHarness, type ReactRootHarness } from "./harness/render-harness";
import "./setup";

interface Meeting {
  readonly end: Temporal.Instant;
  readonly id: string;
  readonly locked?: boolean;
  readonly start: Temporal.Instant;
  readonly title: string;
}

type Change = CalendarEventChange<Meeting, string, string>;
type Handler = CalendarEventChangeHandler<Meeting, string, string>;
type Result = CalendarTransactionResult<unknown, EventId, ResourceId>;

const meetings: readonly Meeting[] = Object.freeze([
  {
    end: Temporal.Instant.from("2026-08-15T10:00:00Z"),
    id: "standup",
    start: Temporal.Instant.from("2026-08-15T09:00:00Z"),
    title: "Standup",
  },
  {
    end: Temporal.Instant.from("2026-08-15T16:00:00Z"),
    id: "review",
    locked: true,
    start: Temporal.Instant.from("2026-08-15T15:00:00Z"),
    title: "Review",
  },
]);

let viewActions: CalendarViewActions | undefined;
let rendererEvents: EventSnapshot<unknown, EventId, ResourceId> | undefined;

const agendaView = defineCalendarView({
  name: "agenda",
  strategy: {
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 1 })),
    getTitle: (range) => range.start.toString(),
    navigate: (anchor, delta) => anchor.add({ days: delta }),
    project: ({ instantRange, snapshot }) => snapshot.queryTimed(instantRange),
  },
  Renderer({ actions, events, projection }) {
    viewActions = actions;
    rendererEvents = events;
    return (
      <ol>
        {projection.map((event) => (
          <li key={event.id}>
            {`${event.title} ${event.start.toString()}${event.isPending === true ? " (pending)" : ""}`}
          </li>
        ))}
      </ol>
    );
  },
});

const MeetingCalendar = createCalendar<Meeting>()({
  eventAdapter: defineEventAdapter<Meeting>()({
    getId: (meeting) => meeting.id,
    getInterval: (meeting) => ({ end: meeting.end, kind: "timed", start: meeting.start }),
    getResourceIds: (): readonly string[] => [],
    getTitle: (meeting) => meeting.title,
    isReadOnly: (meeting) => meeting.locked === true,
  }),
  views: [agendaView],
});

let updateEvents:
  | ((update: (events: readonly Meeting[]) => readonly Meeting[]) => void)
  | undefined;

function applyChange(events: readonly Meeting[], change: Change): readonly Meeting[] {
  return events.map((meeting) =>
    meeting.id === change.eventId && change.proposed?.kind === "timed"
      ? { ...meeting, end: change.proposed.end, start: change.proposed.start }
      : meeting,
  );
}

/** An application that owns its events, as the calendar's `events` prop expects. */
function Application(props: {
  readonly children?: ReactNode;
  readonly controlledTimeZone?: boolean;
  readonly onEventChange?: Handler;
  readonly policies?: readonly CalendarPolicy<Meeting, string, string>[];
}) {
  const [events, setEvents] = useState(meetings);
  const [timeZone, setTimeZone] = useState("UTC");
  updateEvents = setEvents;
  return (
    <MeetingCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
      {...(props.controlledTimeZone === true
        ? { onTimeZoneChange: (next: string) => setTimeZone(next), timeZone }
        : { defaultTimeZone: "UTC" })}
      events={events}
      locale="en-GB"
      onEventChange={props.onEventChange}
      policies={props.policies}
      weekRules={gateWeekRules}
    >
      <MeetingCalendar.ActiveView />
      <MeetingCalendar.Event eventId="standup">
        {({ normalized }) => <output>{normalized.isPending === true ? "saving" : "saved"}</output>}
      </MeetingCalendar.Event>
      {props.children}
    </MeetingCalendar.Root>
  );
}

const harnesses: ReactRootHarness[] = [];

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.dispose();
  document.body.replaceChildren();
  rendererEvents = undefined;
  viewActions = undefined;
  updateEvents = undefined;
});

async function render(element: React.ReactNode): Promise<ReactRootHarness> {
  const harness = await renderWithHarness(element);
  harnesses.push(harness);
  return harness;
}

function visible(harness: ReactRootHarness): string[] {
  return [...harness.container.querySelectorAll("li, output")].map((node) => node.textContent);
}

function interval(
  placement: { readonly end: unknown; readonly start: unknown } | null | undefined,
) {
  return placement == null ? undefined : `${String(placement.start)}/${String(placement.end)}`;
}

function move(
  start: string,
  end: string,
  eventId = "standup",
): CalendarEventProposal<string, string> {
  return {
    cause: "move",
    eventId,
    proposed: {
      end: Temporal.Instant.from(end),
      kind: "timed",
      start: Temporal.Instant.from(start),
    },
  };
}

/** Proposes through the renderer's actions, as a pointer layer would, and flushes the render. */
async function propose(
  proposal: CalendarEventProposal<EventId, ResourceId>,
): Promise<{ readonly result: Promise<Result> }> {
  let result!: Promise<Result>;
  await act(async () => {
    result = viewActions!.proposeEventChange(proposal);
  });
  return { result };
}

async function apply(change: Change): Promise<void> {
  await act(async () => updateEvents!((events) => applyChange(events, change)));
}

test("a synchronous handler commits through the application's events", async () => {
  const handler = vi.fn<Handler>((change) =>
    updateEvents!((events) => applyChange(events, change)),
  );
  const harness = await render(<Application onEventChange={handler} />);

  const { result } = await propose(move("2026-08-15T11:00:00Z", "2026-08-15T12:00:00Z"));

  expect(visible(harness)).toEqual([
    "Standup 2026-08-15T11:00:00Z",
    "Review 2026-08-15T15:00:00Z",
    "saved",
  ]);
  await expect(result).resolves.toMatchObject({ status: "committed" });
  // toMatchObject treats any two Temporal values as equal, so intervals are compared as strings.
  const [change] = handler.mock.calls[0]!;
  expect(change).toMatchObject({ cause: "move", event: meetings[0], eventId: "standup" });
  expect(interval(change.original)).toBe("2026-08-15T09:00:00Z/2026-08-15T10:00:00Z");
});

test("an async change renders as pending in every view until the new events confirm it", async () => {
  const saving = Promise.withResolvers<void>();
  let received: Change | undefined;
  const harness = await render(
    <Application
      onEventChange={(change) => {
        received = change;
        return saving.promise;
      }}
    />,
  );

  const { result } = await propose(move("2026-08-15T11:00:00Z", "2026-08-15T12:00:00Z"));
  expect(visible(harness)).toEqual([
    "Standup 2026-08-15T11:00:00Z (pending)",
    "Review 2026-08-15T15:00:00Z",
    "saving",
  ]);
  // Renderers get the same pending state to resolve pointer targets against.
  expect(rendererEvents?.get("standup")).toMatchObject({ isPending: true });

  await act(async () => saving.resolve());
  await expect(result).resolves.toMatchObject({ status: "committed" });
  // The request resolved before the application's events caught up; the change stays visible.
  expect(visible(harness)[0]).toBe("Standup 2026-08-15T11:00:00Z (pending)");

  await apply(received!);
  expect(visible(harness)).toEqual([
    "Standup 2026-08-15T11:00:00Z",
    "Review 2026-08-15T15:00:00Z",
    "saved",
  ]);
});

test("a rejected change rolls back without leaving a stale preview", async () => {
  const saving = Promise.withResolvers<void>();
  const harness = await render(<Application onEventChange={() => saving.promise} />);

  const { result } = await propose(move("2026-08-15T11:00:00Z", "2026-08-15T12:00:00Z"));
  await act(async () => saving.reject(new Error("conflict")));

  await expect(result).resolves.toMatchObject({ reason: "handler-error", status: "rejected" });
  expect(visible(harness)).toEqual([
    "Standup 2026-08-15T09:00:00Z",
    "Review 2026-08-15T15:00:00Z",
    "saved",
  ]);
});

test("the latest proposal for an event wins a race", async () => {
  const requests: PromiseWithResolvers<void>[] = [];
  const harness = await render(
    <Application
      onEventChange={() => {
        const request = Promise.withResolvers<void>();
        requests.push(request);
        return request.promise;
      }}
    />,
  );

  await propose(move("2026-08-15T11:00:00Z", "2026-08-15T12:00:00Z"));
  await propose(move("2026-08-15T13:00:00Z", "2026-08-15T14:00:00Z"));
  expect(visible(harness)[0]).toBe("Standup 2026-08-15T13:00:00Z (pending)");

  await act(async () => requests[0]!.resolve());
  expect(visible(harness)[0]).toBe("Standup 2026-08-15T13:00:00Z (pending)");

  await act(async () => requests[1]!.reject(new Error("conflict")));
  expect(visible(harness)[0]).toBe("Standup 2026-08-15T09:00:00Z");
});

test("new events that do not include a resolved change replace its preview", async () => {
  const harness = await render(<Application onEventChange={async () => {}} />);

  await propose(move("2026-08-15T11:00:00Z", "2026-08-15T12:00:00Z"));
  expect(visible(harness)[0]).toBe("Standup 2026-08-15T11:00:00Z (pending)");

  const lunch: Meeting = {
    end: Temporal.Instant.from("2026-08-15T13:00:00Z"),
    id: "lunch",
    start: Temporal.Instant.from("2026-08-15T12:00:00Z"),
    title: "Lunch",
  };
  await act(async () => updateEvents!((events) => [...events, lunch]));
  expect(visible(harness)[0]).toBe("Standup 2026-08-15T09:00:00Z");
});

test("read-only events and calendars without a handler reject changes", async () => {
  const handler = vi.fn<Handler>();
  const harness = await render(<Application onEventChange={handler} />);

  const { result: locked } = await propose(
    move("2026-08-15T17:00:00Z", "2026-08-15T18:00:00Z", "review"),
  );
  await expect(locked).resolves.toMatchObject({ reason: "read-only", status: "rejected" });
  expect(handler).not.toHaveBeenCalled();

  await harness.render(<Application />);
  const { result: unhandled } = await propose(move("2026-08-15T11:00:00Z", "2026-08-15T12:00:00Z"));
  await expect(unhandled).resolves.toEqual({ reason: "read-only", status: "rejected" });
  expect(visible(harness)[0]).toBe("Standup 2026-08-15T09:00:00Z");
});

test("root policies adjust a change before the handler sees it", async () => {
  const handler = vi.fn<Handler>();
  await render(<Application onEventChange={handler} policies={[snapPolicy({ minutes: 30 })]} />);

  await propose(move("2026-08-15T11:10:00Z", "2026-08-15T12:10:00Z"));

  expect(interval(handler.mock.calls[0]?.[0].proposed)).toBe(
    "2026-08-15T11:00:00Z/2026-08-15T12:00:00Z",
  );
});

test.each([false, true])(
  "a proposal uses a time zone requested earlier in the same handler (controlled: %s)",
  async (controlledTimeZone) => {
    const handler = vi.fn<Handler>();
    let actions: ReturnType<typeof MeetingCalendar.useCalendarActions> | undefined;
    function CaptureActions() {
      actions = MeetingCalendar.useCalendarActions();
      return null;
    }
    await render(
      <Application
        controlledTimeZone={controlledTimeZone}
        onEventChange={handler}
        policies={[snapPolicy({ hours: 1 })]}
      >
        <CaptureActions />
      </Application>,
    );

    await act(async () => {
      actions!.setTimeZone("Asia/Kolkata");
      void actions!.proposeEventChange(move("2026-08-15T11:10:00Z", "2026-08-15T12:10:00Z"));
    });

    // Hourly snapping in Kolkata (UTC+05:30) lands on the half hour in UTC.
    expect(interval(handler.mock.calls[0]?.[0].proposed)).toBe(
      "2026-08-15T11:30:00Z/2026-08-15T12:30:00Z",
    );
  },
);

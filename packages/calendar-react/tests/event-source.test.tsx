// @vitest-environment jsdom

import {
  defineEventAdapter,
  type CalendarEventChange,
  type CalendarEventChangeHandler,
  type CalendarEventInput,
  type CalendarEventSource,
  type CalendarTransactionResult,
  type EventId,
  type ResourceId,
} from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";
import { act, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, expect, expectTypeOf, test, vi } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  type CalendarViewActions,
} from "@moltenship/calendar-react";

import { gateWeekRules } from "./harness/builders";
import {
  hydrateWithHarness,
  renderWithHarness,
  type ReactRootHarness,
} from "./harness/render-harness";
import "./setup";

interface Meeting {
  readonly end: Temporal.Instant;
  readonly id: string;
  readonly start: Temporal.Instant;
  readonly title: string;
}

type Change = CalendarEventChange<Meeting, string, string>;
type Handler = CalendarEventChangeHandler<Meeting, string, string>;
type Result = CalendarTransactionResult<unknown, EventId, ResourceId>;

function meeting(id: string, start: string, end: string, title = id): Meeting {
  return Object.freeze({
    end: Temporal.Instant.from(`2026-08-15T${end}:00Z`),
    id,
    start: Temporal.Instant.from(`2026-08-15T${start}:00Z`),
    title,
  });
}

const standup = meeting("standup", "09:00", "10:00", "Standup");
const review = meeting("review", "15:00", "16:00", "Review");
const lunch = meeting("lunch", "12:00", "13:00", "Lunch");

let viewActions: CalendarViewActions | undefined;

const agendaView = defineCalendarView({
  name: "agenda",
  strategy: {
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 1 })),
    getTitle: (range) => range.start.toString(),
    navigate: (anchor, delta) => anchor.add({ days: delta }),
    project: ({ instantRange, snapshot }) => snapshot.queryTimed(instantRange),
  },
  Renderer({ actions, projection }) {
    viewActions = actions;
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
    getId: (record) => record.id,
    getInterval: (record) => ({ end: record.end, kind: "timed", start: record.start }),
    getResourceIds: (): readonly string[] => [],
    getTitle: (record) => record.title,
  }),
  views: [agendaView],
});

/** A Zustand-like store: the events live outside React, and listeners hear each change. */
function createMeetingStore(serverEvents: readonly Meeting[]) {
  let events = serverEvents;
  const listeners = new Set<() => void>();
  const source: CalendarEventSource<Meeting> = {
    getServerSnapshot: () => serverEvents,
    getSnapshot: () => events,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    listeners,
    set(next: readonly Meeting[]) {
      events = next;
      for (const listener of listeners) listener();
    },
    source,
    update(update: (current: readonly Meeting[]) => readonly Meeting[]) {
      this.set(update(events));
    },
  };
}

function applyChange(events: readonly Meeting[], change: Change): readonly Meeting[] {
  return events.map((record) =>
    record.id === change.eventId && change.proposed?.kind === "timed"
      ? { ...record, end: change.proposed.end, start: change.proposed.start }
      : record,
  );
}

let parentRenders = 0;

/** Renders `Root` from a parent that counts its own renders. */
function Application(props: {
  readonly children?: ReactNode;
  readonly events: CalendarEventInput<Meeting>;
  readonly onEventChange?: Handler;
}) {
  parentRenders += 1;
  return (
    <MeetingCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
      defaultTimeZone="UTC"
      events={props.events}
      locale="en-GB"
      onEventChange={props.onEventChange}
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
  parentRenders = 0;
  viewActions = undefined;
  vi.restoreAllMocks();
});

async function render(element: ReactNode): Promise<ReactRootHarness> {
  const harness = await renderWithHarness(element);
  harnesses.push(harness);
  return harness;
}

function visible(container: HTMLElement): string[] {
  return [...container.querySelectorAll("li, output")].map((node) => node.textContent);
}

function move(start: string, end: string) {
  return {
    cause: "move",
    eventId: "standup",
    proposed: {
      end: Temporal.Instant.from(`2026-08-15T${end}:00Z`),
      kind: "timed",
      start: Temporal.Instant.from(`2026-08-15T${start}:00Z`),
    },
  } as const;
}

/** Proposes as a pointer layer would and flushes the render; the result settles later. */
async function propose(
  proposal: ReturnType<typeof move>,
): Promise<{ readonly result: Promise<Result> }> {
  let result!: Promise<Result>;
  await act(async () => {
    result = viewActions!.proposeEventChange(proposal);
  });
  return { result };
}

test("Root takes an array or a source as events", () => {
  type EventsProp = React.ComponentProps<typeof MeetingCalendar.Root>["events"];
  expectTypeOf<readonly Meeting[]>().toExtend<EventsProp>();
  expectTypeOf<CalendarEventSource<Meeting>>().toExtend<EventsProp>();
  expectTypeOf<CalendarEventSource<{ readonly id: string }>>().not.toExtend<EventsProp>();
});

test("a source's updates render the calendar without its parent", async () => {
  const store = createMeetingStore([standup]);
  const harness = await render(<Application events={store.source} />);
  expect(visible(harness.container)).toEqual(["Standup 2026-08-15T09:00:00Z", "saved"]);
  expect(store.listeners.size).toBe(1);
  const rendersBefore = parentRenders;

  await act(async () => store.set([standup, lunch, review]));
  expect(visible(harness.container)).toEqual([
    "Standup 2026-08-15T09:00:00Z",
    "Lunch 2026-08-15T12:00:00Z",
    "Review 2026-08-15T15:00:00Z",
    "saved",
  ]);

  await act(async () => store.update((events) => events.filter(({ id }) => id !== "lunch")));
  expect(visible(harness.container)).toEqual([
    "Standup 2026-08-15T09:00:00Z",
    "Review 2026-08-15T15:00:00Z",
    "saved",
  ]);
  expect(parentRenders).toBe(rendersBefore);
});

test("a source's new array holding the same records reuses the snapshot", async () => {
  const store = createMeetingStore([standup, review]);
  const snapshots: unknown[] = [];
  function Snapshot() {
    snapshots.push(MeetingCalendar.useCalendarMeta().eventSnapshot);
    return null;
  }
  await render(
    <Application events={store.source}>
      <Snapshot />
    </Application>,
  );

  await act(async () => store.set([standup, review]));
  expect(new Set(snapshots).size).toBe(1);
});

test("the server renders a source's server snapshot", () => {
  const store = createMeetingStore([standup]);
  store.set([standup, lunch]);
  const getSnapshot = vi.spyOn(store.source, "getSnapshot");
  const subscribe = vi.spyOn(store.source, "subscribe");

  const markup = renderToString(<Application events={store.source} />);

  expect(markup).toContain("Standup 2026-08-15T09:00:00Z");
  expect(markup).not.toContain("Lunch");
  expect(getSnapshot).not.toHaveBeenCalled();
  expect(subscribe).not.toHaveBeenCalled();
  expect(renderToString(<Application events={store.source} />)).toBe(markup);
});

test("a source hydrates from its server snapshot, then shows its current events", async () => {
  const serverStore = createMeetingStore([standup]);
  const clientStore = createMeetingStore([standup]);
  // The client's store moved on before hydration, as a websocket message would move it.
  clientStore.set([standup, lunch]);
  const consoleErrors = vi.spyOn(console, "error").mockImplementation(() => undefined);

  const harness = await hydrateWithHarness(<Application events={serverStore.source} />, {
    clientElement: <Application events={clientStore.source} />,
  });
  harnesses.push(harness);

  expect(harness.serverMarkup).not.toContain("Lunch");
  expect(harness.recoverableErrors).toEqual([]);
  expect(consoleErrors).not.toHaveBeenCalled();
  expect(visible(harness.container)).toEqual([
    "Standup 2026-08-15T09:00:00Z",
    "Lunch 2026-08-15T12:00:00Z",
    "saved",
  ]);

  await act(async () => clientStore.set([lunch]));
  expect(visible(harness.container)).toEqual(["Lunch 2026-08-15T12:00:00Z"]);
});

test("a source hydrates without a mismatch when its events match the server's", async () => {
  const store = createMeetingStore([standup, review]);
  const harness = await hydrateWithHarness(<Application events={store.source} />);
  harnesses.push(harness);

  expect(harness.hydratedWithoutMutation).toBe(true);
  expect(harness.recoverableErrors).toEqual([]);
});

test("Root unsubscribes from a source when it unmounts or the source goes", async () => {
  const first = createMeetingStore([standup]);
  const second = createMeetingStore([review]);
  const harness = await render(<Application events={first.source} />);
  expect(first.listeners.size).toBe(1);

  await harness.render(<Application events={second.source} />);
  expect(first.listeners.size).toBe(0);
  expect(second.listeners.size).toBe(1);
  expect(visible(harness.container)).toEqual(["Review 2026-08-15T15:00:00Z"]);

  await harness.render(<Application events={[lunch]} />);
  expect(second.listeners.size).toBe(0);
  expect(visible(harness.container)).toEqual(["Lunch 2026-08-15T12:00:00Z"]);

  await harness.render(<Application events={second.source} />);
  expect(second.listeners.size).toBe(1);
  await harness.unmount();
  expect(second.listeners.size).toBe(0);
});

test("Strict Mode leaves one subscription to a source, and none after unmount", async () => {
  const store = createMeetingStore([standup]);
  const harness = await renderWithHarness(<Application events={store.source} />, {
    strictMode: true,
  });
  harnesses.push(harness);
  expect(store.listeners.size).toBe(1);

  await act(async () => store.set([lunch]));
  expect(visible(harness.container)).toEqual(["Lunch 2026-08-15T12:00:00Z"]);
  await harness.unmount();
  expect(store.listeners.size).toBe(0);
});

test("switching between an array and a source with the same records keeps the snapshot", async () => {
  const store = createMeetingStore([standup, review]);
  const snapshots: unknown[] = [];
  function Snapshot() {
    snapshots.push(MeetingCalendar.useCalendarMeta().eventSnapshot);
    return null;
  }
  const harness = await render(
    <Application events={[standup, review]}>
      <Snapshot />
    </Application>,
  );
  await harness.render(
    <Application events={store.source}>
      <Snapshot />
    </Application>,
  );
  await harness.render(
    <Application events={[standup, review]}>
      <Snapshot />
    </Application>,
  );

  expect(new Set(snapshots).size).toBe(1);
});

test("a source that calls its methods on itself works", async () => {
  class MeetingFeed implements CalendarEventSource<Meeting> {
    #events: readonly Meeting[] = [standup];
    readonly #listeners = new Set<() => void>();

    getServerSnapshot() {
      return this.#events;
    }

    getSnapshot() {
      return this.#events;
    }

    push(record: Meeting) {
      this.#events = [...this.#events, record];
      for (const listener of this.#listeners) listener();
    }

    subscribe(listener: () => void) {
      this.#listeners.add(listener);
      return () => this.#listeners.delete(listener);
    }
  }
  const feed = new MeetingFeed();
  const harness = await render(<Application events={feed} />);

  await act(async () => feed.push(lunch));
  expect(visible(harness.container)).toEqual([
    "Standup 2026-08-15T09:00:00Z",
    "Lunch 2026-08-15T12:00:00Z",
    "saved",
  ]);
});

test("a synchronous handler commits through the source", async () => {
  const store = createMeetingStore([standup]);
  const handler = vi.fn<Handler>((change) => store.update((events) => applyChange(events, change)));
  const harness = await render(<Application events={store.source} onEventChange={handler} />);

  const { result } = await propose(move("11:00", "12:00"));

  await expect(result).resolves.toMatchObject({ status: "committed" });
  expect(visible(harness.container)).toEqual(["Standup 2026-08-15T11:00:00Z", "saved"]);
});

test("a pending change waits for the source to confirm it after the save resolves", async () => {
  const store = createMeetingStore([standup]);
  const saving = Promise.withResolvers<void>();
  let received: Change | undefined;
  const harness = await render(
    <Application
      events={store.source}
      onEventChange={(change) => {
        received = change;
        return saving.promise;
      }}
    />,
  );

  const { result } = await propose(move("11:00", "12:00"));
  expect(visible(harness.container)).toEqual(["Standup 2026-08-15T11:00:00Z (pending)", "saving"]);

  await act(async () => saving.resolve());
  await expect(result).resolves.toMatchObject({ status: "committed" });
  expect(visible(harness.container)).toEqual(["Standup 2026-08-15T11:00:00Z (pending)", "saving"]);

  // The server confirms the change through the store, as a websocket message would.
  await act(async () => store.update((events) => applyChange(events, received!)));
  expect(visible(harness.container)).toEqual(["Standup 2026-08-15T11:00:00Z", "saved"]);
});

test("a source that confirms a change before its save resolves ends it when the save does", async () => {
  const store = createMeetingStore([standup]);
  const saving = Promise.withResolvers<void>();
  const harness = await render(
    <Application
      events={store.source}
      onEventChange={(change) => {
        store.update((events) => applyChange(events, change));
        return saving.promise;
      }}
    />,
  );

  const { result } = await propose(move("11:00", "12:00"));
  // The handler is still running, so the change stays pending.
  expect(visible(harness.container)).toEqual(["Standup 2026-08-15T11:00:00Z (pending)", "saving"]);

  await act(async () => saving.resolve());
  await expect(result).resolves.toMatchObject({ status: "committed" });
  expect(visible(harness.container)).toEqual(["Standup 2026-08-15T11:00:00Z", "saved"]);
});

test("a source's update that leaves a saved change out replaces its preview", async () => {
  const store = createMeetingStore([standup]);
  const harness = await render(
    <Application events={store.source} onEventChange={async () => undefined} />,
  );

  await propose(move("11:00", "12:00"));
  expect(visible(harness.container)).toEqual(["Standup 2026-08-15T11:00:00Z (pending)", "saving"]);

  await act(async () => store.set([standup, lunch]));
  expect(visible(harness.container)).toEqual([
    "Standup 2026-08-15T09:00:00Z",
    "Lunch 2026-08-15T12:00:00Z",
    "saved",
  ]);
});

test("a change pending when the events switch to a source reconciles against the source", async () => {
  const store = createMeetingStore([standup]);
  const saving = Promise.withResolvers<void>();
  let received: Change | undefined;
  const handler: Handler = (change) => {
    received = change;
    return saving.promise;
  };
  const harness = await render(<Application events={[standup]} onEventChange={handler} />);

  await propose(move("11:00", "12:00"));
  await harness.render(<Application events={store.source} onEventChange={handler} />);
  expect(visible(harness.container)).toEqual(["Standup 2026-08-15T11:00:00Z (pending)", "saving"]);

  await act(async () => saving.resolve());
  await act(async () => store.update((events) => applyChange(events, received!)));
  expect(visible(harness.container)).toEqual(["Standup 2026-08-15T11:00:00Z", "saved"]);
});

// @vitest-environment jsdom

import { plainDateInterval, weekRange, type CalendarEventPlacement } from "@moltenship/calendar";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, test, vi } from "vite-plus/test";

import QueryPreviewCalendar from "../components/query-preview/calendar";
import { createSampleEvents } from "../components/query-preview/events";
import {
  createFakeEventsApi,
  overlapsWindow,
  type ApiEvent,
  type EventsApi,
  type EventsWindow,
} from "../content/examples/query-api";
import { EventsCalendar } from "../content/examples/query-calendar";
import {
  eventsQuery,
  eventsWindow,
  putEvent,
  shiftWindow,
  useSaveEvent,
  writeOf,
  type ApiEventChange,
  type EventWrite,
} from "../content/examples/query-events";

import { TooltipProvider } from "@registry/ui/tooltip";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let cleanup: (() => Promise<void>) | undefined;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("matchMedia", () => ({
    addEventListener() {},
    matches: true,
    removeEventListener() {},
  }));
});

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

const berlin = "Europe/Berlin";
const date = (value: string) => Temporal.PlainDate.from(value);
const range = (start: string, end: string) => plainDateInterval(date(start), date(end));
const months = (start: string, end: string): EventsWindow => ({ end, start, timeZone: berlin });

function timedEvent(id: string, start: string, end: string): ApiEvent {
  return { allDay: false, color: "blue", end, id, start, title: id, version: 1 };
}

function allDayEvent(id: string, start: string, end: string): ApiEvent {
  return { allDay: true, color: "green", end, id, start, title: id, version: 1 };
}

describe("eventsWindow", () => {
  test("loads the month holding the middle of the range, and one month either side", () => {
    expect(eventsWindow(range("2026-10-12", "2026-10-19"), berlin)).toEqual(
      months("2026-09-01", "2026-12-01"),
    );
    // Every week whose middle day is in October shares that window, even across the month's edges.
    expect(eventsWindow(range("2026-09-28", "2026-10-05"), berlin)).toEqual(
      months("2026-09-01", "2026-12-01"),
    );
    expect(eventsWindow(range("2026-10-26", "2026-11-02"), berlin)).toEqual(
      months("2026-09-01", "2026-12-01"),
    );
  });

  test("the next window is the previous one a month on", () => {
    const october = eventsWindow(range("2026-10-26", "2026-11-02"), berlin);
    const november = eventsWindow(range("2026-11-02", "2026-11-09"), berlin);
    expect(november).toEqual(shiftWindow(october, 1));
    expect(shiftWindow(november, -1)).toEqual(october);

    // A month view's six weeks move the same way.
    const octoberGrid = eventsWindow(range("2026-09-28", "2026-11-09"), berlin);
    const novemberGrid = eventsWindow(range("2026-10-26", "2026-12-07"), berlin);
    expect(octoberGrid).toEqual(october);
    expect(novemberGrid).toEqual(shiftWindow(octoberGrid, 1));
  });

  test("grows to hold a long load range, such as a scrolling month's", () => {
    // October's six weeks, from 28 September, and six more either side.
    expect(eventsWindow(range("2026-08-17", "2026-12-21"), berlin)).toEqual(
      months("2026-08-01", "2027-01-01"),
    );
  });

  test("always holds the whole load range", () => {
    for (let offset = 0; offset < 400; offset += 3) {
      const start = date("2026-01-01").add({ days: offset });
      for (const days of [1, 3, 7, 21, 42, 84, 120]) {
        const loadRange = plainDateInterval(start, start.add({ days }));
        const { end, start: first } = eventsWindow(loadRange, berlin);
        expect(Temporal.PlainDate.compare(first, loadRange.start)).toBeLessThanOrEqual(0);
        expect(Temporal.PlainDate.compare(loadRange.end, end)).toBeLessThanOrEqual(0);
      }
    }
  });
});

describe("overlapsWindow", () => {
  const october = months("2026-10-01", "2026-11-01");

  test("finds events that cross the window's edges", () => {
    // From the last evening of September, Berlin time, into October.
    expect(
      overlapsWindow(timedEvent("a", "2026-09-30T20:00:00Z", "2026-10-01T02:00:00Z"), october),
    ).toBe(true);
    expect(overlapsWindow(allDayEvent("b", "2026-10-30", "2026-11-03"), october)).toBe(true);
    expect(overlapsWindow(allDayEvent("c", "2026-09-01", "2026-12-01"), october)).toBe(true);
  });

  test("leaves out events that only touch an edge, since ends are exclusive", () => {
    // October starts at 22:00 UTC on 30 September in Berlin.
    expect(
      overlapsWindow(timedEvent("a", "2026-09-30T21:00:00Z", "2026-09-30T22:00:00Z"), october),
    ).toBe(false);
    expect(overlapsWindow(allDayEvent("b", "2026-11-01", "2026-11-02"), october)).toBe(false);
    expect(overlapsWindow(allDayEvent("c", "2026-09-29", "2026-10-01"), october)).toBe(false);
  });

  test("reads timed events in the window's time zone", () => {
    // 01:00 on 1 October in Tokyo, but still 30 September in UTC.
    const event = timedEvent("a", "2026-09-30T16:00:00Z", "2026-09-30T17:00:00Z");
    expect(overlapsWindow(event, { ...october, timeZone: "Asia/Tokyo" })).toBe(true);
    expect(overlapsWindow(event, { ...october, timeZone: "UTC" })).toBe(false);
  });
});

describe("putEvent", () => {
  const api = createFakeEventsApi([], { latency: 0 });
  const september = months("2026-08-01", "2026-11-01");
  const october = months("2026-09-01", "2026-12-01");
  const november = months("2026-10-01", "2027-01-01");
  const read = (client: QueryClient, dates: EventsWindow) =>
    client.getQueryData(eventsQuery(api, dates).queryKey)?.map((event) => event.id);

  function cache(events: readonly ApiEvent[]) {
    const client = new QueryClient();
    for (const dates of [september, october, november]) {
      client.setQueryData(
        eventsQuery(api, dates).queryKey,
        events.filter((event) => overlapsWindow(event, dates)),
      );
    }
    return client;
  }

  const first = timedEvent("first", "2026-09-15T08:00:00Z", "2026-09-15T09:00:00Z");
  const moved = timedEvent("moved", "2026-10-15T08:00:00Z", "2026-10-15T09:00:00Z");
  const last = timedEvent("last", "2026-10-20T08:00:00Z", "2026-10-20T09:00:00Z");

  test("moves an event between windows, and keeps its place in those that still hold it", () => {
    const client = cache([first, moved, last]);
    expect(read(client, september)).toEqual(["first", "moved", "last"]);
    expect(read(client, october)).toEqual(["first", "moved", "last"]);
    expect(read(client, november)).toEqual(["moved", "last"]);

    putEvent(client, "moved", {
      ...moved,
      end: "2026-12-10T09:00:00Z",
      start: "2026-12-10T08:00:00Z",
    });

    expect(read(client, september)).toEqual(["first", "last"]);
    expect(read(client, october)).toEqual(["first", "last"]);
    expect(read(client, november)).toEqual(["moved", "last"]);

    putEvent(client, "moved", { ...moved, title: "Renamed" });
    expect(read(client, october)).toEqual(["first", "last", "moved"]);
    expect(read(client, november)).toEqual(["moved", "last"]);
    expect(client.getQueryData(eventsQuery(api, november).queryKey)?.[0]?.title).toBe("Renamed");
  });

  test("null takes the event out everywhere, and other windows keep their data", () => {
    const client = cache([first, moved, last]);
    const novemberData = client.getQueryData(eventsQuery(api, november).queryKey);

    putEvent(client, "first", null);

    expect(read(client, september)).toEqual(["moved", "last"]);
    expect(read(client, october)).toEqual(["moved", "last"]);
    expect(client.getQueryData(eventsQuery(api, november).queryKey)).toBe(novemberData);
  });
});

describe("writeOf", () => {
  const event = timedEvent("standup", "2026-10-12T07:30:00Z", "2026-10-12T07:45:00Z");
  const original: CalendarEventPlacement<never> = {
    end: Temporal.Instant.from(event.end),
    kind: "timed",
    resourceIds: [],
    start: Temporal.Instant.from(event.start),
  };

  test("a move or resize writes the event at its new times", () => {
    const write = writeOf({
      cause: "move",
      event,
      eventId: event.id,
      id: "change-1",
      original,
      proposed: {
        ...original,
        end: Temporal.Instant.from("2026-10-13T09:15:00Z"),
        start: Temporal.Instant.from("2026-10-13T09:00:00Z"),
      },
    });
    expect(write).toEqual({
      after: { ...event, end: "2026-10-13T09:15:00Z", start: "2026-10-13T09:00:00Z" },
      before: event,
      id: "standup",
    });
  });

  test("a drop on the all-day row writes dates", () => {
    const write = writeOf({
      cause: "move",
      event,
      eventId: event.id,
      id: "change-1",
      original,
      proposed: {
        end: date("2026-10-15"),
        kind: "all-day",
        resourceIds: [],
        start: date("2026-10-14"),
      },
    });
    expect(write.after).toMatchObject({ allDay: true, end: "2026-10-15", start: "2026-10-14" });
  });

  test("a new event gets its ID before it's saved", () => {
    const write = writeOf({
      cause: "create",
      event: null,
      eventId: null,
      id: "change-1",
      original: null,
      proposed: original,
    } satisfies ApiEventChange);
    expect(write.before).toBeNull();
    expect(write.after).toMatchObject({ allDay: false, id: write.id, start: event.start });
    expect(write.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("a delete writes nothing after", () => {
    expect(
      writeOf({
        cause: "delete",
        event,
        eventId: event.id,
        id: "change-1",
        original,
        proposed: null,
      }),
    ).toEqual({ after: null, before: event, id: "standup" });
  });
});

describe("createFakeEventsApi", () => {
  test("answers with copies, and counts versions", async () => {
    const event = timedEvent("a", "2026-10-12T07:30:00Z", "2026-10-12T07:45:00Z");
    const api = createFakeEventsApi([event], { latency: 0 });
    const [listed] = await api.listEvents(months("2026-10-01", "2026-11-01"));
    expect(listed).toEqual(event);
    expect(listed).not.toBe(event);

    expect((await api.updateEvent({ ...event, title: "b" })).version).toBe(2);
    expect((await api.createEvent({ ...event, id: "c" })).version).toBe(1);
    await expect(api.createEvent({ ...event, id: "c" })).rejects.toThrow("already exists");
    await api.deleteEvent("a");
    await expect(api.updateEvent(event)).rejects.toThrow("doesn't exist");
  });

  test("fails while asked to, and stops when a load is cancelled", async () => {
    let failing = true;
    const api = createFakeEventsApi([], { latency: 0, shouldFail: () => failing });
    await expect(api.listEvents(months("2026-10-01", "2026-11-01"))).rejects.toThrow();
    failing = false;

    const controller = new AbortController();
    const loading = api.listEvents(months("2026-10-01", "2026-11-01"), controller.signal);
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await expect(loading).rejects.toThrow("Cancelled");
  });
});

async function render(element: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return container;
}

/**
 * Waits a little at a time until `check` passes, so the pretend server can answer and React can
 * render what arrived. TanStack Query tells observers on a timer, so each wait is inside `act`.
 */
async function waitUntil(check: () => void, timeout = 3000) {
  const started = performance.now();
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (performance.now() - started > timeout) throw error;
    }
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  }
}

/**
 * The pretend server with saves, and loads while `holdLoads` is on, held until the test answers
 * them, so the order of events doesn't depend on timers. A held load reads when it's asked, as a
 * slow server's would, and answers with what it read.
 */
function controlledApi(seed: readonly ApiEvent[]) {
  const server = createFakeEventsApi(seed, { latency: 0 });
  const held: { kind: "load" | "save"; answer: (fail?: boolean) => void }[] = [];
  let holdLoads = false;

  function hold<T>(kind: "load" | "save", respond: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      held.push({
        answer: (fail = false) =>
          fail
            ? reject(new Error("The server didn't answer."))
            : void respond().then(resolve, reject),
        kind,
      });
    });
  }

  const api: EventsApi = {
    ...server,
    listEvents: (dates, signal) => {
      if (!holdLoads) return server.listEvents(dates, signal);
      const read = server.listEvents(dates);
      return hold("load", () => read);
    },
    updateEvent: (event) => hold("save", () => server.updateEvent(event)),
  };

  return {
    api,
    /** Answers the oldest held request of `kind`. */
    answer(kind: "load" | "save", fail = false) {
      const index = held.findIndex((request) => request.kind === kind);
      if (index === -1) throw new Error(`No ${kind} is waiting`);
      held.splice(index, 1)[0]!.answer(fail);
    },
    held: (kind: "load" | "save") => held.filter((request) => request.kind === kind).length,
    holdLoads(value: boolean) {
      holdLoads = value;
    },
  };
}

describe("useSaveEvent", () => {
  const october = months("2026-09-01", "2026-12-01");
  const november = months("2026-10-01", "2027-01-01");
  const event = timedEvent("review", "2026-10-28T09:00:00Z", "2026-10-28T10:00:00Z");
  const later = { ...event, end: "2026-12-02T10:00:00Z", start: "2026-12-02T09:00:00Z" };
  const other = timedEvent("retro", "2026-10-29T09:00:00Z", "2026-10-29T10:00:00Z");

  /**
   * Caches October and November, and renders `useSaveEvent`, with the window `watched` on screen.
   * With `holdLoads`, every load after that waits for the test to answer it.
   */
  async function setup({
    holdLoads = false,
    watched,
  }: { readonly holdLoads?: boolean; readonly watched?: EventsWindow } = {}) {
    const server = controlledApi([event, other]);
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    for (const dates of [october, november]) {
      await client.prefetchQuery(eventsQuery(server.api, dates));
    }
    server.holdLoads(holdLoads);
    let save: ((write: EventWrite) => Promise<void>) | undefined;
    function Saver() {
      save = useSaveEvent(server.api).mutateAsync;
      return null;
    }
    function Watcher({ dates }: { readonly dates: EventsWindow }) {
      useQuery(eventsQuery(server.api, dates));
      return null;
    }
    await render(
      <QueryClientProvider client={client}>
        <Saver />
        {watched === undefined ? null : <Watcher dates={watched} />}
      </QueryClientProvider>,
    );
    const starts = (dates: EventsWindow, id = event.id) =>
      client
        .getQueryData(eventsQuery(server.api, dates).queryKey)
        ?.filter((cached) => cached.id === id)
        .map((cached) => cached.start);
    const stale = (dates: EventsWindow) =>
      client.getQueryState(eventsQuery(server.api, dates).queryKey)?.isInvalidated;
    return { client, save: save!, server, stale, starts };
  }

  test("shows a change in every window at once, and marks them stale once it's saved", async () => {
    const { save, server, stale, starts } = await setup();
    expect(starts(october)).toEqual([event.start]);
    expect(starts(november)).toEqual([event.start]);

    let saved: Promise<void> | undefined;
    await act(async () => {
      saved = save({ after: later, before: event, id: event.id });
    });
    expect(starts(october)).toEqual([]);
    expect(starts(november)).toEqual([later.start]);
    expect(stale(november)).toBe(false);

    await waitUntil(() => expect(server.held("save")).toBe(1));
    server.answer("save");
    await act(async () => saved);
    expect(stale(october)).toBe(true);
    expect(stale(november)).toBe(true);
    const [stored] = await server.api.listEvents(months("2026-12-01", "2027-01-01"));
    expect(stored).toMatchObject({ start: later.start, version: 2 });
  });

  test("saves one at a time, and reloads once, after the last", async () => {
    const { save, server, stale, starts } = await setup();
    const moved = { ...other, start: "2026-10-30T09:00:00Z", end: "2026-10-30T10:00:00Z" };
    let first: Promise<void> | undefined;
    let second: Promise<void> | undefined;
    await act(async () => {
      first = save({ after: later, before: event, id: event.id });
      second = save({ after: moved, before: other, id: other.id });
    });
    // Both show at once; the second waits for the first to reach the server.
    expect(starts(november)).toEqual([later.start]);
    expect(starts(october, other.id)).toEqual([moved.start]);
    await waitUntil(() => expect(server.held("save")).toBe(1));

    server.answer("save");
    await act(async () => first);
    expect(stale(november)).toBe(false);

    await waitUntil(() => expect(server.held("save")).toBe(1));
    server.answer("save");
    await act(async () => second);
    expect(stale(november)).toBe(true);
  });

  test("puts the event back in every window when the save fails, without waiting for a reload", async () => {
    // The reload after the failure never answers; the rollback mustn't wait for it.
    const { save, server, starts } = await setup({ holdLoads: true, watched: november });

    let saved: Promise<void> | undefined;
    await act(async () => {
      saved = save({ after: later, before: event, id: event.id });
    });
    expect(starts(november)).toEqual([later.start]);

    await waitUntil(() => expect(server.held("save")).toBe(1));
    server.answer("save", true);
    await act(async () => {
      await expect(saved).rejects.toThrow("didn't answer");
    });
    expect(starts(october)).toEqual([event.start]);
    expect(starts(november)).toEqual([event.start]);
    // The reload started anyway.
    expect(server.held("load")).toBe(1);
  });

  test("lets loads with nothing cached yet finish while a save is on its way", async () => {
    const { client, save, server } = await setup();
    const december = months("2026-11-01", "2027-02-01");
    server.holdLoads(true);
    void client.prefetchQuery(eventsQuery(server.api, december));
    await waitUntil(() => expect(server.held("load")).toBe(1));

    await act(async () => {
      void save({ after: later, before: event, id: event.id }).catch(() => undefined);
    });
    server.answer("load");
    await waitUntil(() =>
      expect(client.getQueryData(eventsQuery(server.api, december).queryKey)).toBeDefined(),
    );
  });

  test("after the last save, reloads windows whose first load read before it", async () => {
    const december = months("2026-11-01", "2027-02-01");
    const { save, server, starts } = await setup({ holdLoads: true, watched: december });
    // December's first load is on its way when the save starts.
    await waitUntil(() => expect(server.held("load")).toBe(1));
    expect(starts(december)).toBeUndefined();

    let saved: Promise<void> | undefined;
    await act(async () => {
      saved = save({ after: later, before: event, id: event.id });
    });
    await waitUntil(() => expect(server.held("save")).toBe(1));
    server.answer("save");

    // The load that read before the save is dropped, and December loads again.
    await waitUntil(() => expect(server.held("load")).toBe(2));
    server.answer("load");
    server.answer("load");
    await act(async () => saved);
    expect(starts(december)).toEqual([later.start]);
  });
});

describe("EventsCalendar", () => {
  const timeZone = "Europe/Berlin";
  const today = Temporal.Now.plainDateISO(timeZone);

  function renderCalendar(api: EventsApi, client = new QueryClient()) {
    return render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <div style={{ height: 600 }}>
            <EventsCalendar api={api} timeZone={timeZone} />
          </div>
        </TooltipProvider>
      </QueryClientProvider>,
    );
  }

  const standups = (container: HTMLElement) =>
    [...container.querySelectorAll('[data-event-id$="-standup"]')].map((element) =>
      element.getAttribute("data-event-id"),
    );

  test("loads the week it opens on, and the windows either side", async () => {
    const client = new QueryClient();
    const api = createFakeEventsApi(createSampleEvents(today, timeZone), { latency: 0 });
    const container = await renderCalendar(api, client);

    // Five weekdays, whichever weekday today is.
    await waitUntil(() => expect(standups(container)).toHaveLength(5));
    const current = eventsWindow(weekRange(today, { weekStartsOn: 1 }), timeZone);
    await waitUntil(() =>
      expect(
        client
          .getQueriesData({ queryKey: ["events"] })
          .map(([queryKey]) => (queryKey[1] as EventsWindow).start)
          .toSorted(),
      ).toEqual(
        [shiftWindow(current, -1), current, shiftWindow(current, 1)].map((dates) => dates.start),
      ),
    );
  });

  test("shows an error with a retry when loading fails", async () => {
    let failing = true;
    const api = createFakeEventsApi(createSampleEvents(today, timeZone), {
      latency: 0,
      shouldFail: () => failing,
    });
    const container = await renderCalendar(
      api,
      new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    );

    await waitUntil(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "Couldn't load events.",
      ),
    );
    expect(standups(container)).toEqual([]);

    failing = false;
    await act(async () => {
      [...container.querySelectorAll('[role="alert"] button')]
        .find((button) => button.textContent === "Try again")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitUntil(() => expect(standups(container)).toHaveLength(5));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

describe("the guide's preview", () => {
  const click = (element: Element | null | undefined) =>
    act(async () => {
      if (!(element instanceof HTMLElement)) throw new Error("Nothing to click");
      element.click();
    });
  const standups = (container: HTMLElement) =>
    container.querySelectorAll('[data-event-id$="-standup"]').length;

  test("fails requests while the switch is on, and loads again after a retry", async () => {
    const container = await render(<QueryPreviewCalendar latency={0} />);
    await waitUntil(() => expect(standups(container)).toBe(5));

    await click(container.querySelector('[role="checkbox"]'));
    // Ten weeks on, past the windows loaded so far. The failed load is tried once more first.
    for (let week = 0; week < 10; week += 1) {
      await click(container.querySelector('[data-calendar-part="next-trigger"]'));
    }
    await waitUntil(() =>
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "Couldn't load events.",
      ),
    );

    await click(container.querySelector('[role="checkbox"]'));
    await click(
      [...container.querySelectorAll('[role="alert"] button')].find(
        (button) => button.textContent === "Try again",
      ),
    );
    await waitUntil(() => expect(standups(container)).toBe(5));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

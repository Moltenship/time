// @vitest-environment jsdom

import { plainDateInterval, weekRange, type CalendarEventPlacement } from "@moltenship/calendar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

/** Lets the pretend server answer and React render what arrived. */
async function settle() {
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
}

describe("useSaveEvent", () => {
  const october = months("2026-09-01", "2026-12-01");
  const november = months("2026-10-01", "2027-01-01");
  const event = timedEvent("review", "2026-10-28T09:00:00Z", "2026-10-28T10:00:00Z");
  const later = { ...event, end: "2026-12-02T10:00:00Z", start: "2026-12-02T09:00:00Z" };

  async function setup({ failSaves }: { readonly failSaves: boolean }) {
    let loaded = false;
    const api = createFakeEventsApi([event], {
      latency: 5,
      shouldFail: () => loaded && failSaves,
    });
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    for (const dates of [october, november]) await client.prefetchQuery(eventsQuery(api, dates));
    loaded = true;
    let save: ((write: EventWrite) => Promise<void>) | undefined;
    function Saver() {
      save = useSaveEvent(api).mutateAsync;
      return null;
    }
    await render(
      <QueryClientProvider client={client}>
        <Saver />
      </QueryClientProvider>,
    );
    const ids = (dates: EventsWindow) =>
      client.getQueryData(eventsQuery(api, dates).queryKey)?.map((cached) => cached.start);
    return { api, ids, save: save! };
  }

  test("shows a change in every window at once, and reloads the saved events after", async () => {
    const { api, ids, save } = await setup({ failSaves: false });
    expect(ids(october)).toEqual([event.start]);
    expect(ids(november)).toEqual([event.start]);

    let saved: Promise<void> | undefined;
    await act(async () => {
      saved = save({ after: later, before: event, id: event.id });
    });
    expect(ids(october)).toEqual([]);
    expect(ids(november)).toEqual([later.start]);

    await act(async () => saved);
    // TanStack Query tells observers on a timer, so let the last update land.
    await settle();
    const [stored] = await api.listEvents(november);
    expect(stored).toMatchObject({ start: later.start, version: 2 });
  });

  test("puts the event back in every window when the save fails", async () => {
    const { ids, save } = await setup({ failSaves: true });

    let saved: Promise<void> | undefined;
    await act(async () => {
      saved = save({ after: later, before: event, id: event.id });
    });
    expect(ids(november)).toEqual([later.start]);

    await act(async () => {
      await expect(saved).rejects.toThrow("didn't answer");
    });
    await settle();
    expect(ids(october)).toEqual([event.start]);
    expect(ids(november)).toEqual([event.start]);
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
    await settle();

    // Five weekdays, whichever weekday today is.
    expect(standups(container)).toHaveLength(5);
    const loaded = client
      .getQueriesData({ queryKey: ["events"] })
      .map(([queryKey]) => (queryKey[1] as EventsWindow).start);
    const current = eventsWindow(weekRange(today, { weekStartsOn: 1 }), timeZone);
    expect(loaded.toSorted()).toEqual(
      [shiftWindow(current, -1), current, shiftWindow(current, 1)].map((dates) => dates.start),
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
    await settle();

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Couldn't load events.");
    expect(standups(container)).toEqual([]);

    failing = false;
    await act(async () => {
      [...alert!.querySelectorAll("button")]
        .find((button) => button.textContent === "Try again")
        ?.click();
    });
    await settle();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(standups(container)).toHaveLength(5);
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
    await settle();
    expect(standups(container)).toBe(5);

    await click(container.querySelector('[role="checkbox"]'));
    // Ten weeks on, past the windows loaded so far.
    for (let week = 0; week < 10; week += 1) {
      await click(container.querySelector('[data-calendar-part="next-trigger"]'));
    }
    // The failed load is tried once more, 0.3 seconds later.
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't load events.",
    );

    await click(container.querySelector('[role="checkbox"]'));
    await click(
      [...container.querySelectorAll('[role="alert"] button')].find(
        (button) => button.textContent === "Try again",
      ),
    );
    await settle();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(standups(container)).toBe(5);
  });
});

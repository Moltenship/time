// @vitest-environment jsdom

import { afterEach, expect, test } from "vite-plus/test";

import {
  HydrationMismatchError,
  buildEvent,
  cleanup,
  createTestEnvironment,
  hydrateCalendar,
  renderCalendar,
} from "../src/index";
import { Calendar } from "./list-view";

afterEach(cleanup);

const standup = buildEvent({ start: "2026-10-08T09:00:00Z", title: "Standup" });
const review = buildEvent({ start: "2026-10-09T14:00:00Z", title: "Review" });

const items = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-event-id]")].map((item) => item.textContent);
const today = (container: HTMLElement) => container.querySelector("[data-today]")?.textContent;

const moveStandup = {
  cause: "move",
  eventId: "Standup",
  proposed: {
    end: Temporal.Instant.from("2026-10-08T11:00:00Z"),
    kind: "timed",
    start: Temporal.Instant.from("2026-10-08T10:00:00Z"),
  },
} as const;

test("renders the first view in the default environment, inside Root", async () => {
  const calendar = await renderCalendar(Calendar, { events: [standup, review] });

  expect(today(calendar.container)).toBe("2026-10-08");
  expect(items(calendar.container)).toEqual([
    "Standup 2026-10-08T09:00:00Z",
    "Review 2026-10-09T14:00:00Z",
  ]);
  expect(calendar.state()).toMatchObject({ timeZone: "UTC", view: "list" });
  expect(calendar.state().anchorDate.toString()).toBe("2026-10-08");
  expect(calendar.meta().environment.locale).toBe("en-US");
  expect(calendar.container.isConnected).toBe(true);
});

test("records each change and result, and applies saved changes to the events", async () => {
  const calendar = await renderCalendar(Calendar, { events: [standup] });

  const result = await calendar.propose(moveStandup);

  expect(result.status).toBe("committed");
  expect(calendar.changes.map(({ cause, eventId }) => `${cause} ${String(eventId)}`)).toEqual([
    "move Standup",
  ]);
  expect(calendar.results.map(({ detail, result }) => `${result.status} ${detail.input}`)).toEqual([
    "committed api",
  ]);
  expect(String(calendar.events()[0]?.start)).toBe("2026-10-08T10:00:00Z");
  expect(items(calendar.container)).toEqual(["Standup 2026-10-08T10:00:00Z"]);
});

test("a save that takes time stays pending until it settles", async () => {
  let save: (() => void) | undefined;
  const calendar = await renderCalendar(Calendar, {
    events: [standup],
    onEventChange: () =>
      new Promise<void>((resolve) => {
        save = resolve;
      }),
  });

  let proposed: ReturnType<typeof calendar.actions.proposeEventChange> | undefined;
  await calendar.act((actions) => {
    proposed = actions.proposeEventChange(moveStandup);
  });

  expect([...calendar.pendingChanges().values()].map(({ phase }) => phase)).toEqual(["saving"]);
  // The calendar shows the change while it saves; the harness hasn't applied it yet.
  expect(items(calendar.container)).toEqual(["Standup 2026-10-08T10:00:00Z"]);
  expect(String(calendar.events()[0]?.start)).toBe("2026-10-08T09:00:00Z");

  await calendar.act(async () => {
    save?.();
    await proposed;
  });

  expect(calendar.pendingChanges().size).toBe(0);
  expect(String(calendar.events()[0]?.start)).toBe("2026-10-08T10:00:00Z");
  expect(calendar.results).toHaveLength(1);
});

test("a save that fails rolls back, and the harness applies nothing", async () => {
  const calendar = await renderCalendar(Calendar, {
    events: [standup],
    onEventChange: () => Promise.reject(new Error("offline")),
  });

  const result = await calendar.propose(moveStandup);

  expect(result.status).toBe("rejected");
  expect(calendar.changes).toHaveLength(1);
  expect(String(calendar.events()[0]?.start)).toBe("2026-10-08T09:00:00Z");
  expect(items(calendar.container)).toEqual(["Standup 2026-10-08T09:00:00Z"]);
});

test("a read-only calendar has no onEventChange, so proposals are rejected", async () => {
  const calendar = await renderCalendar(Calendar, { events: [standup], readOnly: true });

  const result = await calendar.propose(moveStandup);

  expect(result.status).toBe("rejected");
  expect(calendar.changes).toEqual([]);
});

test("app records take an applyChange of their own", async () => {
  interface Meeting {
    readonly id: string;
    readonly name: string;
    readonly from: string;
  }
  const calendar = await renderCalendar(Calendar, {
    events: [standup],
    applyChange: (events, change) =>
      change.cause === "delete" ? events.filter(({ id }) => id !== change.eventId) : events,
  });

  await calendar.propose({ cause: "delete", eventId: "Standup" });

  expect(calendar.events()).toEqual([]);
  expect(items(calendar.container)).toEqual([]);
  // Unused: the type above is what an app's own records look like.
  expect(({} as Partial<Meeting>).name).toBeUndefined();
});

test("setNow, setEvents and rerender change what the calendar shows", async () => {
  const environment = createTestEnvironment({ timeZone: "Asia/Tokyo" });
  const calendar = await renderCalendar(Calendar, { environment, events: [standup] });

  expect(today(calendar.container)).toBe("2026-10-08");
  await calendar.setNow("2026-10-09T08:00");
  expect(today(calendar.container)).toBe("2026-10-09");
  expect(calendar.meta().environment.now?.toString()).toBe("2026-10-08T23:00:00Z");

  await calendar.setEvents([review]);
  expect(items(calendar.container)).toEqual(["Review 2026-10-09T14:00:00Z"]);
  await calendar.rerender({ events: [standup, review] });
  expect(calendar.events()).toHaveLength(2);
  await calendar.act((actions) => actions.navigateNext());
  expect(calendar.state().anchorDate.toString()).toBe("2026-10-15");
});

test("cleanup unmounts every calendar and removes the containers it made", async () => {
  const own = document.createElement("div");
  document.body.append(own);
  const first = await renderCalendar(Calendar, { events: [standup] });
  const second = await renderCalendar(Calendar, { container: own, events: [review] });

  await cleanup();

  expect(first.container.isConnected).toBe(false);
  expect(second.container.isConnected).toBe(true);
  expect(second.container.innerHTML).toBe("");
  await expect(first.act(() => undefined)).rejects.toThrow(/unmounted/);
  own.remove();
});

test("hydrateCalendar renders on the server, hydrates, and the harness works as rendered", async () => {
  const calendar = await hydrateCalendar(Calendar, { events: [standup] });

  expect(calendar.serverMarkup).toContain("Standup");
  // A fixed now renders today on the server too, so there is nothing to patch after hydration.
  expect(calendar.serverMarkup).toContain("2026-10-08");
  expect(calendar.recoverableErrors).toEqual([]);
  await calendar.propose(moveStandup);
  expect(items(calendar.container)).toEqual(["Standup 2026-10-08T10:00:00Z"]);
});

test("hydrateCalendar throws when the client renders something else", async () => {
  let renders = 0;
  function Counter() {
    renders += 1;
    return <p>render {renders}</p>;
  }

  const hydrated = hydrateCalendar(Calendar, { children: <Counter />, events: [standup] });

  await expect(hydrated).rejects.toBeInstanceOf(HydrationMismatchError);
  await expect(hydrated).rejects.toThrow(/Hydration/);
  expect(document.body.innerHTML).toBe("");
});

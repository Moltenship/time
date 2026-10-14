// @vitest-environment jsdom

// The Testing guide's examples (content/docs/testing.mdx), run as a consumer runs them: the
// registry's views through their app paths, and `@moltenship/calendar-testing` as published.

// #region calendar
import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar";
import {
  buildEvent,
  cleanup,
  createTestEnvironment,
  hydrateCalendar,
  renderCalendar,
} from "@moltenship/calendar-testing";
import { afterEach, expect, test } from "vite-plus/test";

import { calendarAnnouncements } from "@/components/calendar/announcements";
import { createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";

type Meeting = CalendarEvent<null>;

const Calendar = createCalendar<Meeting>()({
  eventAdapter: createCanonicalEventAdapter<null>(),
  views: [createWeekView<Meeting>()],
});

// Unmounts every calendar a test rendered.
afterEach(cleanup);
// #endregion calendar

// #region render
const environment = createTestEnvironment({ timeZone: "Europe/Berlin" });
const standup = buildEvent({ title: "Standup", start: environment.at("09:00") });

test("a saved move reaches onEventChange and the events", async () => {
  const calendar = await renderCalendar(Calendar, {
    environment,
    events: [standup],
    messages: calendarAnnouncements,
  });

  await calendar.propose({
    cause: "move",
    eventId: "Standup",
    proposed: {
      kind: "timed",
      start: environment.at("10:00"),
      end: environment.at("10:30"),
    },
  });

  expect(calendar.changes.map((change) => change.cause)).toEqual(["move"]);
  expect(calendar.results[0]?.result.status).toBe("committed");
  expect(String(calendar.events()[0]?.start)).toBe("2026-10-08T08:00:00Z");
});
// #endregion render

// #region pending
test("a slow save stays pending, then settles", async () => {
  let finish = () => {};
  const calendar = await renderCalendar(Calendar, {
    environment,
    events: [standup],
    onEventChange: () => new Promise<void>((resolve) => (finish = resolve)),
  });

  // Propose through act without waiting for the save, which the test holds.
  let saving: ReturnType<typeof calendar.actions.proposeEventChange> | undefined;
  await calendar.act((actions) => {
    saving = actions.proposeEventChange({
      cause: "move",
      eventId: "Standup",
      proposed: { kind: "timed", start: environment.at("11:00"), end: environment.at("12:00") },
    });
  });
  expect([...calendar.pendingChanges().values()].map(({ phase }) => phase)).toEqual(["saving"]);

  await calendar.act(() => finish());
  expect((await saving)?.status).toBe("committed");
  expect(calendar.pendingChanges().size).toBe(0);
});
// #endregion pending

// #region hydrate
test("the week renders on the server and hydrates without a mismatch", async () => {
  // Throws a HydrationMismatchError when the client renders something else.
  const calendar = await hydrateCalendar(Calendar, { environment, events: [standup] });

  expect(calendar.serverMarkup).toContain("Standup");
});
// #endregion hydrate

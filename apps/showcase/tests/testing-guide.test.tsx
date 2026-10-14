// @vitest-environment jsdom

// The Testing guide's examples (content/docs/testing.mdx), run as a consumer runs them: the
// registry's views through their app paths, and `@moltenship/calendar-testing` as published.

// An app imports these from "vitest"; this repository's toolchain serves them as "vite-plus/test".
import { afterEach, expect, test } from "vite-plus/test";

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

// #region keyboard
test("Space, arrow keys and Enter move the standup a day on and half an hour later", async () => {
  const calendar = await renderCalendar(Calendar, {
    environment,
    events: [standup],
    messages: calendarAnnouncements,
  });

  // Focus the event, Space, two slots down and a day across, then Enter.
  await calendar.keyboard.moveEvent("Standup", { across: 1, down: 2 });
  await calendar.settled();

  expect(calendar.placementOf("Standup").wallRange).toBe("2026-10-09T09:30/2026-10-09T10:30");
  expect(calendar.lastAnnouncement()).toBe("Moved Standup to Friday, October 9, 9:30 – 10:30 AM.");
  expect(calendar.results[0]?.detail.input).toBe("keyboard");
});
// #endregion keyboard

// #region queries
test("queries find events by title, and cells by date", async () => {
  const calendar = await renderCalendar(Calendar, { environment, events: [standup] });

  const event = calendar.getEvent("Standup");
  expect(calendar.getTimeColumn("2026-10-08").contains(event)).toBe(true);
  expect(calendar.queryEvent("Lunch")).toBeNull();

  // A slot exists only while it has focus, so the keyboard driver focuses it.
  await calendar.keyboard.focusCell({ date: "2026-10-08", time: "14:00" });
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Thursday, October 8 at 2:00 PM");
});
// #endregion queries

// #region fixtures
import {
  dstWeekFixture,
  multiZoneSeriesFixture,
  type FixtureEvent,
  type FixtureSeriesEvent,
} from "@moltenship/calendar-testing";

const FixtureCalendar = createCalendar<FixtureEvent>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly group: string }>(),
  views: [createWeekView<FixtureEvent>()],
});

test("a move a day on keeps an event's wall time across the clocks going back", async () => {
  // New York's week of Sunday 1 November 2026, with a 09:00 standup every day.
  const calendar = await renderCalendar(FixtureCalendar, { ...dstWeekFixture(), view: "week" });

  // `d6` is Saturday's standup; a day on is Sunday, after the change.
  await calendar.keyboard.moveEvent("d6", { across: 1 });
  await calendar.settled();

  expect(calendar.placementOf("d6").wallRange).toBe("2026-11-01T09:00/2026-11-01T09:30");
});
// #endregion fixtures

// #region series
import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceAdapter,
  createOccurrenceExpander,
  type RecurrenceOccurrence,
} from "@moltenship/calendar-recurrence";

type Occurrence = RecurrenceOccurrence<FixtureSeriesEvent, string>;

const SeriesCalendar = createCalendar<Occurrence>()({
  eventAdapter: createOccurrenceAdapter(createCanonicalEventAdapter<{ readonly group: string }>()),
  views: [createWeekView<Occurrence>()],
});

test("Berlin's standup is an hour later in UTC once its clocks go back; Los Angeles' isn't yet", async () => {
  const { environment, series } = multiZoneSeriesFixture();
  const week = {
    end: Temporal.PlainDate.from("2026-11-02"),
    start: Temporal.PlainDate.from("2026-10-26"),
  };
  const { occurrences } = createOccurrenceExpander(
    createCanonicalRecurrenceAdapter<{ readonly group: string }>(),
  ).expand(series, { range: week, timeZone: environment.timeZone });

  const calendar = await renderCalendar(SeriesCalendar, {
    environment,
    events: occurrences,
    // Occurrences are views of their series: save changes through the recurrence edits instead.
    readOnly: true,
    rootProps: { defaultAnchorDate: week.start },
    view: "week",
  });

  expect(calendar.placementOf({ start: "2026-10-26T08:00:00Z" }).title).toBe("Standup (Berlin)");
  expect(calendar.placementOf({ start: "2026-10-27T17:00:00Z" }).title).toBe(
    "Review (Los Angeles)",
  );
  expect(calendar.queryEvent({ start: "2026-10-27T17:00:00Z" })).not.toBeNull();
});
// #endregion series

// #region hydrate
test("the week renders on the server and hydrates without a mismatch", async () => {
  // Throws a HydrationMismatchError when the client renders something else.
  const calendar = await hydrateCalendar(Calendar, { environment, events: [standup] });

  expect(calendar.serverMarkup).toContain("Standup");
});
// #endregion hydrate

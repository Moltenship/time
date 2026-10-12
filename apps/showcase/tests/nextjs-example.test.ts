import { instantInterval } from "@moltenship/calendar";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { createMeeting, moveMeeting, saveTimeZone } from "../app/(home)/examples/nextjs/actions";
import { Calendar } from "../app/(home)/examples/nextjs/calendar";
import {
  environment,
  locationSearch,
  meetingViews,
  parseLocation,
  visibleDates,
  visibleRange,
} from "../app/(home)/examples/nextjs/location";
import { findMeetings, getVisitor, maxMeetings } from "../app/(home)/examples/nextjs/meetings";

const { cookieJar, refresh } = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  refresh: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => cookieJar.set(name, value),
  }),
}));
vi.mock("next/cache", () => ({ refresh }));

const today = Temporal.PlainDate.from("2026-10-14");

describe("the URL", () => {
  test("names a view and a date", () => {
    expect(parseLocation({ date: "2026-11-02", view: "month" }, today)).toEqual({
      date: "2026-11-02",
      view: "month",
    });
    expect(locationSearch({ date: "2026-11-02", view: "day" })).toBe("view=day&date=2026-11-02");
  });

  test("falls back to this week for missing or broken values", () => {
    const thisWeek = { date: "2026-10-14", view: "week" };
    expect(parseLocation({}, today)).toEqual(thisWeek);
    expect(parseLocation({ date: "2026-02-30", view: "year" }, today)).toEqual(thisWeek);
    expect(parseLocation({ date: "2026-10-20T10:00" }, today)).toEqual(thisWeek);
    expect(parseLocation({ date: ["2026-10-20", "2026-10-21"] }, today)).toEqual(thisWeek);
  });
});

describe("the range the server fetches", () => {
  const anchors = ["2026-10-14", "2026-11-01", "2026-03-29", "2026-12-31", "2027-02-01"];

  test("is the range each client view shows", () => {
    for (const view of meetingViews) {
      const definition = Calendar.views.find(({ name }) => name === view)!;
      for (const date of anchors) {
        const anchor = Temporal.PlainDate.from(date);
        const shown = definition.strategy.getRange(
          anchor,
          environment("Europe/Berlin"),
          definition.defaultOptions as never,
        );
        const fetched = visibleDates({ date, view });
        expect(
          fetched.start.equals(shown.start) && fetched.end.equals(shown.end),
          `${view} ${date}`,
        ).toBe(true);
      }
    }
  });

  test("starts and ends at midnight in the visitor's time zone", () => {
    const range = visibleRange({ date: "2026-10-14", view: "day" }, "Asia/Tokyo");
    expect(range.start.toString()).toBe("2026-10-13T15:00:00Z");
    expect(range.end.toString()).toBe("2026-10-14T15:00:00Z");
  });
});

describe("the store and its Server Actions", () => {
  const tomorrow = Temporal.Now.instant().add({ hours: 24 }).round("minute");
  const times = (start: Temporal.Instant, minutes = 30) => ({
    end: start.add({ minutes }).toString(),
    start: start.toString(),
  });
  const around = (instant: Temporal.Instant) =>
    instantInterval(instant.subtract({ hours: 48 }), instant.add({ hours: 48 }));

  beforeEach(() => {
    cookieJar.clear();
    refresh.mockClear();
  });

  test("shows a new visitor sample meetings at wall-clock times in their zone", async () => {
    cookieJar.set("time-zone", "Asia/Tokyo");
    const now = Temporal.Now.instant();
    const meetings = await findMeetings(
      await getVisitor(),
      instantInterval(now.subtract({ hours: 24 * 14 }), now.add({ hours: 24 * 14 })),
    );
    const standups = meetings.filter(({ title }) => title === "Standup");
    expect(standups.length).toBeGreaterThan(5);
    for (const { start } of standups) {
      expect(
        Temporal.Instant.from(start).toZonedDateTimeISO("Asia/Tokyo").toPlainTime().toString(),
      ).toBe("09:30:00");
    }
  });

  test("creates a meeting, starts the visitor's session and re-renders the page", async () => {
    await expect(createMeeting(times(tomorrow))).resolves.toEqual({ ok: true });
    expect(cookieJar.get("meetings-session")).toMatch(/^[0-9a-f-]{36}$/);
    expect(refresh).toHaveBeenCalledOnce();

    const meetings = await findMeetings(await getVisitor(), around(tomorrow));
    expect(meetings).toContainEqual(
      expect.objectContaining({ start: tomorrow.toString(), title: "New meeting" }),
    );
  });

  test("moves and resizes a meeting by its ID", async () => {
    await createMeeting(times(tomorrow));
    const [created] = (await findMeetings(await getVisitor(), around(tomorrow))).filter(
      ({ title }) => title === "New meeting",
    );
    const later = tomorrow.add({ hours: 2 });

    await expect(moveMeeting({ ...times(later, 90), id: created!.id })).resolves.toEqual({
      ok: true,
    });
    const moved = await findMeetings(await getVisitor(), around(tomorrow));
    expect(moved.find(({ id }) => id === created!.id)).toMatchObject(times(later, 90));
    await expect(moveMeeting({ ...times(later), id: "no-such-meeting" })).resolves.toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  test("refuses what the calendar shouldn't have sent", async () => {
    const yesterday = Temporal.Now.instant().subtract({ hours: 24 });
    await expect(createMeeting(times(yesterday))).resolves.toEqual({
      ok: false,
      reason: "in-the-past",
    });
    for (const input of [
      null,
      { end: "tomorrow", start: "today" },
      times(tomorrow, -30),
      times(tomorrow, 5),
      times(tomorrow, 25 * 60),
    ]) {
      await expect(createMeeting(input as never)).resolves.toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    await expect(moveMeeting({ ...times(tomorrow), id: 42 } as never)).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(cookieJar.has("meetings-session")).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  test("keeps each visitor's meetings apart", async () => {
    await createMeeting(times(tomorrow));
    cookieJar.clear();
    const meetings = await findMeetings(await getVisitor(), around(tomorrow));
    expect(meetings.some(({ title }) => title === "New meeting")).toBe(false);
  });

  test("stops at the store's limit", async () => {
    let result;
    for (let index = 0; index <= maxMeetings; index += 1) {
      result = await createMeeting(times(tomorrow.add({ minutes: index })));
      if (!result.ok) break;
    }
    expect(result).toEqual({ ok: false, reason: "full" });
  });

  test("stores a valid time zone in a cookie", async () => {
    await saveTimeZone("Not/AZone");
    expect(cookieJar.has("time-zone")).toBe(false);

    // A first visit only stores the zone: the sample meetings follow it.
    await saveTimeZone("asia/tokyo");
    expect(cookieJar.get("time-zone")).toBe("Asia/Tokyo");
    expect(cookieJar.has("meetings-session")).toBe(false);
  });

  test("keeps meetings at their instants when the visitor switches zones", async () => {
    cookieJar.set("time-zone", "Asia/Tokyo");
    await saveTimeZone("Europe/Berlin");
    expect(cookieJar.get("time-zone")).toBe("Europe/Berlin");

    const now = Temporal.Now.instant();
    const meetings = await findMeetings(
      await getVisitor(),
      instantInterval(now.subtract({ hours: 24 * 14 }), now.add({ hours: 24 * 14 })),
    );
    const standup = meetings.find(({ title }) => title === "Standup")!;
    const start = Temporal.Instant.from(standup.start);
    expect(start.toZonedDateTimeISO("Asia/Tokyo").toPlainTime().toString()).toBe("09:30:00");
  });
});

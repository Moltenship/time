// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarFocus,
  type CalendarSecondaryTimeZone,
} from "@moltenship/calendar";
import { act, type ComponentProps } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  createScrollingDayView,
  createScrollingWeekView,
} from "../scrolling-time-grid-view/scrolling-time-grid-view";
import { createDayView, createWeekView } from "../time-grid-view/time-grid-view";
import { render } from "./render";
import { people, ResourceCalendar, ResourceWeekCalendar } from "./resource-fixtures";
import { ariaLabel, text } from "./view-fixtures";

type Fixture = CalendarEvent<null, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [createWeekView(), createDayView(), createScrollingWeekView(), createScrollingDayView()],
});

type RootProps = Partial<
  Pick<
    ComponentProps<typeof Calendar.Root>,
    "defaultAnchorDate" | "defaultFocus" | "defaultView" | "locale" | "timeZone" | "weekRules"
  >
>;

const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;
let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

function calendar(
  secondaryTimeZones: readonly (CalendarSecondaryTimeZone | string)[] | undefined,
  props: RootProps = {},
) {
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-12")}
      defaultView="week"
      events={[]}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-12T10:00:00Z")}
      secondaryTimeZones={secondaryTimeZones}
      timeZone="Europe/Berlin"
      weekRules={weekRules}
      {...props}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}

async function renderCalendar(
  secondaryTimeZones: readonly (CalendarSecondaryTimeZone | string)[] | undefined,
  props: RootProps = {},
) {
  const result = await render(calendar(secondaryTimeZones, props));
  cleanup = result.unmount;
  return result.container;
}

/** Each zone column's labels, from 1:00 to 23:00 on the display zone's axis. */
function zoneHours(container: ParentNode): string[][] {
  return [...container.querySelectorAll('[data-slot="time-grid-zone-hours"]')].map((column) =>
    [...column.children].map((label) => text(label) ?? ""),
  );
}

function zoneLabels(container: ParentNode) {
  return [...container.querySelectorAll('[data-slot="time-grid-zone-label"]')].map((label) => ({
    hidden: label.getAttribute("aria-hidden"),
    text: label.textContent,
    title: label.getAttribute("title"),
  }));
}

test("adds an hour column per secondary zone, named over its hours", async () => {
  const container = await renderCalendar([
    "Asia/Kolkata",
    { label: "Tokyo", timeZone: "Asia/Tokyo" },
  ]);
  const [kolkata, tokyo] = zoneHours(container);

  expect(kolkata).toHaveLength(23);
  // Berlin is on CEST (+2): India is 3.5 hours ahead, Tokyo 7.
  expect(kolkata!.slice(0, 2)).toEqual(["4:30 AM", "5:30 AM"]);
  expect(kolkata![20]).toBe("12:30 AM+1");
  expect(tokyo!.slice(0, 2)).toEqual(["8 AM", "9 AM"]);
  expect(tokyo![16]).toBe("12 AM+1");
  expect(zoneLabels(container)).toEqual([
    { hidden: "true", text: "GMT+5:30", title: "India Standard Time" },
    { hidden: "true", text: "Tokyo", title: "Tokyo" },
  ]);
  const zones = container.querySelectorAll('[data-slot="time-grid-zone-hours"]');
  expect([...zones].map((zone) => zone.getAttribute("aria-hidden"))).toEqual(["true", "true"]);
  expect([...zones].map((zone) => zone.getAttribute("data-time-zone"))).toEqual([
    "Asia/Kolkata",
    "Asia/Tokyo",
  ]);
  // The grid's corner still names only the display zone to assistive technology, and its columns
  // are unchanged.
  const corner = container.querySelector('[role="row"] > [role="columnheader"]');
  const spoken = [...(corner?.children ?? [])].filter((part) => !part.hasAttribute("aria-hidden"));
  expect(spoken.map((part) => part.textContent)).toEqual(["GMT+2"]);
  const header = container.querySelector('[role="row"]');
  expect(header?.querySelectorAll('[role="columnheader"]')).toHaveLength(8);
  const grid = container.querySelector<HTMLElement>('[data-slot="time-grid"]');
  expect(grid?.style.getPropertyValue("--calendar-zones")).toBe("2");
});

test("adds nothing without secondary zones", async () => {
  const container = await renderCalendar(undefined);

  expect(zoneHours(container)).toEqual([]);
  expect(zoneLabels(container)).toEqual([]);
  const grid = container.querySelector<HTMLElement>('[data-slot="time-grid"]');
  expect(grid?.style.getPropertyValue("--calendar-zones")).toBe("");
  expect(container.querySelector('[data-slot="time-grid-zone-note"]')).toBeNull();
});

test("reads the locale's clock: 24 hours in en-GB and with an h23 hour cycle", async () => {
  const british = await renderCalendar(["Asia/Kathmandu"], { locale: "en-GB" });
  expect(zoneHours(british)[0]!.slice(0, 2)).toEqual(["04:45", "05:45"]);
  expect(zoneHours(british)[0]![20]).toBe("00:45+1");
  await cleanup?.();

  const h23 = await renderCalendar(["America/New_York"], { locale: "en-US-u-hc-h23" });
  expect(zoneHours(h23)[0]!.slice(0, 2)).toEqual(["19:00-1", "20:00-1"]);
  expect(zoneHours(h23)[0]![12]).toBe("07:00");
});

test("leaves the skipped hour blank on a 23-hour day", async () => {
  const container = await renderCalendar(["America/New_York"], {
    defaultAnchorDate: Temporal.PlainDate.from("2026-03-29"),
    defaultView: "day",
  });
  const [hours] = zoneHours(container);

  // 02:00 never happens in Berlin on March 29, so its line has no label: 22 labels, not 23.
  expect(hours).toHaveLength(22);
  expect(hours!.slice(0, 3)).toEqual(["8 PM-1", "9 PM-1", "10 PM-1"]);
});

test("says under a day's date when its times in a zone differ from the gutter's", async () => {
  // New York leaves EDT on Sunday, November 1, at 07:00 in Berlin; the gutter follows Monday.
  const container = await renderCalendar(["America/New_York"], {
    defaultAnchorDate: Temporal.PlainDate.from("2026-10-29"),
  });
  const notes = [...container.querySelectorAll('[data-slot="time-grid-zone-note"]')];

  expect(notes).toHaveLength(1);
  expect(notes[0]!.getAttribute("aria-hidden")).toBe("true");
  expect(notes[0]!.closest('[role="columnheader"]')?.getAttribute("aria-label")).toBe(
    "Sunday, November 1, 2026",
  );
  expect(text(notes[0])).toBe("EST -1h");
  expect(notes[0]!.firstElementChild?.getAttribute("title")).toBe(
    "From 7:00 AM, times in Eastern Standard Time are 1 hour earlier than its hours beside the grid",
  );
});

test("a note's title says when a difference ends within the day", async () => {
  // New York and Chicago both change at 02:00 local, an hour apart: only New York's 03:00 differs.
  const container = await renderCalendar(["America/Chicago"], {
    defaultAnchorDate: Temporal.PlainDate.from("2026-03-04"),
    timeZone: "America/New_York",
  });
  const note = container.querySelector('[data-slot="time-grid-zone-note"]');

  expect(note?.closest('[role="columnheader"]')?.getAttribute("aria-label")).toBe(
    "Sunday, March 8, 2026",
  );
  expect(text(note)).toBe("CST -1h");
  expect(note?.firstElementChild?.getAttribute("title")).toBe(
    "From 3:00 AM to 4:00 AM, times in Central Standard Time are 1 hour earlier than its hours beside the grid",
  );
});

test("a week that starts on a clock change reads its gutter on the next day", async () => {
  // New York springs forward on Sunday, March 8; London waits until March 29.
  const container = await renderCalendar(["Europe/London"], {
    defaultAnchorDate: Temporal.PlainDate.from("2026-03-10"),
    timeZone: "America/New_York",
    weekRules: { firstDay: 7, minimalDays: 1, weekend: [6, 7] },
  });
  const notes = [...container.querySelectorAll('[data-slot="time-grid-zone-note"]')];

  // Monday's lines: 02:00 in New York is 06:00 in London, with no skipped hour.
  expect(zoneHours(container)[0]!.slice(0, 2)).toEqual(["5 AM", "6 AM"]);
  expect(
    notes.map((note) => note.closest('[role="columnheader"]')?.getAttribute("aria-label")),
  ).toEqual(["Sunday, March 8, 2026"]);
  expect(text(notes[0])).toBe("GMT +1h");
});

test("a focused slot names its time in each zone, with the weekday on another date", async () => {
  const focus: CalendarFocus = {
    date: Temporal.PlainDate.from("2026-10-12"),
    kind: "slot",
    time: Temporal.PlainTime.from("21:00"),
  };
  const container = await renderCalendar(
    ["America/New_York", { label: "Kolkata", timeZone: "Asia/Kolkata" }],
    { defaultFocus: focus },
  );
  const slot = container.querySelector('[role="grid"] [role="button"][aria-label^="Monday"]');

  expect(ariaLabel(slot)).toBe(
    "Monday, October 12 at 9:00 PM, 3:00 PM Eastern Daylight Time, Tue 12:30 AM Kolkata",
  );
});

test("a slot on a shifted day names the zone as it is then", async () => {
  const focus: CalendarFocus = {
    date: Temporal.PlainDate.from("2026-11-01"),
    kind: "slot",
    time: Temporal.PlainTime.from("09:00"),
  };
  const container = await renderCalendar(["America/New_York"], {
    defaultAnchorDate: Temporal.PlainDate.from("2026-10-29"),
    defaultFocus: focus,
  });
  const slot = container.querySelector('[role="grid"] [role="button"][aria-label^="Sunday"]');

  expect(ariaLabel(slot)).toBe("Sunday, November 1 at 9:00 AM, 3:00 AM Eastern Standard Time");
});

test("a repeated hour names each moment, by offset under a label", async () => {
  // Berlin and London fall back at the same instant, so 02:30 in Berlin is 1:30 AM in London twice.
  const focus: CalendarFocus = {
    date: Temporal.PlainDate.from("2026-10-25"),
    kind: "slot",
    time: Temporal.PlainTime.from("02:30"),
  };
  const props = {
    defaultAnchorDate: Temporal.PlainDate.from("2026-10-25"),
    defaultFocus: focus,
    defaultView: "day",
  } as const;
  const slot = (container: HTMLElement) =>
    ariaLabel(container.querySelector('[role="grid"] [role="button"][aria-label^="Sunday"]'));

  expect(slot(await renderCalendar(["Europe/London"], props))).toBe(
    "Sunday, October 25 at 2:30 AM, 1:30 AM British Summer Time or 1:30 AM Greenwich Mean Time",
  );
  await cleanup?.();
  expect(slot(await renderCalendar([{ label: "London", timeZone: "Europe/London" }], props))).toBe(
    "Sunday, October 25 at 2:30 AM, 1:30 AM London GMT+1 or 1:30 AM London GMT+0",
  );
});

test("an empty label leaves the zone its own name", async () => {
  const container = await renderCalendar([{ label: "", timeZone: "Asia/Tokyo" }]);

  expect(zoneLabels(container)).toEqual([
    { hidden: "true", text: "GMT+9", title: "Japan Standard Time" },
  ]);
});

test("names both moments of a repeated hour in a slot's name", async () => {
  const focus: CalendarFocus = {
    date: Temporal.PlainDate.from("2026-10-25"),
    kind: "slot",
    time: Temporal.PlainTime.from("02:30"),
  };
  const container = await renderCalendar(["UTC"], {
    defaultAnchorDate: Temporal.PlainDate.from("2026-10-25"),
    defaultFocus: focus,
    defaultView: "day",
  });
  const slot = container.querySelector('[role="grid"] [role="button"][aria-label^="Sunday"]');

  expect(ariaLabel(slot)).toBe(
    "Sunday, October 25 at 2:30 AM, 12:30 AM or 1:30 AM Coordinated Universal Time",
  );
});

test("the scrolling views read the gutter on a visible day, not a page beside it", async () => {
  // The page before October 26 is on CEST, the visible week on CET: 01:00 is 8 PM in New York.
  const container = await renderCalendar(["America/New_York"], {
    defaultAnchorDate: Temporal.PlainDate.from("2026-10-26"),
    defaultView: "scrolling-week",
  });

  expect(zoneHours(container)[0]!.slice(0, 2)).toEqual(["8 PM-1", "9 PM-1"]);
  // The corner reads the display zone's offset on the same day.
  const corner = container.querySelector('[role="row"] > [role="columnheader"]');
  expect(corner?.lastElementChild?.textContent).toBe("GMT+1");
});

test("the corner reads the display zone's offset on the day the zone hours follow", async () => {
  // A Sunday-first week from Berlin's fall back: the zone hours follow Monday, on CET.
  const container = await renderCalendar(["America/New_York"], {
    defaultAnchorDate: Temporal.PlainDate.from("2026-10-25"),
    weekRules: { firstDay: 7, minimalDays: 1, weekend: [6, 7] },
  });
  const corner = container.querySelector('[role="row"] > [role="columnheader"]');

  expect(zoneHours(container)[0]!.slice(0, 1)).toEqual(["8 PM-1"]);
  expect(corner?.lastElementChild?.textContent).toBe("GMT+1");
});

test("the scrolling day view follows its day", async () => {
  const container = await renderCalendar(["Asia/Kolkata"], {
    defaultAnchorDate: Temporal.PlainDate.from("2026-10-14"),
    defaultView: "scrolling-day",
  });

  expect(zoneHours(container)[0]!.slice(0, 2)).toEqual(["4:30 AM", "5:30 AM"]);
  expect(zoneLabels(container).map(({ text: label }) => label)).toEqual(["GMT+5:30"]);
  const grid = container.querySelector<HTMLElement>('[data-slot="scrolling-time-grid"]');
  expect(grid?.style.getPropertyValue("--calendar-zones")).toBe("1");
});

test("the resource columns view adds the zone column beside its hours", async () => {
  const result = await render(
    <ResourceCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-12")}
      defaultTimeZone="UTC"
      defaultView="resources"
      events={[]}
      locale="en-US"
      resources={people(2)}
      secondaryTimeZones={["Australia/Lord_Howe"]}
      weekRules={weekRules}
    >
      <ResourceCalendar.ActiveView />
    </ResourceCalendar.Root>,
  );
  cleanup = result.unmount;

  // Lord Howe is on its 30-minute daylight saving time (+11) in October.
  expect(zoneHours(result.container)[0]!.slice(12, 14)).toEqual(["12 AM+1", "1 AM+1"]);
  expect(zoneLabels(result.container).map(({ text: label }) => label)).toEqual(["GMT+11"]);
});

test("the resource columns view over several days notes the day a zone shifts", async () => {
  const result = await render(
    <ResourceWeekCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-09-30")}
      defaultTimeZone="UTC"
      defaultView="resources"
      events={[]}
      locale="en-US"
      resources={people(1)}
      secondaryTimeZones={["Australia/Lord_Howe"]}
      weekRules={weekRules}
    >
      <ResourceWeekCalendar.ActiveView />
    </ResourceWeekCalendar.Root>,
  );
  cleanup = result.unmount;
  const notes = [...result.container.querySelectorAll('[data-slot="time-grid-zone-note"]')];

  // Seven days from Wednesday. Lord Howe moves from +10:30 to +11 at 15:30 UTC on Saturday,
  // October 3, so Saturday shifts from 16:00 and the days after it all day.
  expect(
    notes.map((note) => note.closest('[role="columnheader"]')?.getAttribute("aria-label")),
  ).toEqual([
    "Saturday, October 3, 2026",
    "Sunday, October 4, 2026",
    "Monday, October 5, 2026",
    "Tuesday, October 6, 2026",
  ]);
  expect(notes.map((note) => text(note))).toEqual(Array(4).fill("GMT+11 +30m"));
});

test("server markup is deterministic and hydrates without a mismatch", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const element = calendar(["Asia/Kolkata", "America/New_York"]);
  const container = document.createElement("div");
  container.innerHTML = renderToString(element);
  document.body.append(container);
  const server = zoneHours(container);

  try {
    expect(renderToString(element)).toBe(container.innerHTML);
    expect(server.map((hours) => hours.slice(0, 1))).toEqual([["4:30 AM"], ["7 PM-1"]]);
    const root = await act(async () => hydrateRoot(container, element));
    cleanup = async () => {
      await act(async () => root.unmount());
      container.remove();
    };

    expect(zoneHours(container)).toEqual(server);
    expect(errors).not.toHaveBeenCalled();
  } finally {
    errors.mockRestore();
  }
});

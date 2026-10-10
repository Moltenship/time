// @vitest-environment jsdom

import { sameFocus, type CalendarFocus } from "@moltenship/calendar";
import { act, StrictMode, type ComponentProps, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";

import { drag, layOut } from "./pointer";
import { render } from "./render";
import {
  booking,
  dayTarget,
  row,
  scrollTo,
  StubResizeObserver,
  Timeline,
  viewport,
  type BookingChange,
} from "./timeline-fixtures";
import { ariaLabel } from "./view-fixtures";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function show(element: ReactElement) {
  const view = await render(element);
  cleanup = view.unmount;
  return view.container;
}

async function press(key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init }),
    );
    await Promise.resolve();
  });
}

/** Focuses the view's tab stop, as Tab would. */
async function tabIn(container: HTMLElement) {
  await act(async () =>
    container.querySelector<HTMLElement>('[role="grid"] [tabindex="0"]')!.focus(),
  );
}

const focused = () => ariaLabel(document.activeElement);

const day = (date: string, resourceId: string): CalendarFocus => ({
  date: Temporal.PlainDate.from(date),
  kind: "day",
  resourceId,
});

test("the grid is one tab stop, entering on today in the first row", async () => {
  const container = await show(
    <Timeline
      events={[booking("Review", ["site-1-room-1"], "2026-10-05T09:00Z", "2026-10-05T10:00Z")]}
    />,
  );

  expect(container.querySelectorAll('[role="grid"] [tabindex="0"]')).toHaveLength(1);
  await tabIn(container);
  expect(focused()).toBe("Site 1, expanded, Thursday, October 8, 2026");
});

test("arrow keys move along rows and between them, and focus outlives scrolling away", async () => {
  const container = await show(<Timeline />);
  await tabIn(container);

  await press("ArrowDown");
  await press("ArrowDown");
  await press("ArrowRight");
  expect(focused()).toBe("Room 1.2, Friday, October 9, 2026");

  // Scrolled far away, the focused row and day still render and keep DOM focus.
  await scrollTo(viewport(container), { left: 48 * 25, top: 44 * 300 });
  expect(row(container, "site-1-room-2")).not.toBeNull();
  expect(focused()).toBe("Room 1.2, Friday, October 9, 2026");

  await press("ArrowDown");
  expect(focused()).toBe("Room 1.3, Friday, October 9, 2026");
  // The month's last day is far outside the 19 days in view; it renders to take focus.
  await press("End");
  expect(focused()).toBe("Room 1.3, Saturday, October 31, 2026");
  await press("Home");
  expect(focused()).toBe("Room 1.3, Thursday, October 1, 2026");
});

test("a keyboard move across rows proposes the same change as a pointer drop", async () => {
  const review = booking("Review", ["site-1-room-1"], "2026-10-05T09:00Z", "2026-10-05T10:00Z");
  const placed = (change: BookingChange | undefined) =>
    change?.proposed === null || change === undefined
      ? undefined
      : `${change.proposed.resourceIds.join()} ${change.proposed.start.toString()}/${change.proposed.end.toString()}`;

  const byPointer = vi.fn<(change: BookingChange) => void>();
  const pointed = await show(<Timeline events={[review]} onEventChange={byPointer} />);
  const event = pointed.querySelector('[data-event-id="Review"]')!;
  layOut([
    [event, { height: 24, width: 44, x: 4 * 48, y: 50 }],
    [
      dayTarget(pointed, "site-1-room-1", "2026-10-05"),
      { height: 44, width: 48, x: 4 * 48, y: 44 },
    ],
    [
      dayTarget(pointed, "site-1-room-3", "2026-10-07"),
      { height: 44, width: 48, x: 6 * 48, y: 132 },
    ],
  ]);
  drag(event, [
    [4 * 48 + 10, 54],
    [4 * 48 + 30, 70],
    [6 * 48 + 10, 140],
  ]);
  await cleanup?.();

  const byKeyboard = vi.fn<(change: BookingChange) => void>();
  const keyed = await show(
    <Timeline
      defaultFocus={{
        date: Temporal.PlainDate.from("2026-10-05"),
        eventId: "Review",
        kind: "event",
        resourceId: "site-1-room-1",
      }}
      events={[review]}
      onEventChange={byKeyboard}
    />,
  );
  await tabIn(keyed);
  expect(focused()).toBe("Review, Monday, October 5, 9:00 – 10:00 AM, Room 1.1");
  await press(" ");
  await press("ArrowDown");
  await press("ArrowDown");
  await press("ArrowRight");
  await press("ArrowRight");
  await press("Enter");

  expect(placed(byKeyboard.mock.calls[0]?.[0])).toBe(
    "site-1-room-3 2026-10-07T09:00:00Z/2026-10-07T10:00:00Z",
  );
  expect(placed(byKeyboard.mock.calls[0]?.[0])).toBe(placed(byPointer.mock.calls[0]?.[0]));
});

test("Space on a day drafts an all-day event in that row, and Enter creates it", async () => {
  const onEventChange = vi.fn<(change: BookingChange) => void>();
  const container = await show(
    <Timeline defaultFocus={day("2026-10-06", "site-1-room-2")} onEventChange={onEventChange} />,
  );
  await tabIn(container);
  await press(" ");
  await press("ArrowRight");

  const draft = container.querySelector('[data-slot="resource-timeline-draft"]');
  expect(draft?.closest('[role="row"]')?.getAttribute("data-resource-id")).toBe("site-1-room-2");
  await press("Enter");

  const [change] = onEventChange.mock.calls[0]!;
  expect(change.cause).toBe("create");
  expect(change.proposed?.resourceIds).toEqual(["site-1-room-2"]);
  expect(`${change.proposed?.start.toString()}/${change.proposed?.end.toString()}`).toBe(
    "2026-10-06/2026-10-08",
  );
});

test("in the day view, Space on a slot drafts an hour that grows along the row", async () => {
  const onEventChange = vi.fn<(change: BookingChange) => void>();
  const container = await show(
    <Timeline
      defaultFocus={{
        date: Temporal.PlainDate.from("2026-10-08"),
        kind: "slot",
        resourceId: "site-1-room-2",
        time: Temporal.PlainTime.from("09:00"),
      }}
      onEventChange={onEventChange}
      view="timeline-day"
    />,
  );
  await tabIn(container);
  expect(focused()).toBe("Room 1.2, Thursday, October 8 at 9:00 AM");
  await press(" ");
  await press("ArrowRight");
  await press("Enter");

  const [change] = onEventChange.mock.calls[0]!;
  expect(change.proposed?.resourceIds).toEqual(["site-1-room-2"]);
  expect(`${change.proposed?.start.toString()}/${change.proposed?.end.toString()}`).toBe(
    "2026-10-08T09:00:00Z/2026-10-08T10:30:00Z",
  );
});

test("Shift+Enter on a group's cell collapses and expands the group", async () => {
  const container = await show(<Timeline defaultFocus={day("2026-10-08", "site-1")} />);
  await tabIn(container);

  await press("Enter", { shiftKey: true });
  expect(row(container, "site-1-room-1")).toBeNull();
  expect(focused()).toBe("Site 1, collapsed, Thursday, October 8, 2026");

  await press("Enter", { shiftKey: true });
  expect(row(container, "site-1-room-1")).not.toBeNull();
});

test("in RTL the arrow keys follow the reading direction", async () => {
  const container = await show(
    <Timeline defaultFocus={day("2026-10-08", "site-1-room-1")} direction="rtl" />,
  );
  await tabIn(container);

  await press("ArrowLeft");
  expect(focused()).toBe("Room 1.1, Friday, October 9, 2026");
  await press("ArrowRight");
  await press("ArrowRight");
  expect(focused()).toBe("Room 1.1, Wednesday, October 7, 2026");
});

const tabStops = (container: Element) =>
  [...container.querySelectorAll('[role="grid"] [tabindex="0"]')].map(ariaLabel);

test("an empty day keeps its tab stop however far either axis scrolls first", async () => {
  const container = await show(<Timeline view="timeline-day" />);

  // As after opening on the current time, then scrolling down the resources.
  await scrollTo(viewport(container), { left: 12 * 56 });
  await scrollTo(viewport(container), { left: 12 * 56, top: 44 * 300 });

  expect(tabStops(container)).toEqual(["Site 1, expanded, Thursday, October 8 at 12:00 AM"]);
  await tabIn(container);
  await press("ArrowDown");
  expect(focused()).toBe("Room 1.1, Thursday, October 8 at 12:00 AM");
});

test("focus kept from a view without resources enters on the first row", async () => {
  // A month or week view's focus names no resource.
  const today = await show(
    <Timeline
      defaultFocus={{ date: Temporal.PlainDate.from("2026-10-08"), kind: "day" }}
      view="timeline-week"
    />,
  );
  expect(tabStops(today)).toEqual(["Site 1, expanded, Thursday, October 8, 2026"]);
  await cleanup?.();

  const tuesday = await show(
    <Timeline
      defaultFocus={{ date: Temporal.PlainDate.from("2026-10-06"), kind: "day" }}
      view="timeline-week"
    />,
  );
  expect(tabStops(tuesday)).toEqual(["Site 1, expanded, Tuesday, October 6, 2026"]);
  await tabIn(tuesday);
  await press("ArrowDown");
  expect(focused()).toBe("Room 1.1, Tuesday, October 6, 2026");
});

test("focus on the entry keeps one tab stop and one row when scrolled far away", async () => {
  const container = await show(<Timeline />);
  await tabIn(container);

  // The entry and the focus pin the same row and day.
  await scrollTo(viewport(container), { left: 1200, top: 13_200 });

  expect(tabStops(container)).toEqual(["Site 1, expanded, Thursday, October 8, 2026"]);
  expect(container.querySelectorAll('[role="row"][data-resource-id="site-1"]')).toHaveLength(1);
  expect(container.querySelectorAll('[role="columnheader"][aria-colindex="9"]')).toHaveLength(1);
});

test("a time grid's slot focus lands on its whole day in a timeline of days", async () => {
  for (const time of ["01:00", "09:00"]) {
    const container = await show(
      <Timeline
        defaultFocus={{
          date: Temporal.PlainDate.from("2026-10-06"),
          kind: "slot",
          time: Temporal.PlainTime.from(time),
        }}
        view="timeline-week"
      />,
    );
    const stop = container.querySelector<HTMLElement>('[role="grid"] [tabindex="0"]');

    expect(ariaLabel(stop)).toBe("Site 1, expanded, Tuesday, October 6, 2026");
    // Tuesday is the week's second day, after the resource column.
    expect(stop?.closest('[role="gridcell"]')?.getAttribute("aria-colindex")).toBe("3");
    await cleanup?.();
    cleanup = undefined;
  }
});

test("Space on a time grid's slot in a timeline of days drafts all-day, as a drag would", async () => {
  const onEventChange = vi.fn<(change: BookingChange) => void>();
  const container = await show(
    <Timeline
      defaultFocus={{
        date: Temporal.PlainDate.from("2026-10-06"),
        kind: "slot",
        resourceId: "site-1-room-2",
        time: Temporal.PlainTime.from("09:00"),
      }}
      onEventChange={onEventChange}
      view="timeline-week"
    />,
  );
  await tabIn(container);
  expect(focused()).toBe("Room 1.2, Tuesday, October 6, 2026");
  await press(" ");
  await press("ArrowRight");
  await press("Enter");

  const [change] = onEventChange.mock.calls[0]!;
  expect(`${change.proposed?.start.toString()}/${change.proposed?.end.toString()}`).toBe(
    "2026-10-06/2026-10-08",
  );
});

test("an event in pieces around a skipped date keeps the focused piece rendered", async () => {
  // Samoa skipped Friday, December 30, 2011, so a stay across it shows on either side.
  const container = await show(
    <Timeline
      anchor="2011-12-01"
      defaultFocus={{
        date: Temporal.PlainDate.from("2011-12-28"),
        eventId: "Stay",
        kind: "event",
        resourceId: "site-1-room-1",
      }}
      events={[booking("Stay", ["site-1-room-1"], "2011-12-28T20:00Z", "2011-12-30T20:00Z")]}
      timeZone="Pacific/Apia"
    />,
  );
  const column = () => document.activeElement?.closest('[role="gridcell"]')?.ariaColIndex;

  // Both pieces are scrolled away; the focused one, from December 28, renders.
  expect(container.querySelectorAll('[data-event-id="Stay"]')).toHaveLength(1);
  await tabIn(container);
  expect(column()).toBe("29");

  await press("ArrowRight");
  expect(column()).toBe("32");
  await press("Escape");
  expect(focused()).toBe("Room 1.1, Saturday, December 31, 2011");
});

test("an hour timeline enters at the first time its day has", async () => {
  // Brazil's clocks went forward at midnight on November 4, 2018: the day starts at 01:00.
  const container = await show(
    <Timeline anchor="2018-11-04" timeZone="America/Sao_Paulo" view="timeline-day" />,
  );

  expect(tabStops(container)).toEqual(["Site 1, expanded, Sunday, November 4 at 1:00 AM"]);
  await tabIn(container);
  await press("ArrowRight");
  expect(focused()).toBe("Site 1, expanded, Sunday, November 4 at 1:30 AM");
});

test("a slot its owner holds stays the tab stop on its day, and the view asks once for the day", async () => {
  const onFocusChange = vi.fn<(focus: CalendarFocus | null) => void>();
  const container = await show(
    <StrictMode>
      <Timeline
        focus={{
          date: Temporal.PlainDate.from("2026-10-06"),
          kind: "slot",
          resourceId: "site-1-room-2",
          time: Temporal.PlainTime.from("09:00"),
        }}
        onFocusChange={onFocusChange}
        view="timeline-week"
      />
    </StrictMode>,
  );

  // The owner keeps the slot; its day is still where Tab enters.
  expect(tabStops(container)).toEqual(["Room 1.2, Tuesday, October 6, 2026"]);
  // StrictMode replays the effect, which asks for the same day again: no second change.
  expect(onFocusChange).toHaveBeenCalledTimes(1);
  expect(sameFocus(onFocusChange.mock.calls[0]![0], day("2026-10-06", "site-1-room-2"))).toBe(true);
});

test("a slot off the half hour keeps its time across rows, and steps along the row align it", async () => {
  // A time grid's quarter hour, carried into the day timeline.
  const container = await show(
    <Timeline
      defaultFocus={{
        date: Temporal.PlainDate.from("2026-10-08"),
        kind: "slot",
        resourceId: "site-1-room-1",
        time: Temporal.PlainTime.from("09:15"),
      }}
      view="timeline-day"
    />,
  );
  await tabIn(container);
  await press("ArrowDown");
  expect(focused()).toBe("Room 1.2, Thursday, October 8 at 9:15 AM");
  await press("ArrowLeft");
  expect(focused()).toBe("Room 1.2, Thursday, October 8 at 9:00 AM");
  await cleanup?.();

  // Liberia's day of January 7, 1972 starts at 00:44:30, so the entry is a quarter past the hour.
  const monrovia = await show(
    <Timeline anchor="1972-01-07" timeZone="Africa/Monrovia" view="timeline-day" />,
  );
  await tabIn(monrovia);
  expect(focused()).toBe("Site 1, expanded, Friday, January 7 at 12:45 AM");
  await press("ArrowRight");
  expect(focused()).toBe("Site 1, expanded, Friday, January 7 at 1:00 AM");
});

test("Space on a slot off the half hour drafts an hour from the half hour it rounds to", async () => {
  const created = async (props: ComponentProps<typeof Timeline>) => {
    const onEventChange = vi.fn<(change: BookingChange) => void>();
    const container = await show(
      <Timeline {...props} onEventChange={onEventChange} view="timeline-day" />,
    );
    await tabIn(container);
    await press(" ");
    await press("Enter");
    await cleanup?.();
    cleanup = undefined;
    const proposed = onEventChange.mock.calls[0]?.[0].proposed;
    return `${proposed?.start.toString()}/${proposed?.end.toString()}`;
  };

  // The Monrovia entry is at 00:45; a time grid's 09:15 is carried in.
  expect(await created({ anchor: "1972-01-07", timeZone: "Africa/Monrovia" })).toBe(
    "1972-01-07T01:00:00Z/1972-01-07T02:00:00Z",
  );
  expect(
    await created({
      defaultFocus: {
        date: Temporal.PlainDate.from("2026-10-08"),
        kind: "slot",
        resourceId: "site-1-room-1",
        time: Temporal.PlainTime.from("09:15"),
      },
    }),
  ).toBe("2026-10-08T09:30:00Z/2026-10-08T10:30:00Z");
  // Nepal skipped 00:00 to 00:15 on January 1, 1986, so 23:45 rounds to where the gap ends.
  expect(
    await created({
      anchor: "1985-12-31",
      defaultFocus: {
        date: Temporal.PlainDate.from("1985-12-31"),
        kind: "slot",
        resourceId: "site-1-room-1",
        time: Temporal.PlainTime.from("23:45"),
      },
      timeZone: "Asia/Kathmandu",
    }),
  ).toBe("1985-12-31T18:30:00Z/1985-12-31T19:15:00Z");
});

test("server markup holds the tab stop when a day starts off the half hour", () => {
  // Liberia's clocks went forward 44½ minutes at midnight on January 7, 1972.
  const markup = renderToString(
    <Timeline anchor="1972-01-07" timeZone="Africa/Monrovia" view="timeline-day" />,
  );
  const server = document.createElement("div");
  server.innerHTML = markup;

  expect(tabStops(server)).toEqual(["Site 1, expanded, Friday, January 7 at 12:45 AM"]);
});

test("announcements name the resource an event is in, and the one a move takes it to", async () => {
  const container = await show(
    <Timeline
      defaultFocus={{
        date: Temporal.PlainDate.from("2026-10-05"),
        eventId: "Review",
        kind: "event",
        resourceId: "site-1-room-1",
      }}
      events={[booking("Review", ["site-1-room-1"], "2026-10-05T09:00Z", "2026-10-05T10:00Z")]}
      onEventChange={() => {}}
    />,
  );
  const spoken = () =>
    container
      .querySelector('[data-calendar-part="announcer"]')
      ?.textContent?.replace(/\s/g, " ")
      .trim();
  await tabIn(container);

  await press(" ");
  expect(spoken()).toMatch(/^Picked up Review, Monday, October 5, 9:00 – 10:00 AM, Room 1\.1\./);
  await press("ArrowDown");
  expect(spoken()).toBe("Monday, October 5, 9:00 – 10:00 AM, Room 1.2");
  await press("Enter");
  expect(spoken()).toBe("Moved Review to Monday, October 5, 9:00 – 10:00 AM, Room 1.2.");
});

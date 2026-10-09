// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  type CalendarEventChange,
  type CalendarFocus,
  type CalendarPolicy,
  type CalendarSpatialNavigationInput,
} from "@moltenship/calendar-core";
import { plainDateInterval, type PlainDateInterval } from "@moltenship/calendar-temporal";
import { act, useState } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useCalendarKeyboard,
  useRovingFocus,
  type CalendarViewRendererProps,
} from "@moltenship/calendar-react";

import {
  allDay,
  KeyboardCalendar,
  KeyboardFixture,
  renders,
  type FixtureEvent,
} from "./harness/keyboard-fixture";
import {
  hydrateWithHarness,
  renderWithHarness,
  type ReactRootHarness,
} from "./harness/render-harness";
import "./setup";

type Change = CalendarEventChange<FixtureEvent, string, string>;

let harness: ReactRootHarness | undefined;
afterEach(async () => {
  await harness?.dispose();
  harness = undefined;
  renders.clear();
});

async function mount(
  events: readonly FixtureEvent[] = [],
  onChange?: (change: Change) => void,
  props: Pick<Parameters<typeof KeyboardFixture>[0], "controlFocus" | "persist" | "policies"> = {},
) {
  harness = await renderWithHarness(
    <KeyboardFixture initialEvents={events} onChange={onChange} {...props} />,
  );
  return harness.container;
}

/** The focused element as `event@segment start` or a date. */
function focused() {
  const element = document.activeElement as HTMLElement;
  return element.dataset.event === undefined
    ? (element.dataset.date ?? element.tagName)
    : `${element.dataset.event}@${element.dataset.start}`;
}

function cell(container: HTMLElement, date: string) {
  return container.querySelector<HTMLElement>(`[data-date="${date}"]`)!;
}

function segment(container: HTMLElement, id: string) {
  return container.querySelector<HTMLElement>(`[data-event="${id}"]`)!;
}

function tabStops(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('[tabindex="0"]')].map(
    (element) => element.dataset.date ?? `${element.dataset.event}@${element.dataset.start}`,
  );
}

async function press(key: string, options: KeyboardEventInit = {}) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...options }),
    );
    await Promise.resolve();
  });
}

async function focus(element: HTMLElement) {
  await act(async () => element.focus());
}

/** What the live region last said, with Intl's thin and narrow spaces made plain. */
function spoken(container: HTMLElement) {
  return container
    .querySelector('[data-calendar-part="announcer"]')!
    .textContent!.replace(/\s/gu, " ")
    .trim();
}

describe("roving focus", () => {
  test("the view has one tab stop, today's cell before anything has focus", async () => {
    const container = await mount();
    expect(tabStops(container)).toEqual(["2026-10-08"]);
  });

  test("arrow keys move focus and DOM focus, re-rendering only the two cells", async () => {
    const container = await mount();
    await focus(cell(container, "2026-10-08"));
    renders.clear();

    await press("ArrowRight");
    expect(document.activeElement).toBe(cell(container, "2026-10-09"));
    expect(tabStops(container)).toEqual(["2026-10-09"]);
    expect(Object.fromEntries(renders)).toEqual({ "2026-10-08": 1, "2026-10-09": 1 });

    await press("ArrowDown");
    await press("Home");
    expect(document.activeElement).toBe(cell(container, "2026-10-11"));
  });

  test("moving past the visible weeks navigates the view", async () => {
    const container = await mount();
    await focus(cell(container, "2026-10-08"));

    await press("PageDown");
    expect(document.activeElement).toBe(cell(container, "2026-11-08"));
    // November's grid starts on November 1 for Sunday week starts.
    expect(cell(container, "2026-09-30")).toBeNull();
  });

  test("keeps a tab stop when focus is on a date the view no longer shows", async () => {
    const container = await mount();
    await focus(cell(container, "2026-10-08"));
    await press("ArrowRight");

    let actions: ReturnType<typeof KeyboardCalendar.useCalendarActions> | undefined;
    function Grab() {
      actions = KeyboardCalendar.useCalendarActions();
      return null;
    }
    await harness!.render(
      <KeyboardFixture initialEvents={[]}>
        <Grab />
      </KeyboardFixture>,
    );
    await act(async () => actions!.navigateNext());
    // Today is no longer shown, so the month's first day takes the tab stop.
    expect(tabStops(container)).toEqual(["2026-11-01"]);
  });

  test("Enter moves into a day's events and Escape back out", async () => {
    const container = await mount([allDay("trip", "2026-10-07", "2026-10-10", "Trip")]);
    await focus(cell(container, "2026-10-08"));

    await press("Enter");
    expect(document.activeElement).toBe(segment(container, "trip"));
    // The segment starts on the 7th; focus stays on the day it entered.
    expect(tabStops(container)).toEqual(["trip@2026-10-07"]);
    await press("ArrowRight");
    expect(document.activeElement).toBe(cell(container, "2026-10-09"));

    await focus(segment(container, "trip"));
    await press("Escape");
    expect(document.activeElement).toBe(cell(container, "2026-10-07"));
  });
});

describe("keyboard move, resize, and create", () => {
  test("Space grabs an event, arrows move it, and Enter commits one move", async () => {
    const changes: Change[] = [];
    const container = await mount([allDay("trip", "2026-10-07", "2026-10-09", "Trip")], (change) =>
      changes.push(change),
    );
    await focus(segment(container, "trip"));

    await press(" ");
    expect(spoken(container)).toBe("start move Trip Oct 7 – 8");
    await press("ArrowRight");
    await press("ArrowDown");
    // The preview moves the event itself, and focus follows it into the next week.
    expect(segment(container, "trip").dataset.start).toBe("2026-10-15");
    expect(document.activeElement).toBe(segment(container, "trip"));
    expect(spoken(container)).toBe("Oct 15 – 16");
    expect(changes).toEqual([]);

    await press("Enter");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ cause: "move", eventId: "trip", id: "change-1" });
    expect(changes[0]!.proposed).toMatchObject({ kind: "all-day" });
    expect(String(changes[0]!.proposed!.start)).toBe("2026-10-15");
    expect(spoken(container)).toBe("commit move Trip Oct 15 – 16");
    expect(document.activeElement).toBe(segment(container, "trip"));
  });

  test("Escape cancels: the event and focus go back", async () => {
    const changes: Change[] = [];
    const container = await mount([allDay("trip", "2026-10-07", "2026-10-09", "Trip")], (change) =>
      changes.push(change),
    );
    await focus(segment(container, "trip"));
    await press(" ");
    await press("ArrowDown");
    await press("ArrowDown");
    expect(segment(container, "trip").dataset.start).toBe("2026-10-21");

    await press("Escape");
    expect(segment(container, "trip").dataset.start).toBe("2026-10-07");
    expect(document.activeElement).toBe(segment(container, "trip"));
    expect(spoken(container)).toBe("cancel move Trip");
    expect(changes).toEqual([]);
  });

  test("a read-only event cannot be grabbed", async () => {
    const container = await mount([allDay("ops", "2026-10-07", "2026-10-08", "Locked")]);
    await focus(segment(container, "ops"));
    await press(" ");
    expect(spoken(container)).toBe("reject move Locked read-only");
    await press("ArrowRight");
    expect(document.activeElement).toBe(cell(container, "2026-10-08"));
  });

  test("Shift+Space resizes the end, and again the start", async () => {
    const changes: Change[] = [];
    const container = await mount([allDay("trip", "2026-10-07", "2026-10-09", "Trip")], (change) =>
      changes.push(change),
    );
    await focus(segment(container, "trip"));

    await press(" ", { shiftKey: true });
    expect(spoken(container)).toBe("start resize-end Trip Oct 7 – 8");
    await press("ArrowRight");
    expect(spoken(container)).toBe("Oct 7 – 9");

    await press(" ", { shiftKey: true });
    expect(spoken(container)).toBe("start resize-start Trip Oct 7 – 8");
    await press("ArrowLeft");
    await press("Enter");
    expect(changes.map(({ cause }) => cause)).toEqual(["resize-start"]);
    expect(String(changes[0]!.proposed!.start)).toBe("2026-10-06");
    expect(String(changes[0]!.proposed!.end)).toBe("2026-10-09");
  });

  test("Space on a day creates an all-day event that arrows extend", async () => {
    const changes: Change[] = [];
    const container = await mount([], (change) => changes.push(change));
    await focus(cell(container, "2026-10-12"));

    await press(" ");
    expect(spoken(container)).toBe("start create new Oct 12");
    await press("ArrowRight");
    await press("ArrowRight");
    expect(
      [...container.querySelectorAll<HTMLElement>("[data-draft]")].map((day) => day.dataset.date),
    ).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(document.activeElement).toBe(cell(container, "2026-10-14"));

    await press(" ");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ cause: "create", event: null, eventId: null });
    expect(String(changes[0]!.proposed!.start)).toBe("2026-10-12");
    expect(String(changes[0]!.proposed!.end)).toBe("2026-10-15");
    expect(container.querySelectorAll("[data-draft]")).toHaveLength(0);
  });

  test("Tab cancels a grab and lets focus leave", async () => {
    const container = await mount([allDay("trip", "2026-10-07", "2026-10-09", "Trip")]);
    await focus(segment(container, "trip"));
    await press(" ");
    await press("ArrowRight");

    await press("Tab");
    expect(segment(container, "trip").dataset.start).toBe("2026-10-07");
    expect(spoken(container)).toBe("cancel move Trip");
  });

  test("an unchanged drop proposes nothing", async () => {
    const changes: Change[] = [];
    const container = await mount([allDay("trip", "2026-10-07", "2026-10-09", "Trip")], (change) =>
      changes.push(change),
    );
    await focus(segment(container, "trip"));
    await press(" ");
    await press("ArrowRight");
    await press("ArrowLeft");
    await press("Enter");
    expect(changes).toEqual([]);
    expect(spoken(container)).toBe("cancel move Trip");
  });
});

test("the announcer reads a repeated message again", async () => {
  const container = await mount([allDay("ops", "2026-10-07", "2026-10-08", "Locked")]);
  const region = container.querySelector('[data-calendar-part="announcer"]')!;
  await focus(segment(container, "ops"));
  await press(" ");
  const first = region.textContent;
  await press(" ");
  expect(region.textContent).not.toBe(first);
  expect(region.textContent?.trim()).toBe(first);
  expect(region.getAttribute("aria-live")).toBe("polite");
  expect(region.getAttribute("role")).toBe("status");
});

describe("focus through edge cases", () => {
  test("switching resize edges brings focus back across weeks", async () => {
    const container = await mount([allDay("trip", "2026-10-07", "2026-10-09", "Trip")]);
    await focus(segment(container, "trip"));
    await press(" ", { shiftKey: true });
    await press("ArrowDown");
    // The end is in next week's row now, and focus followed it there.
    expect(focused()).toBe("trip@2026-10-11");

    await press(" ", { shiftKey: true });
    expect(focused()).toBe("trip@2026-10-07");
    await press("Escape");
    expect(spoken(container)).toBe("cancel resize-start Trip");
  });

  test("a resize that jumps past the minimum keeps focus on the event", async () => {
    const container = await mount([allDay("trip", "2026-10-07", "2026-10-09", "Trip")]);
    await focus(segment(container, "trip"));
    await press(" ", { shiftKey: true });
    await press("ArrowUp");
    expect(spoken(container)).toBe("Oct 7");
    expect(focused()).toBe("trip@2026-10-07");
    expect(tabStops(container)).toEqual(["trip@2026-10-07"]);
  });

  test("focus follows a policy that moves the committed event", async () => {
    const toThe20th: CalendarPolicy<FixtureEvent, string, string> = ({ cause, proposed }) =>
      cause === "move" && proposed !== null
        ? {
            proposed: {
              ...proposed,
              end: Temporal.PlainDate.from("2026-10-21"),
              kind: "all-day",
              start: Temporal.PlainDate.from("2026-10-20"),
            },
            type: "adjust",
          }
        : { type: "accept" };
    const container = await mount(
      [allDay("lunch", "2026-10-07", "2026-10-08", "Lunch")],
      undefined,
      {
        policies: [toThe20th],
      },
    );
    await focus(segment(container, "lunch"));
    await press(" ");
    await press("ArrowRight");
    await press("Enter");

    expect(focused()).toBe("lunch@2026-10-20");
    expect(tabStops(container)).toEqual(["lunch@2026-10-20"]);
    expect(spoken(container)).toBe("commit move Lunch Oct 20");
  });

  test("a late rejection leaves focus with a newer gesture", async () => {
    let rejectFirst: ((error: Error) => void) | undefined;
    const container = await mount(
      [allDay("a", "2026-10-07", "2026-10-08"), allDay("b", "2026-10-14", "2026-10-15")],
      undefined,
      {
        persist: (change) =>
          change.eventId === "a"
            ? new Promise((_, reject) => {
                rejectFirst = reject;
              })
            : Promise.resolve(),
      },
    );
    await focus(segment(container, "a"));
    await press(" ");
    await press("ArrowRight");
    await press("Enter");

    await focus(segment(container, "b"));
    await press(" ");
    await press("ArrowRight");
    await act(async () => {
      rejectFirst!(new Error("offline"));
      await new Promise((resolve) => setTimeout(resolve));
    });

    expect(spoken(container)).toBe("reject move a handler-error");
    expect(segment(container, "a").dataset.start).toBe("2026-10-07");
    expect(focused()).toBe("b@2026-10-15");
    await press("Escape");
    expect(spoken(container)).toBe("cancel move b");
  });
});

describe("late results with controlled focus", () => {
  function deferred() {
    const settle: { reject?: (error: Error) => void; resolve?: () => void } = {};
    const promise = new Promise<void>((resolve, reject) =>
      Object.assign(settle, { reject, resolve }),
    );
    return { promise, settle };
  }

  test("a late rejection does not take focus back from where the application moved it", async () => {
    const save = deferred();
    const container = await mount(
      [allDay("a", "2026-10-07", "2026-10-08"), allDay("b", "2026-10-14", "2026-10-15")],
      undefined,
      {
        controlFocus: true,
        persist: (change) => (change.eventId === "a" ? save.promise : Promise.resolve()),
      },
    );
    await focus(segment(container, "a"));
    await press(" ");
    await press("ArrowRight");
    await press("Enter");
    await focus(segment(container, "b"));

    await act(async () => {
      save.settle.reject!(new Error("offline"));
      await new Promise((resolve) => setTimeout(resolve));
    });
    expect(spoken(container)).toBe("reject move a handler-error");
    expect(focused()).toBe("b@2026-10-14");
    expect(tabStops(container)).toEqual(["b@2026-10-14"]);
  });

  test("a late, adjusted success does not move focus from where the application moved it", async () => {
    const save = deferred();
    const toThe20th: CalendarPolicy<FixtureEvent, string, string> = ({ cause, proposed }) =>
      cause === "move" && proposed !== null
        ? {
            proposed: {
              ...proposed,
              end: Temporal.PlainDate.from("2026-10-21"),
              kind: "all-day",
              start: Temporal.PlainDate.from("2026-10-20"),
            },
            type: "adjust",
          }
        : { type: "accept" };
    const container = await mount(
      [allDay("a", "2026-10-07", "2026-10-08"), allDay("b", "2026-10-14", "2026-10-15")],
      undefined,
      {
        controlFocus: true,
        persist: (change) => (change.eventId === "a" ? save.promise : Promise.resolve()),
        policies: [toThe20th],
      },
    );
    await focus(segment(container, "a"));
    await press(" ");
    await press("ArrowRight");
    await press("Enter");
    await focus(segment(container, "b"));

    await act(async () => {
      save.settle.resolve!();
      await new Promise((resolve) => setTimeout(resolve));
    });
    expect(spoken(container)).toBe("commit move a Oct 20");
    expect(focused()).toBe("b@2026-10-14");
  });
});

/** Three days per page; the first and last day page back and forward. */
function pagedNavigation({
  command,
  focus,
  range,
}: CalendarSpatialNavigationInput<PlainDateInterval, undefined>) {
  const last = range.end.subtract({ days: 1 });
  const day = (date: Temporal.PlainDate) => ({ focus: { date, kind: "day" as const } });
  if (focus === null) return day(command === "end" ? last : range.start);
  if (command === "up") {
    return focus.date.equals(range.start)
      ? { page: -1 as const }
      : day(focus.date.subtract({ days: 1 }));
  }
  if (command === "down") {
    return focus.date.equals(last) ? { page: 1 as const } : day(focus.date.add({ days: 1 }));
  }
  return null;
}

function PagedItem({ date }: { readonly date: Temporal.PlainDate }) {
  return (
    <button data-date={date.toString()} type="button" {...useRovingFocus({ date, kind: "day" })} />
  );
}

/** Hides or remounts the first day through the renderer's own state, as a popover might. */
let hideFirstDay: ((hidden: boolean) => void) | undefined;
let remountFirstDay: (() => void) | undefined;

function PagedRenderer({ projection }: CalendarViewRendererProps<PlainDateInterval, undefined>) {
  const [hidden, setHidden] = useState(false);
  const [generation, setGeneration] = useState(0);
  hideFirstDay = setHidden;
  remountFirstDay = () => setGeneration((current) => current + 1);
  return (
    <div {...useCalendarKeyboard()}>
      {[0, 1, 2].map(
        (offset) =>
          (offset > 0 || !hidden) && (
            <PagedItem
              key={offset === 0 ? `0:${generation}` : offset}
              date={projection.start.add({ days: offset })}
            />
          ),
      )}
    </div>
  );
}

const PagedCalendar = createCalendar<FixtureEvent>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [
    defineCalendarView({
      name: "paged",
      strategy: {
        getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 3 })),
        getSpatialNavigation: pagedNavigation,
        getTitle: (range) => range.start.toString(),
        navigate: (anchor, delta) => anchor.add({ days: 3 * delta }),
        project: ({ range }) => range,
      },
      Renderer: PagedRenderer,
    }),
  ],
});

function mountPaged() {
  return renderWithHarness(
    <PagedCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      events={[]}
      locale="en-US"
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <PagedCalendar.ActiveView />
    </PagedCalendar.Root>,
  );
}

test("focus returns to an element the view removes and restores on its own", async () => {
  harness = await mountPaged();
  await focus(cell(harness.container, "2026-10-08"));

  await act(async () => hideFirstDay!(true));
  expect(document.activeElement).toBe(document.body);
  await act(async () => hideFirstDay!(false));
  expect(focused()).toBe("2026-10-08");
});

test("a focus the application moves in the same commit wins over a remounted element", async () => {
  const requests: string[] = [];
  let control: ((focus: CalendarFocus | null) => void) | undefined;
  function Controlled() {
    const [focus, setFocus] = useState<CalendarFocus | null>(null);
    control = setFocus;
    return (
      <PagedCalendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="UTC"
        events={[]}
        focus={focus}
        locale="en-US"
        onFocusChange={(next) => {
          requests.push(next?.date.toString() ?? "none");
          setFocus(next);
        }}
        weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
      >
        <PagedCalendar.ActiveView />
      </PagedCalendar.Root>
    );
  }
  harness = await renderWithHarness(<Controlled />);
  await focus(cell(harness.container, "2026-10-08"));
  expect(requests).toEqual(["2026-10-08"]);

  await act(async () => {
    control!({ date: Temporal.PlainDate.from("2026-10-09"), kind: "day" });
    remountFirstDay!();
  });
  expect(focused()).toBe("2026-10-09");
  expect(requests).toEqual(["2026-10-08"]);
});

test("paging back enters the previous range from its end, and forward from its start", async () => {
  harness = await mountPaged();
  await focus(cell(harness.container, "2026-10-08"));

  await press("ArrowUp");
  expect(focused()).toBe("2026-10-07");
  await press("ArrowUp");
  expect(focused()).toBe("2026-10-06");
  await press("ArrowDown");
  await press("ArrowDown");
  expect(focused()).toBe("2026-10-08");
});

test("server markup has exactly one tab stop and hydrates unchanged", async () => {
  const element = <KeyboardFixture initialEvents={[allDay("trip", "2026-10-07", "2026-10-09")]} />;
  expect(renderToString(element).match(/tabindex="0"/g)).toHaveLength(1);

  const hydrated = await hydrateWithHarness(element);
  harness = hydrated;
  expect(hydrated.recoverableErrors).toEqual([]);
  expect(tabStops(hydrated.container)).toEqual(["2026-10-08"]);
});

test.each([
  ["a date outside the view", { date: Temporal.PlainDate.from("2026-11-20"), kind: "day" }],
  [
    "a slot, which a month does not render",
    {
      date: Temporal.PlainDate.from("2026-10-12"),
      kind: "slot",
      time: Temporal.PlainTime.from("09:00"),
    },
  ],
  [
    "an event on a date it does not cover",
    { date: Temporal.PlainDate.from("2026-10-20"), eventId: "trip", kind: "event" },
  ],
] as const)("server markup enters the view when focus is on %s", async (_, defaultFocus) => {
  const element = (
    <KeyboardFixture
      defaultFocus={defaultFocus}
      initialEvents={[allDay("trip", "2026-10-07", "2026-10-09")]}
    />
  );
  expect(renderToString(element).match(/tabindex="0"/g)).toHaveLength(1);

  const hydrated = await hydrateWithHarness(element);
  harness = hydrated;
  expect(hydrated.recoverableErrors).toEqual([]);
  expect(tabStops(hydrated.container)).toEqual(["2026-10-08"]);
});

test("a rendered focus takes the tab stop once its element registers", async () => {
  const element = (
    <KeyboardFixture
      defaultFocus={{ date: Temporal.PlainDate.from("2026-10-14"), kind: "day" }}
      initialEvents={[]}
    />
  );
  const hydrated = await hydrateWithHarness(element);
  harness = hydrated;
  expect(hydrated.recoverableErrors).toEqual([]);
  expect(tabStops(hydrated.container)).toEqual(["2026-10-14"]);
});

// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  type CalendarEventChange,
  type CalendarFocus,
  type CalendarPolicy,
  type CalendarSpatialNavigationInput,
} from "@moltenship/calendar-core";
import { plainDateInterval, type PlainDateInterval } from "@moltenship/calendar-temporal";
import { createComponent, type JSX } from "@solidjs/web";
import { createSignal, flush, For, merge, untrack } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useCalendarKeyboard,
  useRovingFocus,
  type CalendarViewRendererProps,
} from "../src";
import { element } from "../src/props";

import {
  allDay,
  KeyboardCalendar,
  KeyboardFixture,
  renders,
  tabStopReads,
  type FixtureEvent,
  type KeyboardFixtureProps,
} from "./fixtures/interaction";
import { mount as mountView, settled } from "./harness/render";
import "./setup";

type Change = CalendarEventChange<FixtureEvent, string, string>;

afterEach(() => {
  renders.clear();
  tabStopReads.clear();
});

async function mount(
  events: readonly FixtureEvent[] = [],
  onChange?: (change: Change) => void,
  props: Partial<KeyboardFixtureProps> = {},
) {
  const view = mountView(() =>
    createComponent(KeyboardFixture, merge(props, { initialEvents: events, onChange })),
  );
  await settled();
  return view.container;
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
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...options });
  (document.activeElement ?? document.body).dispatchEvent(event);
  await settled();
  // Focus that follows a re-rendered event lands a microtask after its element registers.
  await settled();
  return event;
}

async function focus(element: HTMLElement) {
  element.focus();
  await settled();
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

  test("arrow keys move focus and DOM focus, updating only the two cells' tab stops", async () => {
    const container = await mount();
    await focus(cell(container, "2026-10-08"));
    renders.clear();
    tabStopReads.clear();

    await press("ArrowRight");
    expect(document.activeElement).toBe(cell(container, "2026-10-09"));
    expect(tabStops(container)).toEqual(["2026-10-09"]);
    // Solid renders no cell again; only the two cells' tab stops change.
    expect(Object.fromEntries(renders)).toEqual({});
    expect(Object.fromEntries(tabStopReads)).toEqual({ "2026-10-08": 1, "2026-10-09": 1 });

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
    let actions: ReturnType<typeof KeyboardCalendar.useCalendarActions> | undefined;
    function Grab(): JSX.Element {
      actions = KeyboardCalendar.useCalendarActions();
      return null;
    }
    const container = await mount([], undefined, {
      get children() {
        return createComponent(Grab, {});
      },
    });
    await focus(cell(container, "2026-10-08"));
    await press("ArrowRight");

    actions!.navigateNext();
    await settled();
    // The 9th is no longer shown, so the month's first day takes the tab stop.
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

  test("Escape stops at the view: handlers around it don't hear it", async () => {
    const container = await mount([allDay("trip", "2026-10-07", "2026-10-10", "Trip")]);
    const outer: string[] = [];
    container.addEventListener("keydown", (event) => outer.push(event.key));
    await focus(segment(container, "trip"));

    const escape = await press("Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(outer).toEqual([]);
    await press("ArrowRight");
    expect(outer).toEqual(["ArrowRight"]);
  });

  test("a native key listener inside the view takes a key before the calendar does", async () => {
    // Solid delegates `onKeyDown` to the document, after the region's listener; a listener the
    // element adds itself, as from a ref, runs first and can keep the key.
    const container = await mount([allDay("trip", "2026-10-07", "2026-10-10", "Trip")]);
    const day = cell(container, "2026-10-08");
    const seen: boolean[] = [];
    day.addEventListener("keydown", (event) => {
      seen.push(event.defaultPrevented);
      if (event.key === "ArrowRight" || event.key === "Escape") event.preventDefault();
    });
    await focus(day);

    await press("ArrowRight");
    expect(document.activeElement).toBe(day);
    await press("Escape");
    await press("ArrowDown");
    expect(document.activeElement).toBe(cell(container, "2026-10-15"));
    expect(seen).toEqual([false, false, false]);
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
    expect(focused()).toBe("trip@2026-10-15");
    expect(spoken(container)).toBe("Oct 15 – 16");
    expect(changes).toEqual([]);

    await press("Enter");
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ cause: "move", eventId: "trip", id: "change-1" });
    expect(String(changes[0]!.proposed!.start)).toBe("2026-10-15");
    expect(spoken(container)).toBe("commit move Trip Oct 15 – 16");
    expect(document.activeElement).toBe(segment(container, "trip"));
  });

  test("the preview asks the policies as the commit will, as the keyboard", async () => {
    const asked: string[] = [];
    const container = await mount([allDay("trip", "2026-10-07", "2026-10-09", "Trip")], undefined, {
      policies: [
        (_change, { detail }) => {
          asked.push(detail?.input ?? "none");
          return { type: "accept" };
        },
      ],
    });
    await focus(segment(container, "trip"));

    await press(" ");
    await press("ArrowRight");
    const previews = asked.length;
    await press("Enter");

    expect(previews).toBeGreaterThan(0);
    expect(asked).toEqual(asked.map(() => "keyboard"));
    expect(asked.length).toBeGreaterThan(previews);
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

  test("a calendar without onEventChange leaves Space to the focused element", async () => {
    const container = await mount([allDay("trip", "2026-10-07", "2026-10-09", "Trip")], undefined, {
      readOnly: true,
    });
    await focus(segment(container, "trip"));
    const plain = await press(" ");
    const shifted = await press(" ", { shiftKey: true });
    expect([plain.defaultPrevented, shifted.defaultPrevented]).toEqual([false, false]);
    await focus(cell(container, "2026-10-08"));
    expect((await press(" ")).defaultPrevented).toBe(false);
    expect(spoken(container)).toBe("");
    // Arrow keys still move focus.
    await press("ArrowRight");
    expect(document.activeElement).toBe(cell(container, "2026-10-09"));
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

  test("a view that unmounts mid-gesture leaves nothing grabbed", async () => {
    const [shown, setShown] = createSignal(true);
    let interaction: (() => unknown) | undefined;
    function Probe(): JSX.Element {
      interaction = untrack(() => KeyboardCalendar.useCalendarSelector((state) => state.focus));
      return null;
    }
    const view = mountView(() =>
      createComponent(KeyboardCalendar.Root, {
        defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
        defaultTimeZone: "UTC",
        events: [allDay("trip", "2026-10-07", "2026-10-09", "Trip")],
        locale: "en-US",
        now: Temporal.Instant.from("2026-10-08T12:00:00Z"),
        onEventChange: () => undefined,
        weekRules: { firstDay: 7, minimalDays: 1, weekend: [6, 7] },
        get children() {
          return [
            createComponent(Probe, {}),
            (() => (shown() ? createComponent(KeyboardCalendar.ActiveView, {}) : null)) as never,
          ];
        },
      }),
    );
    await settled();
    expect(interaction).toBeDefined();
    await focus(segment(view.container, "trip"));
    await press(" ");
    await press("ArrowRight");
    expect(segment(view.container, "trip").dataset.start).toBe("2026-10-08");

    setShown(false);
    await settled();
    setShown(true);
    await settled();
    // The grabbed event is back where it was: the preview went with the gesture.
    expect(segment(view.container, "trip").dataset.start).toBe("2026-10-07");
  });
});

describe("what a person's keys tell the state handlers", () => {
  test("arrow keys and paging are the keyboard's, with their reason", async () => {
    const heard: string[] = [];
    const container = await mount([], undefined, { onStateChange: (entry) => heard.push(entry) });
    await focus(cell(container, "2026-10-08"));
    heard.length = 0;

    await press("ArrowRight");
    await press("PageDown");

    expect(heard).toEqual([
      "focus keyboard-navigation keydown",
      "focus keyboard-navigation keydown",
      "anchorDate keyboard-navigation keydown",
    ]);
  });

  test("focus a person moves onto a cell is a focus change, not the application's", async () => {
    const heard: string[] = [];
    const container = await mount([], undefined, { onStateChange: (entry) => heard.push(entry) });

    await focus(cell(container, "2026-10-12"));

    // Solid binds the element's own `focus` event, where React's `onFocus` hears `focusin`.
    expect(heard).toEqual(["focus focus-change focus"]);
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
  expect((region as HTMLElement).style.position).toBe("absolute");
});

test("a rendered focus takes the tab stop once its element registers", async () => {
  const container = await mount([allDay("trip", "2026-10-07", "2026-10-09", "Trip")], undefined, {
    defaultFocus: { date: Temporal.PlainDate.from("2026-10-07"), eventId: "trip", kind: "event" },
  });
  flush();
  expect(tabStops(container)).toEqual(["trip@2026-10-07"]);
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
    const container = await mount(
      [allDay("lunch", "2026-10-07", "2026-10-08", "Lunch")],
      undefined,
      { policies: [toThe20th] },
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
    rejectFirst!(new Error("offline"));
    await new Promise((resolve) => setTimeout(resolve));
    await settled();

    expect(spoken(container)).toBe("reject move a handler-error (offline)");
    expect(segment(container, "a").dataset.start).toBe("2026-10-07");
    expect(focused()).toBe("b@2026-10-15");
    await press("Escape");
    expect(spoken(container)).toBe("cancel move b");
  });
});

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

describe("late results with controlled focus", () => {
  test("a late rejection does not take focus back from where the application moved it", async () => {
    const save = Promise.withResolvers<void>();
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

    save.reject(new Error("offline"));
    await new Promise((resolve) => setTimeout(resolve));
    await settled();
    expect(spoken(container)).toBe("reject move a handler-error (offline)");
    expect(focused()).toBe("b@2026-10-14");
    expect(tabStops(container)).toEqual(["b@2026-10-14"]);
  });

  test("a late, adjusted success does not move focus from where the application moved it", async () => {
    const save = Promise.withResolvers<void>();
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

    save.resolve();
    await new Promise((resolve) => setTimeout(resolve));
    await settled();
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

const PagedButton = element("button");
const PagedDiv = element("div");

/** Keyed by position, as React's is: a new page gives the same element a new date. */
function PagedItem(props: { readonly date: Temporal.PlainDate }): JSX.Element {
  return createComponent(
    PagedButton,
    merge(
      useRovingFocus(() => ({ date: props.date, kind: "day" })),
      {
        get "data-date"() {
          return props.date.toString();
        },
        type: "button",
      } as const,
    ),
  );
}

/** Hides or remounts the first day through the renderer's own state, as a popover might. */
let hideFirstDay: ((hidden: boolean) => void) | undefined;
let remountFirstDay: (() => void) | undefined;

function PagedRenderer(
  props: CalendarViewRendererProps<PlainDateInterval, undefined>,
): JSX.Element {
  const [hidden, setHidden] = createSignal(false);
  const [generation, setGeneration] = createSignal(0);
  hideFirstDay = setHidden;
  remountFirstDay = () => setGeneration((current) => current + 1);
  const days = () =>
    [0, 1, 2]
      .filter((offset) => offset > 0 || !hidden())
      .map((offset) => ({
        date: props.projection.start.add({ days: offset }),
        key: offset === 0 ? `0:${generation()}` : String(offset),
      }));
  return createComponent(PagedDiv, {
    ref: useCalendarKeyboard(),
    get children() {
      return createComponent(For, {
        get each() {
          return days();
        },
        keyed: (day: { readonly key: string }) => day.key,
        children: (day: () => { readonly date: Temporal.PlainDate }) =>
          createComponent(PagedItem, {
            get date() {
              return day().date;
            },
          }),
      } as never);
    },
  });
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

const pagedRoot = {
  defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
  defaultTimeZone: "UTC",
  events: [],
  locale: "en-US",
  weekRules: { firstDay: 7, minimalDays: 1, weekend: [6, 7] },
} as const;

async function mountPaged(props: Partial<Parameters<typeof PagedCalendar.Root>[0]> = {}) {
  const view = mountView(() =>
    createComponent(
      PagedCalendar.Root,
      merge(pagedRoot, props, {
        get children() {
          return createComponent(PagedCalendar.ActiveView, {});
        },
      }) as Parameters<typeof PagedCalendar.Root>[0],
    ),
  );
  await settled();
  return view.container;
}

test("focus returns to an element the view removes and restores on its own", async () => {
  const container = await mountPaged();
  await focus(cell(container, "2026-10-08"));

  hideFirstDay!(true);
  await settled();
  expect(document.activeElement).toBe(document.body);
  hideFirstDay!(false);
  await settled();
  await settled();
  expect(focused()).toBe("2026-10-08");
});

test("a focus the application moves in the same flush wins over a remounted element", async () => {
  const requests: string[] = [];
  // In an object: Solid 2 reads a function given to createSignal as a derivation.
  const [controlled, setControlled] = createSignal<{ value: CalendarFocus | null }>({
    value: null,
  });
  const container = await mountPaged({
    get focus() {
      return controlled().value;
    },
    onFocusChange: (next) => {
      requests.push(next?.date.toString() ?? "none");
      setControlled({ value: next });
    },
  });
  await focus(cell(container, "2026-10-08"));
  expect(requests).toEqual(["2026-10-08"]);

  setControlled({ value: { date: Temporal.PlainDate.from("2026-10-09"), kind: "day" } });
  remountFirstDay!();
  await settled();
  await settled();
  expect(focused()).toBe("2026-10-09");
  expect(requests).toEqual(["2026-10-08"]);
});

test("paging back enters the previous range from its end, and forward from its start", async () => {
  const container = await mountPaged();
  await focus(cell(container, "2026-10-08"));

  await press("ArrowUp");
  expect(focused()).toBe("2026-10-07");
  await press("ArrowUp");
  expect(focused()).toBe("2026-10-06");
  await press("ArrowDown");
  await press("ArrowDown");
  expect(focused()).toBe("2026-10-08");
});

test("a keyboard view lets go of its listeners and its gesture with its owner", async () => {
  const removed = vi.spyOn(HTMLElement.prototype, "removeEventListener");
  const view = mountView(() =>
    createComponent(KeyboardFixture, {
      initialEvents: [allDay("trip", "2026-10-07", "2026-10-09", "Trip")],
    }),
  );
  await settled();
  const grid = view.container.querySelector<HTMLElement>('[data-testid="grid"]')!;
  await focus(segment(view.container, "trip"));
  await press(" ");
  view.dispose();
  const types = removed.mock.calls
    .filter((_, index) => removed.mock.contexts[index] === grid)
    .map(([type]) => type);
  expect(types).toEqual(expect.arrayContaining(["keydown", "focusout"]));
  removed.mockRestore();
});

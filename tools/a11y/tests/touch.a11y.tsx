import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarResource,
} from "@moltenship/calendar";
import { act } from "react";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { cdp, page, server } from "vite-plus/test/browser";

import { createMonthView } from "@registry/month-view/month-view";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { createTimelineDayView } from "@registry/resource-timeline-view/resource-timeline-view";
import { createScrollingMonthView } from "@registry/scrolling-month-view/scrolling-month-view";
import { createScrollingDayView } from "@registry/scrolling-time-grid-view/scrolling-time-grid-view";
import { createDayView } from "@registry/time-grid-view/time-grid-view";
import { TooltipProvider } from "@registry/ui/tooltip";

import { render, until } from "./render";

type Fixture = CalendarEvent<null, string, string>;
type Change = CalendarEventChange<Fixture, string, string>;

/** Every registry view with a pointer layer. */
const Calendar = createCalendar<Fixture, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [
    createDayView<Fixture>(),
    createScrollingDayView<Fixture>(),
    createMonthView<Fixture>(),
    createScrollingMonthView<Fixture>(),
    createResourceColumnsView<Fixture>(),
    createTimelineDayView<Fixture>(),
  ],
});
type View = (typeof Calendar.views)[number]["name"];

const review: Fixture = {
  data: null,
  end: Temporal.Instant.from("2026-10-08T11:00:00Z"),
  id: "review",
  kind: "timed",
  resourceIds: ["ada"],
  start: Temporal.Instant.from("2026-10-08T10:00:00Z"),
  title: "Review",
};
const resources: readonly CalendarResource<null>[] = [{ data: null, id: "ada", title: "Ada" }];

/** A phone's calendar, on the day view by default; without `onEventChange` it's read-only. */
function Day({
  onEventChange,
  view = "day",
}: {
  readonly onEventChange?: (change: Change) => void;
  readonly view?: View;
}) {
  return (
    <TooltipProvider>
      <Calendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="UTC"
        defaultView={view}
        events={[review]}
        locale="en-US"
        now={Temporal.Instant.from("2026-10-08T08:30:00Z")}
        onEventChange={onEventChange}
        resources={resources}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Calendar.Frame className="flex h-dvh flex-col">
          <Calendar.Viewport className="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </Calendar.Frame>
      </Calendar.Root>
    </TooltipProvider>
  );
}

const region = () => document.querySelector<HTMLElement>('[data-slot="time-grid"]')!;
const body = () => document.querySelector<HTMLElement>('[data-slot="time-grid-body"]')!;
const event = () => body().querySelector<HTMLElement>('[data-event-id="review"]')!;
/** The day's column, and the height of an hour in it. */
function column() {
  const element = event().closest<HTMLElement>("[data-date]")!;
  return { box: element.getBoundingClientRect(), element, hour: element.offsetHeight / 24 };
}

/** Where the first change puts the event. */
function placed(onEventChange: ReturnType<typeof vi.fn<(change: Change) => void>>) {
  const change = onEventChange.mock.calls[0]?.[0];
  const proposed = change?.proposed;
  return change === undefined || proposed == null
    ? undefined
    : `${change.cause} ${proposed.start.toString()}/${proposed.end.toString()}`;
}

/** Sends a finger's pointer event at a point of the page, as a touch screen does. */
async function finger(type: string, target: Element, [x, y]: readonly [number, number]) {
  await act(async () => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        button: type === "pointermove" ? -1 : 0,
        cancelable: true,
        clientX: x,
        clientY: y,
        isPrimary: true,
        pointerId: 7,
        pointerType: "touch",
      }),
    );
  });
}

/** Whether `type`, sent from `target` now, would have its default prevented. */
function prevented(type: string, target: Element = event()) {
  const sent = new Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(sent);
  return sent.defaultPrevented;
}

/**
 * Runs `steps` on fake timers, then lets far more time pass than any long-press takes, so a
 * gesture that was going to start has, without waiting for it.
 */
async function longAfter(steps: () => Promise<void>) {
  vi.useFakeTimers({ toFake: ["clearTimeout", "setTimeout"] });
  try {
    await steps();
    await act(async () => vi.advanceTimersByTime(10_000));
  } finally {
    vi.useRealTimers();
  }
}

/** The middle of an element. */
function middle(element: Element): [number, number] {
  const box = element.getBoundingClientRect();
  return [box.left + box.width / 2, box.top + box.height / 2];
}

beforeAll(async () => {
  await page.viewport(390, 720);
});

// Touch through pointer events, which every engine runs: Chromium in `vp run a11y`, and Firefox
// and WebKit in `vp run browsers`. A finger's own scrolling is checked through CDP below.
describe(`touch gestures in ${server.browser}`, () => {
  test("a finger that moves before the long-press starts nothing, so it can scroll", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Day onEventChange={onEventChange} />);
    const [x, y] = middle(event());

    await longAfter(async () => {
      await finger("pointerdown", event(), [x, y]);
      await finger("pointermove", event(), [x, y - 30]);
      expect(prevented("touchmove")).toBe(false);
    });

    expect(region().hasAttribute("data-interaction")).toBe(false);
    expect(document.querySelector("[data-calendar-ghost]")).toBeNull();
    await finger("pointerup", event(), [x, y - 30]);
    expect(onEventChange).not.toHaveBeenCalled();
  });

  test("the long-press runs on the page's timers, which the checks above fake", async () => {
    await render(<Day onEventChange={() => {}} />);
    const [x, y] = middle(event());

    await longAfter(() => finger("pointerdown", event(), [x, y]));

    expect(region().getAttribute("data-interaction")).toBe("move");
    await finger("pointerup", event(), [x, y]);
  });

  test("a long-press picks an event up, and the page holds still while it moves", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Day onEventChange={onEventChange} />);
    const { hour } = column();
    const [x, y] = middle(event());

    await finger("pointerdown", event(), [x, y]);
    // The page keeps its selection and context menu shut from the press on.
    expect([prevented("selectstart"), prevented("contextmenu")]).toEqual([true, true]);
    await until(() => expect(region().getAttribute("data-interaction")).toBe("move"));
    expect(prevented("touchmove")).toBe(true);
    await finger("pointermove", event(), [x, y + hour]);
    await finger("pointerup", event(), [x, y + hour]);

    await until(() =>
      expect(placed(onEventChange)).toBe("move 2026-10-08T11:00:00Z/2026-10-08T12:00:00Z"),
    );
    expect(prevented("touchmove")).toBe(false);
  });

  test("a long-press on the end handle resizes the event", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Day onEventChange={onEventChange} />);
    const { hour } = column();
    const handle = event().querySelector<HTMLElement>('[data-resize="end"]')!;
    const [x, y] = middle(handle);

    await finger("pointerdown", handle, [x, y]);
    await until(() => expect(region().getAttribute("data-interaction")).toBe("resize"));
    await finger("pointermove", handle, [x, y + hour / 2]);
    await finger("pointerup", handle, [x, y + hour / 2]);

    await until(() =>
      expect(placed(onEventChange)).toBe("resize-end 2026-10-08T10:00:00Z/2026-10-08T11:30:00Z"),
    );
  });

  test("a long-press on an empty slot creates an event over the slots the finger covers", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Day onEventChange={onEventChange} />);
    const { box, element, hour } = column();
    // 2:05 PM, in the 2:00 slot, to 2:50 PM, in the 2:45 slot.
    const from: [number, number] = [box.left + 10, box.top + hour * (14 + 5 / 60)];
    const to: [number, number] = [box.left + 10, box.top + hour * (14 + 50 / 60)];

    await finger("pointerdown", element, from);
    await until(() => expect(region().getAttribute("data-interaction")).toBe("create"));
    await finger("pointermove", element, to);
    await finger("pointerup", element, to);

    await until(() =>
      expect(placed(onEventChange)).toBe("create 2026-10-08T14:00:00Z/2026-10-08T15:00:00Z"),
    );
  });

  test("a dragged event held at the grid's bottom edge scrolls it on", async () => {
    await render(<Day onEventChange={() => {}} />);
    const [x, y] = middle(event());
    const start = body().scrollTop;
    const edge = body().getBoundingClientRect().bottom - 8;

    await finger("pointerdown", event(), [x, y]);
    await until(() => expect(region().getAttribute("data-interaction")).toBe("move"));
    await finger("pointermove", event(), [x, edge]);

    await until(() => expect(body().scrollTop).toBeGreaterThan(start + 100));
    await finger("pointerup", event(), [x, edge]);
  });

  test("on a root without onEventChange, a long-press starts nothing", async () => {
    await render(<Day />);
    const [x, y] = middle(event());

    await longAfter(() => finger("pointerdown", event(), [x, y]));

    expect(region().hasAttribute("data-interaction")).toBe(false);
    expect(prevented("touchmove")).toBe(false);
    await finger("pointerup", event(), [x, y]);
  });
});

/** Turns a point of the test's frame into one of the page CDP drives. */
function onPage([x, y]: readonly [number, number]) {
  const frame = window.frameElement;
  if (frame === null) return { x, y };
  const box = frame.getBoundingClientRect();
  const scale = box.width / (frame as HTMLElement).offsetWidth;
  return { x: box.left + x * scale, y: box.top + y * scale };
}

/** A finger on the touch screen, through Chromium's own input pipeline. */
async function touch(
  type: "touchEnd" | "touchMove" | "touchStart",
  at?: readonly [number, number],
) {
  await cdp().send("Input.dispatchTouchEvent", {
    touchPoints: at === undefined ? [] : [{ id: 1, ...onPage(at) }],
    type,
  });
}

/** Moves the finger from `from` to `to` in `steps` frames. */
async function slide(from: readonly [number, number], to: readonly [number, number], steps = 8) {
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    await touch("touchMove", [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

// Real touches scroll the page and send `pointercancel` as the browser takes them over, which
// synthetic events can't show. CDP drives them in Chromium only.
describe.runIf(server.browser === "chromium")("a finger on Chromium's touch screen", () => {
  beforeAll(async () => {
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  });
  // The page outlives this file: the next file in it gets a mouse again, and hover with it.
  afterAll(async () => {
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
  });

  test.each<[View, string]>([
    ["day", "time-grid"],
    ["scrolling-day", "scrolling-time-grid"],
    ["month", "month-view"],
    ["scrolling-month", "scrolling-month"],
    ["resources", "resource-columns"],
    ["timeline-day", "resource-timeline"],
  ])("the %s view selects no text on a touch screen, unless it's read-only", async (view, slot) => {
    // Emulated touch makes the pointer coarse, as on a phone.
    expect(matchMedia("(pointer: coarse)").matches).toBe(true);
    const selection = () =>
      getComputedStyle(document.querySelector(`[data-slot="${slot}"]`)!).userSelect;

    await render(<Day onEventChange={() => {}} view={view} />);
    expect(selection()).toBe("none");
    await render(<Day view={view} />);
    expect(selection()).not.toBe("none");
  });

  test("a swipe over an event scrolls the grid and starts nothing", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Day onEventChange={onEventChange} />);
    const start = body().scrollTop;
    const [x, y] = middle(event());

    await touch("touchStart", [x, y]);
    try {
      await slide([x, y], [x, y - 200]);
    } finally {
      await touch("touchEnd");
    }

    await until(() => expect(body().scrollTop).toBeGreaterThan(start + 50));
    expect(region().hasAttribute("data-interaction")).toBe(false);
    expect(onEventChange).not.toHaveBeenCalled();
  });

  test("a long-press drag moves the event while the grid holds still", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Day onEventChange={onEventChange} />);
    const { hour } = column();
    const start = body().scrollTop;
    const [x, y] = middle(event());

    // A failed check lifts the finger too, so the next test starts with none down.
    await touch("touchStart", [x, y]);
    try {
      await until(() => expect(region().getAttribute("data-interaction")).toBe("move"));
      await slide([x, y], [x, y + hour]);
      expect(body().scrollTop).toBe(start);
    } finally {
      await touch("touchEnd");
    }

    await until(() =>
      expect(placed(onEventChange)).toBe("move 2026-10-08T11:00:00Z/2026-10-08T12:00:00Z"),
    );
  });
});

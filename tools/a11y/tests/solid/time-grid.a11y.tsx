import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEventChange,
} from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { cdp, page, server, userEvent } from "vite-plus/test/browser";

import { calendarAnnouncements } from "@registry/shared/calendar/announcements";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  createDayView,
  createThreeDayView,
  createWeekView,
} from "@registry/time-grid-view/time-grid-view";

import { seriousViolations, setTheme, themes } from "../axe";
import { describeLayout } from "../kit-twins";
import {
  timeGridAnchor,
  timeGridAnnotationSources,
  timeGridAnnotations,
  timeGridAvailability,
  timeGridEvents,
  timeGridNow,
  timeGridWeekRules,
  timeGridZones,
  type TimeGridFixture,
} from "../time-grid-fixture";
import day from "../view-twins/day.txt?raw";
import weekAnnotations from "../view-twins/week-annotations.txt?raw";
import weekDraft from "../view-twins/week-draft.txt?raw";
import week from "../view-twins/week.txt?raw";
import { press, render, settled, until } from "./render";

// The Solid registry's week and day views in a real browser, against what React's files check
// (time-grid-twins, registry-views, rtl-layout, phone-layout, interactions and reduced-motion):
// they render React's grids, pass axe in both themes, mirror in RTL, move, resize and create
// events by pointer in both preview modes without re-rendering the grid and by keyboard, and their
// targets are 24 px on a phone.

type View = "3-day" | "day" | "week";
type Change = CalendarEventChange<TimeGridFixture, string, string>;

const Calendar = createCalendar<TimeGridFixture>()({
  eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
  views: [
    createWeekView<TimeGridFixture>({
      dayView: "day",
      getEventColor: (event) => event.data.color,
    }),
    createDayView<TimeGridFixture>({ getEventColor: (event) => event.data.color }),
    createThreeDayView<TimeGridFixture>({ getEventColor: (event) => event.data.color }),
  ],
});

function TimeGrid(props: {
  /** With the fixture's annotations and working hours. */
  readonly annotated?: boolean;
  readonly dir?: "ltr" | "rtl";
  readonly dragPreview?: "free" | "snapped";
  readonly onEventChange?: (change: Change) => void;
  readonly view?: View;
}) {
  const view = () => props.view ?? "week";
  // Saves each change, as an app does, so focus and the grid follow a dropped event.
  const [events, setEvents] = createSignal<readonly TimeGridFixture[]>(timeGridEvents);
  const save = (change: Change) => {
    props.onEventChange?.(change);
    const proposed = change.proposed;
    if (proposed == null || change.eventId === null) return;
    setEvents((all) =>
      all.map((event) =>
        event.id === change.eventId ? ({ ...event, ...proposed } as TimeGridFixture) : event,
      ),
    );
  };
  return (
    <Calendar.Root
      annotationSources={props.annotated === true ? timeGridAnnotationSources : undefined}
      annotations={props.annotated === true ? timeGridAnnotations : undefined}
      availability={props.annotated === true ? timeGridAvailability : undefined}
      defaultAnchorDate={timeGridAnchor}
      defaultTimeZone="UTC"
      defaultView={view()}
      direction={props.dir ?? "ltr"}
      events={events()}
      locale="en-US"
      now={timeGridNow}
      onEventChange={save}
      secondaryTimeZones={view() === "day" ? timeGridZones : undefined}
      viewOptions={{ [view()]: { dragPreview: props.dragPreview } }}
      weekRules={timeGridWeekRules}
    >
      <Calendar.Frame class="flex h-dvh flex-col" dir={props.dir ?? "ltr"}>
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
      <Calendar.Announcer messages={calendarAnnouncements} />
    </Calendar.Root>
  );
}

const grid = () => document.querySelector<HTMLElement>('[data-slot="time-grid"]')!;
const column = (date: string) =>
  grid().querySelector<HTMLElement>(`[data-slot="time-grid-body"] [data-date="${date}"]`)!;
const chip = (id: string) => grid().querySelector<HTMLElement>(`[data-event-id="${id}"]`)!;
const longTitle = "Quarterly roadmap review with the platform, design and research teams";
const nowLine = () =>
  until(() => expect(grid().querySelector('[data-slot="time-grid-now"]')).not.toBeNull());
const allDayCell = (date: string) =>
  grid().querySelector<HTMLElement>(`[data-all-day][data-date="${date}"]`)!;
const spoken = () =>
  document
    .querySelector('[data-calendar-part="announcer"]')
    ?.textContent?.replace(/\s/g, " ")
    .trim();

/** Where the first change puts the event. */
function placed(onEventChange: ReturnType<typeof vi.fn<(change: Change) => void>>) {
  const change = onEventChange.mock.calls[0]?.[0];
  const proposed = change?.proposed;
  return change === undefined || proposed == null
    ? undefined
    : `${change.cause} ${proposed.start.toString()}/${proposed.end.toString()}`;
}

function middle(element: Element): [number, number] {
  const box = element.getBoundingClientRect();
  return [box.left + box.width / 2, box.top + box.height / 2];
}

/** A point `hours` below `point`, on the grid's scale of 24 hours to a column. */
function below([x, y]: readonly [number, number], hours: number): [number, number] {
  const box = column(timeGridAnchor.toString()).getBoundingClientRect();
  return [x, y + (hours * box.height) / 24];
}

/** A point at `time` in `date`'s column, a quarter of the way across it. */
function at(date: string, time: string): [number, number] {
  const box = column(date).getBoundingClientRect();
  const { hour, minute } = Temporal.PlainTime.from(time);
  return [box.left + box.width / 4, box.top + ((hour * 60 + minute) / 1440) * box.height];
}

/** A mouse's pointer event at a point of the page, on what's under it. */
function fire(type: string, [x, y]: readonly [number, number]) {
  (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      cancelable: true,
      clientX: x,
      clientY: y,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    }),
  );
}

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

/** Presses at `from`, moves to `to` in `steps` frames, and holds it there. */
async function dragTo(from: readonly [number, number], to: readonly [number, number], steps = 6) {
  fire("pointerdown", from);
  for (let step = 1; step <= steps; step++) {
    const t = step / steps;
    fire("pointermove", [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    await frame();
  }
}

/** The grid's elements a drag changed, other than the pointer layer's ghosts and their insides. */
function watchGrid() {
  const changed = new Set<Node>();
  const ghosts = "[data-calendar-ghost], [data-calendar-ghost-origin]";
  const ghost = (node: Node) => node instanceof Element && node.matches(ghosts);
  // A ghost's time label follows the range it would land on.
  const inGhost = (node: Node) =>
    (node instanceof Element ? node : node.parentElement)?.closest(ghosts) != null;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (inGhost(record.target)) continue;
      if (![...record.addedNodes, ...record.removedNodes].every(ghost)) changed.add(record.target);
    }
  });
  observer.observe(grid(), { childList: true, subtree: true });
  return { changed, stop: () => observer.disconnect() };
}

// The descriptions are Chromium's: another engine serializes some attributes its own way.
describe.runIf(server.browser === "chromium")("the Solid time grid renders React's", () => {
  test("the week, with its all-day row collapsed", async () => {
    await render(() => <TimeGrid view="week" />);
    await nowLine();
    expect(describeLayout(grid())).toBe(week);
  });

  test("the week, with a slot focused and a keyboard draft on it", async () => {
    await render(() => <TimeGrid view="week" />);
    await nowLine();
    // From today's all-day cell, the grid's tab stop, to its first slot, then a create there.
    grid().querySelector<HTMLElement>('[tabindex="0"]')!.focus();
    await userEvent.keyboard("{ArrowDown} ");
    await until(() => expect(grid().querySelector('[data-slot="time-grid-draft"]')).not.toBeNull());
    expect(describeLayout(grid())).toBe(weekDraft);
    await userEvent.keyboard("{Escape}");
  });

  test("the week, with annotations and working hours, and a slot focused in both", async () => {
    await render(() => <TimeGrid annotated view="week" />);
    await until(() => expect(grid().querySelector('[data-slot="annotation-mark"]')).not.toBeNull());
    // Thursday's first slot, at midnight: closed, and in Wednesday night's sleep.
    grid().querySelector<HTMLElement>('[tabindex="0"]')!.focus();
    await userEvent.keyboard("{ArrowDown}");
    await until(() => expect(document.activeElement?.getAttribute("role")).toBe("button"));
    expect(describeLayout(grid())).toBe(weekAnnotations);
  });

  test("the day, with a second time zone", async () => {
    await render(() => <TimeGrid view="day" />);
    await nowLine();
    expect(describeLayout(grid())).toBe(day);
  });
});

describe.each(themes)("the Solid time grid, %s theme", (theme) => {
  test.each(["week", "day"] as const)("the %s has no serious violations", async (view) => {
    setTheme(theme);
    await render(() => <TimeGrid view={view} />);
    await nowLine();

    expect(await seriousViolations()).toEqual([]);
  });

  test("the all-day row has none expanded, and an event none while hovered", async () => {
    setTheme(theme);
    await render(() => <TimeGrid />);
    grid().querySelector<HTMLElement>('[aria-label="Show all all-day events"]')!.click();
    await settled();
    expect(grid().querySelector('[aria-label="Show fewer all-day events"]')).not.toBeNull();
    await userEvent.hover(chip("Planning"));

    expect(await seriousViolations()).toEqual([]);
  });
});

describe("the Solid time grid's tooltip", () => {
  test("shows a clipped title in full, and nothing for a title that fits", async () => {
    await render(() => <TimeGrid />);
    // Tuesday's review has the column to itself, so its title fits on one line.
    await userEvent.hover(chip("Locked review"));
    await settled();
    expect(document.querySelector('[data-slot="tooltip-content"][data-open]')).toBeNull();

    await userEvent.hover(chip(longTitle));
    await until(() =>
      expect(document.querySelector('[data-slot="tooltip-content"][data-open]')?.textContent).toBe(
        longTitle,
      ),
    );
    // It names the event as its chip does, and renders outside the grid.
    const content = document.querySelector('[data-slot="tooltip-content"]')!;
    expect(content.getAttribute("aria-label")).toBe(chip(longTitle).getAttribute("aria-label"));
    expect(grid().contains(content)).toBe(false);
  });
});

const mark = (source: "music" | "sleep") =>
  grid().querySelector<HTMLElement>(`[data-slot="annotation-mark"][data-source="${source}"]`);
const popover = () => document.querySelector<HTMLElement>('[data-slot="popover-content"]');

/** Clicks a mark, as a pointer does: the press keeps focus where it was. */
async function clickMark(source: "music" | "sleep") {
  await userEvent.click(mark(source)!);
  await settled();
}

/** A button outside the grid, focused, so a test sees focus come back to it. */
function focusedButton(): HTMLButtonElement {
  const button = document.body.appendChild(document.createElement("button"));
  button.textContent = "Before";
  button.focus();
  return button;
}

describe.each(themes)("the Solid time grid's annotations, %s theme", (theme) => {
  test("the week with annotations and working hours has no serious violations", async () => {
    setTheme(theme);
    await render(() => <TimeGrid annotated />);
    await nowLine();

    expect(await seriousViolations()).toEqual([]);
  });

  test("a mark's details popover has none, keeps focus and closes with Escape", async () => {
    setTheme(theme);
    await render(() => <TimeGrid annotated />);
    await clickMark("music");
    await until(() => expect(popover()?.contains(document.activeElement)).toBe(true));

    expect(await seriousViolations()).toEqual([]);
    // Focus stays out of the hidden rail: no focus guards there while open, and none after.
    expect(document.querySelectorAll('[data-slot="annotation-rail"] [tabindex="0"]')).toHaveLength(
      0,
    );
    await press("Escape");
    // It closes after its exit animation.
    await until(() => expect(popover()).toBeNull());
    expect(document.activeElement?.closest('[aria-hidden="true"]') ?? null).toBeNull();
  });
});

describe("the Solid time grid's annotation popover", () => {
  test("returns focus past a switch between marks", async () => {
    await render(() => <TimeGrid annotated />);
    const before = focusedButton();
    try {
      await clickMark("music");
      await clickMark("sleep");
      await until(() => expect(popover()?.textContent).toContain("Sleep"));
      await until(() => expect(popover()?.contains(document.activeElement)).toBe(true));
      await press("Escape");
      await until(() => expect(popover()).toBeNull());

      expect(document.activeElement).toBe(before);
    } finally {
      before.remove();
    }
  });

  test("leaves focus where an outside click put it", async () => {
    await render(() => <TimeGrid annotated />);
    const before = focusedButton();
    const field = document.body.appendChild(document.createElement("input"));
    field.setAttribute("aria-label", "Elsewhere");
    try {
      await clickMark("music");
      // Open, with focus inside, a frame after it mounts: only then is a click outside one.
      await until(() => expect(popover()?.contains(document.activeElement)).toBe(true));
      const popup = popover()!;
      await userEvent.click(field);
      await until(() => expect(popup.isConnected).toBe(false));

      expect(document.activeElement).toBe(field);
    } finally {
      before.remove();
      field.remove();
    }
  });

  test("a mark's tooltip follows the pointer up and down it", async () => {
    await render(() => <TimeGrid annotated />);
    const marks = [...grid().querySelectorAll<HTMLElement>('[data-slot="annotation-mark"]')];
    const tallest = marks.reduce((tallest, next) =>
      next.getBoundingClientRect().height > tallest.getBoundingClientRect().height ? next : tallest,
    );
    tallest.scrollIntoView({ block: "center" });
    const { height, width } = tallest.getBoundingClientRect();
    // Tall enough that its ends are far apart.
    expect(height).toBeGreaterThan(60);
    const tooltip = () =>
      document.querySelector<HTMLElement>('[data-slot="tooltip-content"][data-open]');
    const centre = () => {
      const box = tooltip()!.getBoundingClientRect();
      return box.y + box.height / 2;
    };

    await userEvent.hover(tallest, { position: { x: width / 2, y: 4 } });
    await until(() => expect(tooltip()).not.toBeNull());
    const near = tallest.getBoundingClientRect().y + 4;
    await until(() => expect(Math.abs(centre() - near)).toBeLessThan(12));

    await userEvent.hover(tallest, { position: { x: width / 2, y: height - 4 } });
    const far = tallest.getBoundingClientRect().bottom - 4;
    await until(() => expect(Math.abs(centre() - far)).toBeLessThan(12));
    // Beside the mark, at the inline end, wherever the pointer is.
    expect(tooltip()!.getBoundingClientRect().x).toBeGreaterThan(
      tallest.getBoundingClientRect().right,
    );
    await userEvent.unhover(tallest);
  });
});

describe.each(["ltr", "rtl"] as const)("the Solid time grid, %s", (dir) => {
  const px = (value: number) => Math.round(value) + 0;
  /** Inline distance from the end of `first` to the start of `second`, in reading order. */
  const gap = (first: DOMRect, second: DOMRect) =>
    px(dir === "ltr" ? second.left - first.right : first.left - second.right);
  /** How far `inner` sits from the inline-start and inline-end edges of `outer`. */
  const insets = ({ left, right }: DOMRect, outer: DOMRect) =>
    dir === "ltr"
      ? { end: px(outer.right - right), start: px(left - outer.left) }
      : { end: px(left - outer.left), start: px(outer.right - right) };

  test("hour gutter, day columns and event blocks follow the reading order", async () => {
    await render(() => <TimeGrid dir={dir} />);
    const box = (date: string) => column(date).getBoundingClientRect();
    const hourLabel = [...grid().querySelectorAll('[data-slot="time-grid-body"] span')].find(
      (label) => label.textContent === "9 AM",
    )!;

    expect(gap(hourLabel.getBoundingClientRect(), box("2026-10-05"))).toBe(8);
    expect(gap(box("2026-10-05"), box("2026-10-06"))).toBe(0);
    // Past the column's 1px divider, with a strip left free at the inline end for creating.
    expect(insets(chip("Design review").getBoundingClientRect(), box("2026-10-08")).start).toBe(1);
    // Overlapping events sit side by side from the inline start.
    expect(
      gap(chip("Design review").getBoundingClientRect(), chip("Planning").getBoundingClientRect()),
    ).toBe(0);
    const event = getComputedStyle(chip("Design review"));
    expect(dir === "rtl" ? event.borderRightWidth : event.borderLeftWidth).toBe("3px");
  });

  test("a multi-day all-day bar spans its days from the inline start", async () => {
    await render(() => <TimeGrid dir={dir} />);
    const cell = (date: string) =>
      grid()
        .querySelector(`[data-all-day][data-date="${date}"]`)!
        .closest('[role="gridcell"]')!
        .getBoundingClientRect();
    const bar = chip("Conference").getBoundingClientRect();

    // Past the cell's 1px divider and the bar's margin, and three days wide, less its margins.
    expect(insets(bar, cell("2026-10-05")).start).toBe(5);
    expect(insets(bar, cell("2026-10-07")).end).toBe(4);
  });
});

describe.each(["snapped", "free"] as const)("the Solid time grid's %s drag preview", (preview) => {
  test("drags an event to a later time on another day without re-rendering the grid", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <TimeGrid dragPreview={preview} onEventChange={onEventChange} />);
    await nowLine();
    const cells = [...grid().querySelectorAll('[role="gridcell"]')];
    const from = middle(chip("Pairing"));
    // Four hours later, on Friday: 10:00 becomes 14:00.
    const to: [number, number] = [middle(column("2026-10-09"))[0], below(from, 4)[1]];
    const watch = watchGrid();

    await dragTo(from, to);
    try {
      expect(grid().getAttribute("data-interaction")).toBe("move");
      const ghosts = [...document.querySelectorAll("[data-calendar-ghost]")].map((ghost) =>
        ghost.getAttribute("data-calendar-ghost"),
      );
      // A free drag's copy follows the pointer over a marker of where it lands; a snapped one's
      // range fills the slots it would land on.
      expect(ghosts.includes("landing")).toBe(preview === "free");
      expect(ghosts.length).toBeGreaterThan(0);
      expect([...watch.changed]).toEqual([]);
      expect([...grid().querySelectorAll('[role="gridcell"]')]).toEqual(cells);
    } finally {
      watch.stop();
      fire("pointerup", to);
    }

    await until(() =>
      expect(placed(onEventChange)).toBe("move 2026-10-09T14:00:00Z/2026-10-09T15:00:00Z"),
    );
    expect(onEventChange).toHaveBeenCalledTimes(1);
    await until(() => expect(document.querySelector("[data-calendar-ghost]")).toBeNull());
    expect(chip("Pairing").closest("[data-date]")?.getAttribute("data-date")).toBe("2026-10-09");
  });

  test("drags an event's end handle to make it longer", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <TimeGrid dragPreview={preview} onEventChange={onEventChange} />);
    await nowLine();
    const from = middle(chip("Pairing").querySelector('[data-resize="end"]')!);

    await dragTo(from, below(from, 1));
    expect(grid().getAttribute("data-interaction")).toBe("resize");
    fire("pointerup", below(from, 1));

    await until(() =>
      expect(placed(onEventChange)).toBe("resize-end 2026-10-08T10:00:00Z/2026-10-08T12:00:00Z"),
    );
  });

  test("drags across empty time to create an event, drawing its range while it moves", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <TimeGrid dragPreview={preview} onEventChange={onEventChange} />);
    await nowLine();
    const from = at("2026-10-05", "14:05");
    const to = at("2026-10-05", "15:20");

    await dragTo(from, to);
    expect(grid().getAttribute("data-interaction")).toBe("create");
    // The pointer layer draws the new event's range as a ghost, not as the keyboard's draft.
    expect(document.querySelector("[data-calendar-ghost]")).not.toBeNull();
    fire("pointerup", to);

    await until(() =>
      expect(placed(onEventChange)).toBe("create 2026-10-05T14:00:00Z/2026-10-05T15:30:00Z"),
    );
  });

  test("drags a timed event into the all-day row to make it all-day", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <TimeGrid dragPreview={preview} onEventChange={onEventChange} />);
    await nowLine();
    const box = allDayCell("2026-10-09").getBoundingClientRect();
    // Below Friday's first lane, where no event sits.
    const to: [number, number] = [box.left + box.width / 2, box.bottom - 4];

    await dragTo(middle(chip("Pairing")), to);
    fire("pointerup", to);

    await until(() => expect(placed(onEventChange)).toBe("move 2026-10-09/2026-10-10"));
  });

  test("Escape during a drag cancels it", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <TimeGrid dragPreview={preview} onEventChange={onEventChange} />);
    await nowLine();
    const from = middle(chip("Pairing"));

    await dragTo(from, below(from, 2));
    document.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
    );
    await settled();
    fire("pointerup", below(from, 2));
    await frame();

    expect(onEventChange).not.toHaveBeenCalled();
    await until(() => expect(document.querySelector("[data-calendar-ghost]")).toBeNull());
    expect(grid().hasAttribute("data-interaction")).toBe(false);
  });
});

describe("the Solid time grid's keyboard in a real browser", () => {
  test("Space grabs an event, arrows move it, Enter drops it, and focus stays on it", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <TimeGrid onEventChange={onEventChange} />);
    chip("Pairing").focus();

    await press(" ");
    expect(spoken()).toBe(
      "Picked up Pairing, Thursday, October 8, 10:00 – 11:00 AM. Use the arrow keys to move it, then Enter to drop it or Escape to cancel.",
    );
    // Four 15-minute steps down, then a day on.
    for (const key of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowRight"]) {
      await press(key);
    }
    expect(spoken()).toBe("Friday, October 9, 11:00 AM – 12:00 PM");
    await press("Enter");

    await until(() =>
      expect(placed(onEventChange)).toBe("move 2026-10-09T11:00:00Z/2026-10-09T12:00:00Z"),
    );
    await until(() =>
      expect(document.activeElement?.closest("[data-date]")?.getAttribute("data-date")).toBe(
        "2026-10-09",
      ),
    );
    expect(document.activeElement?.getAttribute("data-event-id")).toBe("Pairing");
    expect(spoken()).toBe("Moved Pairing to Friday, October 9, 11:00 AM – 12:00 PM.");
  });

  test("Shift+Space and arrows make an event longer", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <TimeGrid onEventChange={onEventChange} />);
    chip("Pairing").focus();

    await userEvent.keyboard("{Shift>} {/Shift}");
    await press("ArrowDown");
    await press("ArrowDown");
    await press("Enter");

    await until(() =>
      expect(placed(onEventChange)).toBe("resize-end 2026-10-08T10:00:00Z/2026-10-08T11:30:00Z"),
    );
  });

  test("Space on a slot drafts an event that Enter creates", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <TimeGrid onEventChange={onEventChange} />);
    grid().querySelector<HTMLElement>('[tabindex="0"]')!.focus();
    // From today's all-day cell to its first slot, scrolled into view.
    await press("ArrowDown");
    expect(document.activeElement?.getAttribute("aria-label")?.replace(/\s/g, " ")).toBe(
      "Thursday, October 8 at 12:00 AM",
    );

    await press(" ");
    expect(grid().querySelector('[data-slot="time-grid-draft"]')).not.toBeNull();
    await press("ArrowDown");
    await press("Enter");

    await until(() =>
      expect(placed(onEventChange)).toBe("create 2026-10-08T00:00:00Z/2026-10-08T01:15:00Z"),
    );
    expect(grid().querySelector('[data-slot="time-grid-draft"]')).toBeNull();
  });

  test("Escape cancels a grab and puts focus back on the event", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(() => <TimeGrid onEventChange={onEventChange} />);
    chip("Pairing").focus();
    await press(" ");
    await press("ArrowRight");
    await press("Escape");

    expect(onEventChange).not.toHaveBeenCalled();
    expect(document.activeElement?.getAttribute("data-event-id")).toBe("Pairing");
    expect(document.activeElement?.closest("[data-date]")?.getAttribute("data-date")).toBe(
      "2026-10-08",
    );
    expect(spoken()).toBe("Cancelled. Pairing is back where it was.");
  });

  test("grabbing an event closes its clipped title's tooltip", async () => {
    await render(() => <TimeGrid />);
    await userEvent.hover(chip(longTitle));
    await until(() =>
      expect(document.querySelector('[data-slot="tooltip-content"][data-open]')).not.toBeNull(),
    );
    chip(longTitle).focus();

    await press(" ");

    await until(() =>
      expect(document.querySelector('[data-slot="tooltip-content"][data-open]')).toBeNull(),
    );
    expect(chip(longTitle).hasAttribute("data-grabbed")).toBe(true);
  });
});

/** The pointer targets in view smaller than 24 × 24 px, and not spaced as WCAG 2.5.8 allows. */
function undersizedTargets(): string[] {
  const targets = [
    ...document.querySelectorAll<HTMLElement>("a[href], button, [role='button'], [data-event-id]"),
  ]
    .filter((element) => getComputedStyle(element).pointerEvents !== "none")
    .map((element) => ({ box: element.getBoundingClientRect(), element }))
    .filter(
      ({ box }) =>
        box.width > 0 &&
        box.bottom > 0 &&
        box.top < innerHeight &&
        box.right > 0 &&
        box.left < innerWidth,
    );
  // A timed event's box is its time span, which excuses its height but not its width.
  const spansTime = (element: HTMLElement) =>
    element.hasAttribute("data-event-id") &&
    element.closest("[data-date]:not([data-all-day])") !== null;
  const small = targets.filter(
    ({ box, element }) => box.width < 24 || (box.height < 24 && !spansTime(element)),
  );
  const centre = ({ box }: (typeof targets)[number]) =>
    [box.left + box.width / 2, box.top + box.height / 2] as const;
  const nested = (a: HTMLElement, b: HTMLElement) => a === b || a.contains(b) || b.contains(a);
  return small
    .filter((target) => {
      const [x, y] = centre(target);
      const reachesTarget = targets.some(
        ({ box, element }) =>
          !nested(element, target.element) &&
          Math.hypot(
            Math.max(box.left - x, 0, x - box.right),
            Math.max(box.top - y, 0, y - box.bottom),
          ) < 12,
      );
      const reachesCircle = small.some((other) => {
        if (nested(other.element, target.element)) return false;
        const [ox, oy] = centre(other);
        return Math.hypot(x - ox, y - oy) < 24;
      });
      return reachesTarget || reachesCircle;
    })
    .map(({ box, element }) => {
      const name = element.getAttribute("aria-label") ?? element.textContent ?? "";
      return `${name.trim().slice(0, 30)} ${Math.round(box.width)}×${Math.round(box.height)}`;
    });
}

// A phone's coarse pointer needs Chromium's touch emulation through CDP. The week isn't here:
// seven columns at 375 px are too narrow for its events, so phones get the 3-day view.
describe.runIf(server.browser === "chromium")(
  "the Solid time grid on a 375 px touch screen",
  () => {
    beforeAll(async () => {
      await page.viewport(375, 667);
      await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    });
    afterAll(async () => {
      await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await page.viewport(1280, 800);
    });

    test.each(["day", "3-day"] as const)(
      "the %s view's targets are 24 px, or spaced as WCAG 2.5.8 allows",
      async (view) => {
        await render(() => <TimeGrid view={view} />);
        await nowLine();

        expect(undersizedTargets()).toEqual([]);
      },
    );

    test("a long-press on the grid selects no text", async () => {
      await render(() => <TimeGrid view="3-day" />);

      expect(getComputedStyle(grid()).userSelect).toBe("none");
    });
  },
);

describe.runIf(server.browser === "chromium")("the Solid time grid with reduced motion", () => {
  beforeAll(async () => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
  });
  afterAll(async () => {
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  });

  test("a clipped title's tooltip fades in without zooming or sliding", async () => {
    expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    await render(() => <TimeGrid />);
    await userEvent.hover(chip(longTitle));
    await until(() =>
      expect(document.querySelector('[data-slot="tooltip-content"]')).not.toBeNull(),
    );
    const { scale, translate } = getComputedStyle(
      document.querySelector<HTMLElement>('[data-slot="tooltip-content"]')!,
    );

    // Only opacity moves on the way in.
    expect([scale, translate]).toEqual(["none", "none"]);
  });
});

import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarProposalDetail,
  type CalendarResource,
  type CalendarTransactionResult,
} from "@moltenship/calendar";
import {
  CalendarDndKit,
  calendarDropData,
  calendarEventOf,
  calendarEventType,
  type CalendarEventDragData,
} from "@moltenship/calendar-dnd-kit";
import { AutoScroller, Feedback, type DragDropManager } from "@dnd-kit/dom";
import {
  DragDropProvider,
  useDragDropManager,
  useDragDropMonitor,
  useDraggable,
  useDroppable,
} from "@dnd-kit/react";
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { commands, server, userEvent } from "vite-plus/test/browser";

import { createMonthView } from "@registry/month-view/month-view";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { createTimelineDayView } from "@registry/resource-timeline-view/resource-timeline-view";
import { createWeekView } from "@registry/time-grid-view/time-grid-view";
import { TooltipProvider } from "@registry/ui/tooltip";

import type { MouseStep } from "../mouse";
import { nextFrame, render, until } from "./render";

type Fixture = CalendarEvent<null, string, string>;
type Change = CalendarEventChange<Fixture, string, string>;
type Result = CalendarTransactionResult<Fixture, string, string>;

const Calendar = createCalendar<Fixture, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [
    createWeekView<Fixture>(),
    createMonthView<Fixture>(),
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
/** The record a task becomes when it's dropped; the drop decides where. */
const report: Fixture = {
  data: null,
  end: Temporal.Instant.from("2026-01-01T00:45:00Z"),
  id: "report",
  kind: "timed",
  resourceIds: [],
  start: Temporal.Instant.from("2026-01-01T00:00:00Z"),
  title: "Write report",
};
const resources: readonly CalendarResource<null>[] = [
  { data: null, id: "ada", title: "Ada" },
  { data: null, id: "grace", title: "Grace" },
];

/** The browser's own mouse, at a point in this page. */
const mouse = (step: MouseStep) =>
  (commands as unknown as { mouse(step: MouseStep): Promise<void> }).mouse(step);

// A test that fails mid-drag leaves the button down, which the next test's press would inherit.
afterEach(async () => {
  await mouse({ type: "up" });
});

/** A task in the sidebar that becomes the "Write report" event, 45 minutes long. */
function Task() {
  const { ref } = useDraggable({
    data: calendarDropData({ duration: { minutes: 45 }, event: report, title: "Write report" }),
    id: "task",
  });
  return (
    <button ref={ref} className="h-10 w-40 rounded border" data-testid="task" type="button">
      Write report
    </button>
  );
}

/** A drop zone of the app's that takes calendar events, as an "unscheduled" list does. */
function Bin({ onDrop }: { readonly onDrop: (drop: Dropped) => void }) {
  const { isDropTarget, ref } = useDroppable({ accept: calendarEventType, id: "bin" });
  useDragDropMonitor({
    onDragEnd: ({ canceled, operation }) =>
      onDrop({
        canceled,
        event: calendarEventOf(operation.source),
        target: operation.target?.id ?? null,
      }),
  });
  return (
    <div
      ref={ref}
      className="h-40 w-40 rounded border"
      data-over={isDropTarget || undefined}
      data-testid="bin"
    >
      Unscheduled
    </div>
  );
}

/**
 * A tray of the app's floating over the bottom of the week, which takes tasks: a droppable over a
 * view wins where it covers it.
 */
function Tray({ onDrop }: { readonly onDrop: (drop: Dropped) => void }) {
  const { ref } = useDroppable({ id: "tray" });
  useDragDropMonitor({
    onDragEnd: ({ canceled, operation }) => {
      if (operation.target?.id === "tray") onDrop({ canceled, event: null, target: "tray" });
    },
  });
  return (
    <div
      ref={ref}
      className="fixed right-4 bottom-4 z-50 h-32 w-64 rounded border bg-white"
      data-testid="tray"
    >
      Tray
    </div>
  );
}

/** A droppable of the app's around the whole page, which takes anything, as a layout's might. */
function Around({ children }: { readonly children: ReactNode }) {
  const { ref } = useDroppable({ id: "around" });
  return (
    <div ref={ref} className="h-dvh" data-testid="around">
      {children}
    </div>
  );
}

/** The provider's manager, for tests that look inside dnd-kit. */
let manager: DragDropManager | null = null;
function ManagerProbe() {
  manager = useDragDropManager();
  return null;
}

/** dnd-kit drags that started, of any draggable. */
let dndKitDrags = 0;
function DragCounter() {
  useDragDropMonitor({
    onDragStart: () => {
      dndKitDrags += 1;
    },
  });
  return null;
}

/** The app's own Feedback options, which the adapter must leave alone. */
const appFeedback = { dropAnimation: null };

interface Dropped {
  readonly canceled: boolean;
  readonly event: CalendarEventDragData | null;
  readonly target: string | number | null;
}

function Page({
  dir = "ltr",
  onDrop = () => {},
  onEventChange,
  onEventChangeResult,
  around = false,
  tray = false,
  view = "week",
}: {
  readonly around?: boolean;
  readonly dir?: "ltr" | "rtl";
  readonly onDrop?: (drop: Dropped) => void;
  readonly tray?: boolean;
  readonly onEventChange?: (change: Change) => void;
  readonly onEventChangeResult?: (result: Result, detail: CalendarProposalDetail) => void;
  readonly view?: View;
}) {
  return (
    <TooltipProvider>
      <DragDropProvider
        plugins={(defaults) => [
          ...defaults.filter((plugin) => plugin !== Feedback),
          Feedback.configure(appFeedback),
        ]}
      >
        <CalendarDndKit />
        <ManagerProbe />
        <DragCounter />
        {tray && <Tray onDrop={onDrop} />}
        <Calendar.Root
          defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
          defaultTimeZone="UTC"
          defaultView={view}
          direction={dir}
          events={[review]}
          locale="en-US"
          now={Temporal.Instant.from("2026-10-08T08:30:00Z")}
          onEventChange={onEventChange}
          onEventChangeResult={onEventChangeResult}
          resources={resources}
          weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
        >
          {(() => {
            const frame = (
              <Calendar.Frame className="flex h-dvh" dir={dir}>
                <aside className="flex w-48 shrink-0 flex-col gap-4 p-2">
                  <Task />
                  <Bin onDrop={onDrop} />
                </aside>
                <Calendar.Viewport className="min-h-0 min-w-0 flex-1">
                  <Calendar.ActiveView />
                </Calendar.Viewport>
              </Calendar.Frame>
            );
            return around ? <Around>{frame}</Around> : frame;
          })()}
        </Calendar.Root>
      </DragDropProvider>
    </TooltipProvider>
  );
}

const box = (selector: string) => {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`missing ${selector}`);
  return element.getBoundingClientRect();
};
const center = (rect: DOMRect) => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});
const ghosts = () => document.querySelectorAll("[data-calendar-ghost]");
const scroller = () => manager!.registry.plugins.get(AutoScroller)!;

/** Presses at `from`, moves past dnd-kit's activation distance, then on to `to`. */
async function pickUp(from: { readonly x: number; readonly y: number }) {
  await mouse({ type: "move", x: from.x, y: from.y });
  await mouse({ type: "down" });
  await mouse({ steps: 4, type: "move", x: from.x + 12, y: from.y + 6 });
}

async function moveTo(to: { readonly x: number; readonly y: number }) {
  await mouse({ steps: 12, type: "move", x: to.x, y: to.y });
  // Pointer moves land a frame or two later; dnd-kit applies them in a microtask.
  await act(async () => {
    await nextFrame();
    await nextFrame();
  });
}

async function drag(
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
) {
  await pickUp(from);
  await moveTo(to);
  await mouse({ type: "up" });
}

/** The time grid's body scrolled to put `hour` at its top, and a point `hours` in a day's column. */
function timeGrid(date: string, topHour = 8) {
  const body = document.querySelector<HTMLElement>('[data-slot="time-grid-body"]')!;
  const column = () => box(`[data-slot="time-grid-body"] [data-date="${date}"]`);
  body.scrollTop = (column().height * topHour) / 24;
  return {
    at: (hours: number) => {
      const rect = column();
      return { x: rect.left + rect.width / 2, y: rect.top + (rect.height * hours) / 24 };
    },
    body,
  };
}

function placed(onEventChange: ReturnType<typeof vi.fn<(change: Change) => void>>) {
  const change = onEventChange.mock.calls[0]?.[0];
  const proposed = change?.proposed;
  return change === undefined || proposed == null
    ? undefined
    : `${change.cause} ${proposed.start.toString()}/${proposed.end.toString()} ${proposed.resourceIds.join(",")}`.trim();
}

// Real mouse drags from an outside dnd-kit draggable: Chromium in `vp run a11y`, Firefox and
// WebKit in `vp run browsers`.
describe(`the dnd-kit adapter in ${server.browser}`, () => {
  test("a task dropped on a week's time slot becomes an event there", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Page onEventChange={onEventChange} />);
    const grid = timeGrid("2026-10-08");

    await pickUp(center(box('[data-testid="task"]')));
    await moveTo(grid.at(14.1));
    // The view previews the 45 minutes the task would take, from the slot under the pointer.
    await until(() => expect(ghosts()).toHaveLength(1));
    await mouse({ type: "up" });

    await until(() =>
      expect(placed(onEventChange)).toBe("create 2026-10-08T14:00:00Z/2026-10-08T14:45:00Z"),
    );
    expect(onEventChange.mock.calls[0]![0].event).toBe(report);
    expect(ghosts()).toHaveLength(0);
  });

  test("a task dropped on a month's day becomes an all-day event", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Page onEventChange={onEventChange} view="month" />);

    await drag(
      center(box('[data-testid="task"]')),
      center(box('[data-slot="month-view"] [data-date="2026-10-15"]')),
    );

    await until(() => expect(placed(onEventChange)).toBe("create 2026-10-15/2026-10-16"));
  });

  test("a task dropped in a resource's column books that resource", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Page onEventChange={onEventChange} view="resources" />);
    const body = document.querySelector<HTMLElement>('[data-slot="resource-columns-body"]')!;
    const column = () =>
      box(
        '[data-slot="resource-columns-body"] [data-resource-id="grace"] [data-date="2026-10-08"]',
      );
    body.scrollTop = (column().height * 8) / 24;
    const rect = column();

    await drag(center(box('[data-testid="task"]')), {
      x: rect.left + rect.width / 2,
      y: rect.top + (rect.height * 9.6) / 24,
    });

    await until(() =>
      expect(placed(onEventChange)).toBe("create 2026-10-08T09:30:00Z/2026-10-08T10:15:00Z grace"),
    );
  });

  test.each(["ltr", "rtl"] as const)(
    "a task dropped on a %s timeline row books that resource at the time under it",
    async (dir) => {
      const onEventChange = vi.fn<(change: Change) => void>();
      await render(<Page dir={dir} onEventChange={onEventChange} view="timeline-day" />);
      const viewport = document.querySelector<HTMLElement>(
        '[data-slot="resource-timeline-viewport"]',
      )!;
      const strip = () =>
        box('[data-resource-id="ada"] [data-axis="inline"][data-date="2026-10-08"]');
      const hour = strip().width / 24;
      // 08:00 at the view's inline start: negative in RTL, where scrolling runs to the left.
      viewport.scrollLeft = (dir === "rtl" ? -1 : 1) * hour * 8;
      await act(nextFrame);
      const rect = strip();
      // The middle of the 11:00 slot, 30 minutes wide.
      const offset = hour * 11.25;
      const x = dir === "rtl" ? rect.right - offset : rect.left + offset;

      await drag(center(box('[data-testid="task"]')), { x, y: rect.top + rect.height / 2 });

      await until(() =>
        expect(placed(onEventChange)).toBe("create 2026-10-08T11:00:00Z/2026-10-08T11:45:00Z ada"),
      );
    },
  );

  test("Escape cancels a drop in progress", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Page onEventChange={onEventChange} />);
    const grid = timeGrid("2026-10-08");

    await pickUp(center(box('[data-testid="task"]')));
    await moveTo(grid.at(12.1));
    await until(() => expect(ghosts()).toHaveLength(1));
    // Over the view, the view scrolls itself and dnd-kit's auto-scroller rests.
    expect(scroller().isDisabled()).toBe(true);
    await userEvent.keyboard("{Escape}");
    await until(() => expect(ghosts()).toHaveLength(0));
    await mouse({ type: "up" });

    await act(nextFrame);
    expect(onEventChange).not.toHaveBeenCalled();
    expect(scroller().isDisabled()).toBe(false);
  });

  test("a read-only calendar shows and proposes nothing", async () => {
    const onEventChangeResult = vi.fn<(result: Result) => void>();
    await render(<Page onEventChangeResult={onEventChangeResult} />);
    const grid = timeGrid("2026-10-08");

    await pickUp(center(box('[data-testid="task"]')));
    await moveTo(grid.at(12.1));
    // dnd-kit has the task, and the read-only view takes no part.
    await until(() => expect(document.querySelector("[data-dnd-dragging]")).not.toBeNull());
    expect(ghosts()).toHaveLength(0);
    await mouse({ type: "up" });

    await act(nextFrame);
    expect(onEventChangeResult).not.toHaveBeenCalled();
  });

  test("a task dropped on a droppable of the app's over the week goes to it", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    const onDrop = vi.fn<(drop: Dropped) => void>();
    await render(<Page onDrop={onDrop} onEventChange={onEventChange} tray />);
    const grid = timeGrid("2026-10-08");

    await pickUp(center(box('[data-testid="task"]')));
    await moveTo(grid.at(10.1));
    await until(() => expect(ghosts()).toHaveLength(1));
    await moveTo(center(box('[data-testid="tray"]')));
    // Where the tray covers the week, the week shows nothing.
    await until(() => expect(ghosts()).toHaveLength(0));
    await mouse({ type: "up" });

    await until(() =>
      expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ target: "tray" })),
    );
    await act(nextFrame);
    expect(onEventChange).not.toHaveBeenCalled();
  });

  test("a droppable of the app's around the calendar doesn't take a drop on it", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Page around onEventChange={onEventChange} />);
    const grid = timeGrid("2026-10-08");

    await drag(center(box('[data-testid="task"]')), grid.at(9.1));

    await until(() =>
      expect(placed(onEventChange)).toBe("create 2026-10-08T09:00:00Z/2026-10-08T09:45:00Z"),
    );
  });

  test("a move that stays in the view never reaches dnd-kit", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Page onEventChange={onEventChange} />);
    const grid = timeGrid("2026-10-08");
    const event = box('[data-slot="time-grid-body"] [data-event-id="review"]');
    dndKitDrags = 0;

    await drag(center(event), grid.at(12.55));

    await until(() =>
      expect(placed(onEventChange)).toBe("move 2026-10-08T12:00:00Z/2026-10-08T13:00:00Z ada"),
    );
    expect(dndKitDrags).toBe(0);
  });

  test("held near the bottom edge, the view scrolls and the drop lands further down", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Page onEventChange={onEventChange} />);
    const grid = timeGrid("2026-10-08", 0);
    const bottom = grid.body.getBoundingClientRect().bottom;
    const lastHourShown = Math.floor(
      ((bottom - box('[data-slot="time-grid-body"] [data-date="2026-10-08"]').top) /
        box('[data-slot="time-grid-body"] [data-date="2026-10-08"]').height) *
        24,
    );

    await pickUp(center(box('[data-testid="task"]')));
    await moveTo({ x: grid.at(0).x, y: bottom - 8 });
    await until(() => expect(grid.body.scrollTop).toBeGreaterThan(200));
    expect(scroller().isDisabled()).toBe(true);
    await mouse({ type: "up" });

    await until(() => expect(onEventChange).toHaveBeenCalledOnce());
    const start = onEventChange.mock.calls[0]![0].proposed!.start as Temporal.Instant;
    expect(start.toZonedDateTimeISO("UTC").hour).toBeGreaterThan(lastHourShown);
  });

  test("an event dragged out onto a droppable of the app's goes to it, not the calendar", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    const onDrop = vi.fn<(drop: Dropped) => void>();
    await render(<Page onDrop={onDrop} onEventChange={onEventChange} />);
    timeGrid("2026-10-08");
    const event = box('[data-slot="time-grid-body"] [data-event-id="review"]');
    const bin = center(box('[data-testid="bin"]'));

    await pickUp({ x: event.left + event.width / 2, y: event.top + 8 });
    await moveTo(bin);
    // The bin sees the drag, and a copy of the event follows the pointer there.
    await until(() =>
      expect(document.querySelector('[data-testid="bin"]')!.hasAttribute("data-over")).toBe(true),
    );
    expect(document.querySelectorAll("[data-calendar-ghost][data-outside]")).toHaveLength(1);
    await mouse({ type: "up" });

    await until(() =>
      expect(onDrop).toHaveBeenCalledWith({
        canceled: false,
        event: expect.objectContaining({ event: review, eventId: "review" }),
        target: "bin",
      }),
    );
    expect(onEventChange).not.toHaveBeenCalled();
    expect(ghosts()).toHaveLength(0);
    // The stand-in dnd-kit dragged is gone, and the app's own Feedback options are as it set them.
    await until(() => expect(document.querySelector("[data-calendar-drag-proxy]")).toBeNull());
    expect([...manager!.registry.draggables].filter((source) => calendarEventOf(source))).toEqual(
      [],
    );
    expect(manager!.registry.plugins.get(Feedback)!.options).toBe(appFeedback);
    expect(scroller().isDisabled()).toBe(false);
  });

  test("an event dragged out and back is moved by the calendar, and the drag ends cancelled", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    const onDrop = vi.fn<(drop: Dropped) => void>();
    await render(<Page onDrop={onDrop} onEventChange={onEventChange} />);
    const grid = timeGrid("2026-10-08");
    const event = box('[data-slot="time-grid-body"] [data-event-id="review"]');

    // Grabbed at 10:30, its middle, and dropped at 13:30: it moves three hours. It leaves level
    // with where it was grabbed, clear of the view's scrolling edges, and comes back in past them.
    const bin = center(box('[data-testid="bin"]'));
    await pickUp(center(event));
    await moveTo({ x: bin.x, y: center(event).y });
    await moveTo(bin);
    // Back down the sidebar, then across into the view level with where it lands.
    const target = grid.at(13.55);
    await moveTo({ x: bin.x, y: target.y });
    await moveTo(target);
    await mouse({ type: "up" });

    await until(() =>
      expect(placed(onEventChange)).toBe("move 2026-10-08T13:00:00Z/2026-10-08T14:00:00Z ada"),
    );
    expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ canceled: true }));
  });

  test("dnd-kit's keyboard sensor drops a task, proposing as the keyboard", async () => {
    const onEventChangeResult = vi.fn<(result: Result, detail: CalendarProposalDetail) => void>();
    await render(<Page onEventChange={() => {}} onEventChangeResult={onEventChangeResult} />);
    timeGrid("2026-10-08");
    const task = document.querySelector<HTMLElement>('[data-testid="task"]')!;
    const target = center(box('[data-slot="time-grid-body"] [data-date="2026-10-08"]'));
    const start = center(task.getBoundingClientRect());
    await act(async () => task.focus());

    await userEvent.keyboard(" ");
    // Shift moves five times as far: 50 px a press.
    const right = Math.ceil((target.x - start.x) / 50);
    const down = Math.ceil((target.y - start.y) / 50);
    for (let press = 0; press < right; press += 1) {
      await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");
    }
    for (let press = 0; press < down; press += 1) {
      await userEvent.keyboard("{Shift>}{ArrowDown}{/Shift}");
    }
    await until(() => expect(ghosts()).toHaveLength(1));
    await userEvent.keyboard(" ");

    await until(() => expect(onEventChangeResult).toHaveBeenCalledOnce());
    const [result, detail] = onEventChangeResult.mock.calls[0]!;
    expect(result.change?.cause).toBe("create");
    expect(detail).toEqual({ input: "keyboard" });
  });
});

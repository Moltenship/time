// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import {
  formatPlacementRange,
  type TimeGridColumn,
  type CalendarAnnouncer,
  type CalendarDraft,
  type CalendarEventInterval,
  type CalendarEventProposal,
  type CalendarInteractionUpdate,
  type CalendarTransactionResult,
} from "@moltenship/calendar-core";

import {
  attachCalendarPointer,
  observeCalendarRegions,
  startCalendarDrop,
  type CalendarDropSession,
  type CalendarPointerOptions,
  type CalendarRegion,
} from "../src/index";
import {
  ALL_DAY_HEIGHT,
  cellCenter,
  mountMonth,
  mountResourceColumns,
  mountTimeGrid,
  mountTimelineRows,
  place,
  timedEvent,
  timeZone,
  xAt,
  xAtTime,
  xIn,
  yAt,
  yInRow,
  type TestEvent,
} from "./dom-fixture";

type Options = CalendarPointerOptions<TestEvent, string | number, string>;
type Proposal = CalendarEventProposal<string | number, string, TestEvent>;
type Result = CalendarTransactionResult<TestEvent, string | number, string>;

const meeting = timedEvent("a", "2026-08-17T09:00Z", "2026-08-17T10:00Z", "Standup");
/** The record a dropped task becomes; its own times don't matter, the drop's placement does. */
const task = timedEvent("task-1", "2026-01-01T00:00Z", "2026-01-01T00:30Z", "Write report");
const formatRange = (placement: CalendarEventInterval) =>
  formatPlacementRange(placement, { locale: "en-US", timeZone });
/** Intl separates ranges and day periods with thin and narrow spaces. */
const plain = (text: string) => text.replace(/\s/gu, " ");

const detaches: (() => void)[] = [];
const drops: CalendarDropSession<TestEvent, string | number, string>[] = [];
afterEach(() => {
  for (const drop of drops.splice(0)) drop.cancel();
  for (const detach of detaches.splice(0)) detach();
  if (vi.isFakeTimers()) vi.useRealTimers();
});

function setup(
  mount: { readonly region: HTMLElement; readonly snapshot: Options["events"] },
  extra: Partial<Options> = {},
) {
  const proposals: [Proposal, unknown][] = [];
  const updates: CalendarInteractionUpdate[] = [];
  const drafts: (CalendarDraft<string | number, string> | null)[] = [];
  const announcer: CalendarAnnouncer = {
    announce: (update) => updates.push(update),
    formatRange,
  };
  detaches.push(
    attachCalendarPointer(mount.region, () => ({
      announcer,
      events: mount.snapshot,
      onPreview: (draft) => drafts.push(draft),
      onPropose: (proposal, detail) => {
        proposals.push([proposal, detail]);
      },
      timeZone,
      ...extra,
    })),
  );
  return { drafts, proposals, updates };
}

function start(...args: Parameters<typeof startCalendarDrop<TestEvent, string | number, string>>) {
  const drop = startCalendarDrop<TestEvent, string | number, string>(...args);
  drops.push(drop);
  return drop;
}

/** A scroll container 200×600 at the viewport's corner, which records how far it scrolled. */
function scrollable() {
  const element = document.createElement("div");
  element.getBoundingClientRect = () =>
    ({ bottom: 600, height: 600, left: 0, right: 200, top: 0, width: 200 }) as DOMRect;
  let scrollTop = 0;
  Object.defineProperty(element, "scrollTop", {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = Math.max(0, value);
    },
  });
  return { element, top: () => scrollTop };
}

function ghosts(region: HTMLElement) {
  return [...region.querySelectorAll<HTMLElement>("[data-calendar-ghost]")];
}

function interval(proposal: Proposal | undefined) {
  if (proposal === undefined || proposal.cause === "delete") return undefined;
  return `${proposal.proposed.kind} ${proposal.proposed.start.toString()}/${proposal.proposed.end.toString()}`;
}

/** Each update as `phase cause range`, with the range it would land on. */
function describeUpdate(update: CalendarInteractionUpdate): string {
  const range = update.proposed === null ? "nowhere" : formatRange(update.proposed);
  return plain(`${update.phase} ${update.cause} ${range}`);
}

describe("startCalendarDrop", () => {
  test("creates a timed event at the slot under the point, carrying the record", async () => {
    const grid = mountTimeGrid([meeting]);
    const { proposals } = setup(grid, { columns: grid.columns });
    const drop = start({ duration: { minutes: 45 }, event: task, title: "Write report" });

    drop.move({ x: xAt("2026-08-18"), y: yAt("13:20") });
    const [ghost] = ghosts(grid.region);
    expect(ghost!.getAttribute("data-calendar-ghost")).toBe("range");
    expect(ghost!.style.transform).toBe(`translate3d(100px, ${yAt("13:15")}px, 0)`);
    expect(Number.parseFloat(ghost!.style.height)).toBeCloseTo(30);
    expect(interval({ cause: "create", proposed: drop.placement! })).toBe(
      "timed 2026-08-18T13:15:00Z/2026-08-18T14:00:00Z",
    );

    await expect(drop.drop()).resolves.toBeNull();
    expect(proposals).toEqual([
      [{ cause: "create", event: task, proposed: expect.any(Object) }, { input: "pointer" }],
    ]);
    expect(interval(proposals[0]![0])).toBe("timed 2026-08-18T13:15:00Z/2026-08-18T14:00:00Z");
    expect(proposals[0]![0]).toMatchObject({ proposed: { resourceIds: [] } });
    expect(ghosts(grid.region)).toHaveLength(0);
  });

  test("lasts an hour by default and leaves out `event` without a record", async () => {
    const grid = mountTimeGrid([]);
    const { proposals } = setup(grid, { columns: grid.columns });
    const drop = start({});

    drop.move({ x: xAt("2026-08-17"), y: yAt("08:05") });
    await drop.drop();

    expect(proposals[0]![0]).toEqual({ cause: "create", proposed: expect.any(Object) });
    expect(interval(proposals[0]![0])).toBe("timed 2026-08-17T08:00:00Z/2026-08-17T09:00:00Z");
  });

  test("resolves with the transaction's result, and announces it", async () => {
    const grid = mountTimeGrid([]);
    const result: Result = {
      change: {
        cause: "create",
        event: task,
        eventId: null,
        id: "change-1",
        original: null,
        proposed: {
          end: Temporal.Instant.from("2026-08-17T11:00Z"),
          kind: "timed",
          resourceIds: [],
          start: Temporal.Instant.from("2026-08-17T10:00Z"),
        },
        warnings: ["resource-conflict"],
      },
      status: "committed",
    };
    const { updates } = setup(grid, {
      columns: grid.columns,
      onPropose: () => Promise.resolve(result),
    });
    const drop = start({ event: task, title: "Write report" });

    drop.move({ x: xAt("2026-08-17"), y: yAt("10:00") });
    await expect(drop.drop()).resolves.toBe(result);

    expect(updates.map(describeUpdate)).toEqual([
      "start create 10:00 – 11:00 AM",
      "commit create 10:00 – 11:00 AM",
    ]);
    expect(updates[1]).toMatchObject({
      input: "pointer",
      outside: { title: "Write report" },
      warnings: ["resource-conflict"],
    });
  });

  test("makes all-day events of `days` days on the all-day row and in a month", async () => {
    const grid = mountTimeGrid([]);
    const { proposals } = setup(grid, { columns: grid.columns });
    const onRow = start({ days: 2 });
    onRow.move({ x: xAt("2026-08-17"), y: ALL_DAY_HEIGHT / 2 });
    await onRow.drop();
    expect(interval(proposals[0]![0])).toBe("all-day 2026-08-17/2026-08-19");

    const month = mountMonth([]);
    const inMonth = setup(month);
    const drop = start({ duration: { minutes: 30 } });
    drop.move(cellCenter("2026-08-27"));
    expect(ghosts(month.region)).toHaveLength(1);
    await drop.drop();
    expect(interval(inMonth.proposals[0]![0])).toBe("all-day 2026-08-27/2026-08-28");
  });

  test("books the resource it's dropped in", async () => {
    const view = mountResourceColumns([]);
    const { drafts, proposals } = setup(view, { columns: view.columns });
    const drop = start({ duration: { minutes: 30 } });

    drop.move({ x: xIn("room-a"), y: yAt("09:00") });
    drop.move({ x: xIn("room-b"), y: yAt("09:10") });
    // The preview shows in the resource the point is over, and the draft follows it.
    expect(ghosts(view.region)).toHaveLength(1);
    expect(drafts.at(-1)).toMatchObject({ eventId: null, proposed: { resourceIds: ["room-b"] } });
    await drop.drop();

    expect(proposals[0]![0]).toMatchObject({ proposed: { resourceIds: ["room-b"] } });
    expect(interval(proposals[0]![0])).toBe("timed 2026-08-17T09:00:00Z/2026-08-17T09:30:00Z");
    expect(drafts.at(-1)).toBeNull();
  });

  test("measures a right-to-left timeline from the right", async () => {
    const timeline = mountTimelineRows([], { direction: "rtl" });
    const { proposals } = setup(timeline, { columns: timeline.columns });
    const drop = start({});

    drop.move({ x: xAtTime("14:10", "rtl"), y: yInRow("room-a") });
    await drop.drop();

    expect(interval(proposals[0]![0])).toBe("timed 2026-08-17T14:00:00Z/2026-08-17T15:00:00Z");
    expect(proposals[0]![0]).toMatchObject({ proposed: { resourceIds: ["room-a"] } });
  });

  test("moves an event the view shows when the source names it", async () => {
    const grid = mountTimeGrid([meeting]);
    const { proposals, updates } = setup(grid, { columns: grid.columns });
    const drop = start({ eventId: "a" });

    drop.move({ x: xAt("2026-08-18"), y: yAt("15:40") });
    await drop.drop();

    expect(proposals[0]![0]).toEqual({ cause: "move", eventId: "a", proposed: expect.any(Object) });
    expect(interval(proposals[0]![0])).toBe("timed 2026-08-18T15:30:00Z/2026-08-18T16:30:00Z");
    expect(updates[0]).toMatchObject({ cause: "move", event: { id: "a" }, phase: "start" });

    // An event the view doesn't have takes no drop there.
    const unknown = start({ eventId: "missing" });
    unknown.move({ x: xAt("2026-08-18"), y: yAt("15:40") });
    expect(unknown.placement).toBeNull();
    await expect(unknown.drop()).resolves.toBeNull();
    expect(proposals).toHaveLength(1);
  });

  test("takes no drop for a read-only event", async () => {
    const locked = timedEvent("l", "2026-08-17T09:00Z", "2026-08-17T10:00Z", "locked");
    const grid = mountTimeGrid([locked]);
    const { proposals } = setup(grid, { columns: grid.columns });
    const drop = start({ eventId: "l" });

    drop.move({ x: xAt("2026-08-18"), y: yAt("15:40") });
    expect(drop.placement).toBeNull();
    await expect(drop.drop()).resolves.toBeNull();
    expect(proposals).toHaveLength(0);
  });

  test("keeps telling the view that heard a move about its event after leaving it", () => {
    const grid = mountTimeGrid([meeting]);
    const { updates } = setup(grid, { columns: grid.columns });
    const drop = start({ eventId: "a" });

    drop.move({ x: xAt("2026-08-18"), y: yAt("15:40") });
    // A month that doesn't show the event takes the pointer from the grid.
    detaches.pop()!();
    const month = mountMonth([]);
    setup(month);
    drop.move(cellCenter("2026-08-20"));
    drop.cancel();

    expect(updates.map(({ phase }) => phase)).toEqual(["start", "step", "cancel"]);
    expect(updates.every((update) => update.cause === "move" && update.event?.id === "a")).toBe(
      true,
    );
    // One `original` for the whole drag, so messages can tell its steps apart.
    expect(updates[0]!.original).toBe(updates[2]!.original);
  });

  test("commits with the event and `original` the view heard at the start", async () => {
    const grid = mountTimeGrid([meeting]);
    const { updates } = setup(grid, { columns: grid.columns });
    const drop = start({ eventId: "a" });

    drop.move({ x: xAt("2026-08-18"), y: yAt("15:40") });
    drop.move(null);
    drop.move({ x: xAt("2026-08-18"), y: yAt("16:40") });
    await drop.drop();

    expect(updates.map(({ phase }) => phase)).toEqual(["start", "step", "step", "commit"]);
    expect(updates.every(({ original }) => original === updates[0]!.original)).toBe(true);
  });

  test("marks the preview the policies would reject", () => {
    const grid = mountTimeGrid([]);
    const check = vi.fn<NonNullable<Options["check"]>>((proposal) => ({
      change: {
        cause: "create",
        event: proposal.cause === "create" ? (proposal.event ?? null) : null,
        eventId: null,
        id: "check",
        original: null,
        proposed: {
          resourceIds: [],
          ...(proposal as { proposed: CalendarEventInterval }).proposed,
        },
      },
      reason: "outside-availability",
      status: "rejected",
    }));
    setup(grid, { check, columns: grid.columns });
    const drop = start({ event: task });

    drop.move({ x: xAt("2026-08-17"), y: yAt("10:00") });
    drop.move({ x: xAt("2026-08-17"), y: yAt("10:05") });

    // Once a placement: the second point is in the same slot.
    expect(check).toHaveBeenCalledOnce();
    expect(check.mock.calls[0]![0]).toMatchObject({ cause: "create", event: task });
    expect(ghosts(grid.region)[0]!.hasAttribute("data-invalid")).toBe(true);
  });

  test("cancels without proposing, and announces the cancel once a view heard it", () => {
    const grid = mountTimeGrid([]);
    const { drafts, proposals, updates } = setup(grid, { columns: grid.columns });
    const drop = start({ title: "Write report" });

    drop.move({ x: xAt("2026-08-17"), y: yAt("10:00") });
    drop.cancel();
    drop.cancel();

    expect(proposals).toHaveLength(0);
    expect(ghosts(grid.region)).toHaveLength(0);
    expect(drafts.at(-1)).toBeNull();
    expect(updates.map(({ phase }) => phase)).toEqual(["start", "cancel"]);
    expect(updates[1]).toMatchObject({ outside: { title: "Write report" } });

    // A drag that never reached a view says nothing.
    const elsewhere = start({});
    elsewhere.move({ x: 5000, y: 5000 });
    elsewhere.cancel();
    expect(updates).toHaveLength(2);
  });

  test("clears the preview off the view and over another library's drop zone", async () => {
    const grid = mountTimeGrid([]);
    const { proposals, updates } = setup(grid, { columns: grid.columns });
    const drop = start({});

    drop.move({ x: xAt("2026-08-17"), y: yAt("10:00") });
    drop.move(null);
    expect(ghosts(grid.region)).toHaveLength(0);
    expect(drop.placement).toBeNull();
    drop.move({ x: xAt("2026-08-17"), y: yAt("11:00") });
    drop.move({ x: 5000, y: 5000 });
    expect(ghosts(grid.region)).toHaveLength(0);

    await expect(drop.drop()).resolves.toBeNull();
    expect(proposals).toHaveLength(0);
    expect(updates.map(describeUpdate)).toEqual([
      "start create 10:00 – 11:00 AM",
      "step create nowhere",
      "step create 11:00 AM – 12:00 PM",
      "step create nowhere",
      "cancel create nowhere",
    ]);
  });

  test("leaves read-only views alone", async () => {
    const grid = mountTimeGrid([]);
    const { proposals, updates } = setup(grid, { columns: grid.columns, disabled: true });
    const drop = start({});

    drop.move({ x: xAt("2026-08-17"), y: yAt("10:00") });
    expect(ghosts(grid.region)).toHaveLength(0);
    await expect(drop.drop()).resolves.toBeNull();

    expect(proposals).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  test("passes a keyboard sensor's input on", async () => {
    const grid = mountTimeGrid([]);
    const { proposals, updates } = setup(grid, { columns: grid.columns });
    const drop = start({}, { input: "keyboard" });

    drop.move({ x: xAt("2026-08-17"), y: yAt("10:00") });
    await drop.drop();

    expect(proposals[0]![1]).toEqual({ input: "keyboard" });
    expect(updates.every(({ input }) => input === "keyboard")).toBe(true);
  });

  test("scrolls a view only over it, once the point has been clear of its edges", () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([]);
    const scroller = scrollable();
    const { updates } = setup(grid, {
      columns: grid.columns,
      scrollContainer: { current: scroller.element },
    });
    // The column moves up as the container scrolls, as a real one would.
    const column = grid.region.querySelector<HTMLElement>(
      '[data-date="2026-08-17"]:not([data-all-day])',
    )!;
    const { height, left, top, width } = column.getBoundingClientRect();
    column.getBoundingClientRect = () => {
      const shifted = top - scroller.top();
      return {
        bottom: shifted + height,
        height,
        left,
        right: left + width,
        top: shifted,
        width,
        x: left,
        y: shifted,
      } as DOMRect;
    };
    const drop = start({});
    const frames = (count: number) => {
      for (let frame = 0; frame < count; frame += 1) vi.advanceTimersToNextFrame();
    };

    // Beside the view, level with its bottom edge: a sidebar, which leaves the view still.
    drop.move({ x: 300, y: 590 });
    frames(2);
    expect(scroller.top()).toBe(0);
    // Coming in across the edge doesn't scroll either.
    drop.move({ x: 50, y: 590 });
    frames(2);
    expect(scroller.top()).toBe(0);

    drop.move({ x: 50, y: 300 });
    drop.move({ x: 50, y: 590 });
    const before = updates.length;
    frames(2);
    expect(scroller.top()).toBeGreaterThan(0);
    // The preview follows the time the view scrolled under the point, and says so.
    expect(updates.length).toBeGreaterThan(before);
    expect(updates.at(-1)).toMatchObject({ phase: "step" });

    drop.cancel();
    const settled = scroller.top();
    frames(1);
    expect(scroller.top()).toBe(settled);
  });

  test("scrolls a view a drag came into at an edge once it rests there", () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([]);
    const scroller = scrollable();
    setup(grid, { columns: grid.columns, scrollContainer: { current: scroller.element } });
    const drop = start({});

    drop.move({ x: 50, y: 590 });
    vi.advanceTimersToNextFrame();
    vi.advanceTimersToNextFrame();
    expect(scroller.top()).toBe(0);
    // A quarter of a second at the edge: the drag means it.
    for (let frame = 0; frame < 20; frame += 1) vi.advanceTimersToNextFrame();
    expect(scroller.top()).toBeGreaterThan(0);
  });

  test("scrolls a nested element sideways at the view's side edges", () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([]);
    const scroller = scrollable();
    const days = document.createElement("div");
    let scrollLeft = 100;
    Object.defineProperty(days, "scrollLeft", {
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = Math.max(0, value);
      },
    });
    setup(grid, {
      columns: grid.columns,
      scrollContainer: { current: scroller.element },
      sidewaysScrollContainer: { current: days },
    });
    const drop = start({});

    // Clear of the edges first, then resting at the right one.
    drop.move({ x: 100, y: 300 });
    drop.move({ x: 190, y: 300 });
    for (let frame = 0; frame < 20; frame += 1) vi.advanceTimersToNextFrame();
    expect(scrollLeft).toBeGreaterThan(100);
    expect(scroller.top()).toBe(0);
  });

  test("doesn't scroll while the point rests over a part of the view outside its scroller", () => {
    vi.useFakeTimers();
    const grid = mountTimeGrid([]);
    const scroller = scrollable();
    // The scroller starts below the all-day row, which the point rests on.
    scroller.element.getBoundingClientRect = () =>
      ({ bottom: 600, height: 560, left: 0, right: 200, top: 40, width: 200 }) as DOMRect;
    scroller.element.scrollTop = 200;
    setup(grid, { columns: grid.columns, scrollContainer: { current: scroller.element } });
    const drop = start({});

    drop.move({ x: 50, y: 20 });
    for (let frame = 0; frame < 30; frame += 1) vi.advanceTimersToNextFrame();
    expect(scroller.top()).toBe(200);
  });

  test("picks up the columns a scrolling view renders mid-drag", async () => {
    const grid = mountTimeGrid([]);
    let columns: readonly TimeGridColumn[] = grid.columns.slice(0, 1);
    const { proposals } = setup(grid, { columns: undefined });
    detaches.pop()!();
    detaches.push(
      attachCalendarPointer(grid.region, () => ({
        columns,
        events: grid.snapshot,
        onPropose: (proposal, detail) => {
          proposals.push([proposal, detail]);
        },
        timeZone,
      })),
    );
    const drop = start({});

    // The second date isn't a time column yet, so it reads as a day cell.
    drop.move({ x: xAt("2026-08-18"), y: yAt("10:00") });
    expect(drop.placement?.kind).toBe("all-day");
    columns = grid.columns;
    drop.move({ x: xAt("2026-08-18"), y: yAt("10:05") });
    await drop.drop();

    expect(interval(proposals[0]![0])).toBe("timed 2026-08-18T10:00:00Z/2026-08-18T11:00:00Z");
  });

  test("hides a view under anything layered over it", () => {
    const grid = mountTimeGrid([]);
    setup(grid, { columns: grid.columns });
    const sheet = place(
      document.createElement("div"),
      { height: 400, left: 0, top: 0, width: 100 },
      0,
    );
    document.body.append(sheet);
    const drop = start({});

    drop.move({ x: xAt("2026-08-17"), y: yAt("02:00") });
    expect(drop.placement).toBeNull();
    expect(ghosts(grid.region)).toHaveLength(0);
    drop.move({ x: xAt("2026-08-18"), y: yAt("02:00") });
    expect(drop.placement).not.toBeNull();
  });

  test("proposes nothing in a view that went read-only since the last move", async () => {
    const grid = mountTimeGrid([]);
    let disabled = false;
    const { proposals, updates } = setup(grid, { columns: grid.columns });
    detaches.pop()!();
    detaches.push(
      attachCalendarPointer(grid.region, () => ({
        announcer: { announce: (update) => updates.push(update), formatRange },
        columns: grid.columns,
        disabled,
        events: grid.snapshot,
        onPropose: (proposal, detail) => {
          proposals.push([proposal, detail]);
        },
        timeZone,
      })),
    );
    const drop = start({});

    drop.move({ x: xAt("2026-08-17"), y: yAt("10:00") });
    disabled = true;
    await expect(drop.drop()).resolves.toBeNull();

    expect(proposals).toHaveLength(0);
    expect(updates.map(({ phase }) => phase)).toEqual(["start", "cancel"]);
    expect(drop.placement).toBeNull();
  });

  test("moves from one view to another", async () => {
    const first = mountTimeGrid([]);
    const one = setup(first, { columns: first.columns });
    const drop = start({});
    drop.move({ x: xAt("2026-08-17"), y: yAt("10:00") });
    expect(ghosts(first.region)).toHaveLength(1);

    // A second calendar replaces the first on the page, as when the app switches views.
    const second = mountMonth([]);
    const two = setup(second);
    drop.move(cellCenter("2026-08-20"));
    expect(ghosts(first.region)).toHaveLength(0);
    expect(ghosts(second.region)).toHaveLength(1);
    await drop.drop();

    expect(one.proposals).toHaveLength(0);
    expect(interval(two.proposals[0]![0])).toBe("all-day 2026-08-20/2026-08-21");
    expect(one.drafts.at(-1)).toBeNull();
    // The first view heard the drag leave it; the second heard it from its start.
    expect(one.updates.map(describeUpdate)).toEqual([
      "start create 10:00 – 11:00 AM",
      "step create nowhere",
    ]);
    expect(two.updates.map(({ phase }) => phase)).toEqual(["start", "commit"]);
  });

  test("refuses a length that isn't positive", () => {
    expect(() => startCalendarDrop({ duration: { minutes: 0 } })).toThrow(
      "calendar-drop-duration-must-be-positive",
    );
    expect(() => startCalendarDrop({ days: 1.5 })).toThrow(
      "calendar-drop-days-must-be-a-positive-integer",
    );
  });
});

describe("observeCalendarRegions", () => {
  test("hears views attach and detach, and whether they take drops", () => {
    const grid = mountTimeGrid([]);
    const heard: (readonly CalendarRegion[])[] = [];
    const stop = observeCalendarRegions((regions) => heard.push(regions));
    expect(heard).toEqual([[]]);

    setup(grid, { disabled: true });
    expect(heard.at(-1)).toEqual([{ disabled: true, element: grid.region }]);
    detaches.pop()!();
    expect(heard.at(-1)).toEqual([]);

    stop();
    setup(grid);
    expect(heard).toHaveLength(3);
  });
});

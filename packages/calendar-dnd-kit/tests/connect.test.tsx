// @vitest-environment jsdom
// First, so dnd-kit finds the ResizeObserver it reads as it loads.
import "./resize-observer";

import { DragDropManager, Draggable } from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { createCanonicalEventAdapter, createEventSnapshot } from "@moltenship/calendar-core";
import { attachCalendarPointer } from "@moltenship/calendar-dnd";
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test } from "vite-plus/test";

import {
  CalendarDndKit,
  calendarDropData,
  calendarDropOf,
  calendarEventOf,
  calendarEventType,
  connectCalendarDragDrop,
  isCalendarTarget,
} from "../src/index";

const snapshot = createEventSnapshot([], createCanonicalEventAdapter<null, string, string>());
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  document.body.replaceChildren();
});

/** A view region attached to the pointer layer, as `useCalendarPointer` attaches one. */
function view({ disabled = false } = {}) {
  const element = document.createElement("div");
  document.body.append(element);
  const detach = attachCalendarPointer(element, () => ({
    disabled,
    events: snapshot,
    onPropose: () => undefined,
    timeZone: "UTC",
  }));
  cleanups.push(detach);
  return { detach, element };
}

/** The manager's droppables, once its registrations have settled. */
async function droppables(manager: DragDropManager) {
  await Promise.resolve();
  return [...manager.registry.droppables].map(({ disabled, element }) => ({ disabled, element }));
}

describe("calendar data", () => {
  test("marks a draggable as an item the calendar takes, beside the app's own data", () => {
    const source = { duration: { minutes: 30 }, event: { title: "Write report" }, title: "Write" };
    const data = { task: "t1", ...calendarDropData(source) };

    expect(calendarDropOf({ data })).toBe(source);
    expect(calendarDropOf({ data: { task: "t1" } })).toBeNull();
    expect(calendarDropOf(null)).toBeNull();
    expect(calendarEventOf({ data })).toBeNull();
  });
});

describe("connectCalendarDragDrop", () => {
  test("makes each view a droppable, disabled while it's read-only", async () => {
    const manager = new DragDropManager();
    const editable = view();
    const readOnly = view({ disabled: true });
    cleanups.push(connectCalendarDragDrop(manager));

    expect(await droppables(manager)).toEqual([
      { disabled: false, element: editable.element },
      { disabled: true, element: readOnly.element },
    ]);
    // Their IDs are opaque, and kept apart from the app's.
    const [first] = manager.registry.droppables;
    expect(first!.id).toMatch(/^@moltenship\/calendar-view:\d+$/);
    expect(isCalendarTarget(first)).toBe(true);
  });

  test("shares one connection between every call for a manager", async () => {
    const manager = new DragDropManager();
    view();
    const first = connectCalendarDragDrop(manager);
    const second = connectCalendarDragDrop(manager);
    expect(await droppables(manager)).toHaveLength(1);

    first();
    first();
    expect(await droppables(manager)).toHaveLength(1);
    second();
    expect(await droppables(manager)).toEqual([]);
  });

  test("follows views that attach and detach, and lets go of them all when disconnected", async () => {
    const manager = new DragDropManager();
    const disconnect = connectCalendarDragDrop(manager);
    expect(await droppables(manager)).toEqual([]);

    const first = view();
    expect(await droppables(manager)).toHaveLength(1);
    first.detach();
    expect(await droppables(manager)).toEqual([]);

    view();
    disconnect();
    expect(await droppables(manager)).toEqual([]);
  });

  test("a view takes calendar items and events, and nothing else", async () => {
    const manager = new DragDropManager();
    view();
    cleanups.push(connectCalendarDragDrop(manager));
    await droppables(manager);
    const [droppable] = manager.registry.droppables;
    if (droppable === undefined) throw new Error("no view droppable");
    const draggable = (id: string, data: Record<string, unknown>, type?: string) =>
      new Draggable({ data, id, register: false, type }, manager);

    expect(droppable.accepts(draggable("task", calendarDropData({})))).toBe(true);
    expect(droppable.accepts(draggable("other", { task: "t1" }))).toBe(false);
    expect(
      droppable.accepts(
        draggable(
          "event",
          { "@moltenship/calendar-event": { event: null, eventId: "a" } },
          calendarEventType,
        ),
      ),
    ).toBe(true);
  });
});

describe("CalendarDndKit", () => {
  test("renders nothing on the server", () => {
    expect(
      renderToString(
        <DragDropProvider>
          <CalendarDndKit />
        </DragDropProvider>,
      ),
    ).not.toContain("calendar");
  });

  test("connects once under StrictMode, which mounts its effects twice", async () => {
    const manager = new DragDropManager();
    view();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <StrictMode>
          <DragDropProvider manager={manager}>
            <CalendarDndKit />
            <CalendarDndKit />
          </DragDropProvider>
        </StrictMode>,
      ),
    );
    expect(await droppables(manager)).toHaveLength(1);

    await act(async () => root.unmount());
    expect(await droppables(manager)).toEqual([]);
  });

  test("connects the provider's manager while it's mounted", async () => {
    const manager = new DragDropManager();
    view();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <DragDropProvider manager={manager}>
          <CalendarDndKit />
        </DragDropProvider>,
      ),
    );
    expect(await droppables(manager)).toHaveLength(1);

    await act(async () => root.unmount());
    expect(await droppables(manager)).toEqual([]);
  });
});

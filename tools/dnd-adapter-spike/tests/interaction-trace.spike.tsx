import {
  Draggable as DndDraggable,
  type DragDropManager as DndDragDropManager,
} from "@dnd-kit/dom";
import { useDragDropManager } from "@dnd-kit/react";
import { Profiler, act, useEffect, type ProfilerOnRenderCallback, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import {
  CalendarDragOverlay,
  CalendarDragProvider,
  CalendarDraggable,
  CalendarViewRegion,
  type CalendarDragMessages,
  type CalendarEventChange,
} from "../src/index";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

interface TestEvent {
  readonly id: string;
  readonly revision: number;
}

const geometry = {
  startMinute: 0,
  endMinute: 1_440,
  snapMinutes: 30,
  resources: ["alpha", "beta"],
} as const;

const placement = {
  startMinute: 60,
  endMinute: 120,
  resourceId: "alpha" as const,
};

const messages: CalendarDragMessages<TestEvent, string> = {
  instructions: "Use the arrow keys to move the event.",
  started: ({ source }) => `Started ${source.title}`,
  moved: ({ source, change }) =>
    `Moved ${source.title} to minute ${change?.proposed.startMinute ?? source.placement.startMinute} in ${String(change?.proposed.resourceId ?? source.placement.resourceId)}`,
  completed: ({ source }) => `Committed ${source.title}`,
  canceled: ({ source }) => `Canceled ${source.title}`,
};

const untransformedProperties = new Set(["scale", "transform", "translate"]);

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const getComputedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    // Happy DOM's declaration is a proxy that rejects defineProperty, so wrap it instead.
    return new Proxy(getComputedStyle(element), {
      get(styles, property) {
        const value: unknown = Reflect.get(styles, property, styles);
        if (typeof value === "function") return value.bind(styles);
        if (typeof property === "string" && untransformedProperties.has(property) && !value) {
          return "none";
        }
        return value;
      },
    });
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 400,
    bottom: 1_440,
    width: 400,
    height: 1_440,
    toJSON: () => ({}),
  }));
  vi.spyOn(HTMLElement.prototype, "scrollBy").mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value: () => ({ finished: Promise.resolve() }),
  });
  Object.defineProperty(document, "getAnimations", {
    configurable: true,
    value: () => [],
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

function ManagerProbe({
  onManager,
}: {
  readonly onManager: (manager: DndDragDropManager) => void;
}) {
  const manager = useDragDropManager();
  useEffect(() => {
    if (manager) onManager(manager);
  }, [manager, onManager]);
  return null;
}

function Harness({
  onChange,
  onCommit,
  onManager,
}: {
  readonly onChange: (change: CalendarEventChange<TestEvent, string>) => void;
  readonly onCommit: ProfilerOnRenderCallback;
  readonly onManager: (manager: DndDragDropManager) => void;
}): ReactNode {
  return (
    <CalendarDragProvider<TestEvent, string> messages={messages} onEventChange={onChange}>
      <ManagerProbe onManager={onManager} />
      <Profiler id="calendar-view" onRender={onCommit}>
        <CalendarViewRegion id="week-region" geometry={geometry}>
          <CalendarDraggable<TestEvent, string>
            eventId="event-1"
            title="Planning"
            event={{ id: "event-1", revision: 7 }}
            placement={placement}
            sourceView="week"
          >
            {({ ref, handleRef }) => (
              <button
                ref={(element) => {
                  ref(element);
                  handleRef(element);
                }}
                type="button"
              >
                Planning
              </button>
            )}
          </CalendarDraggable>
        </CalendarViewRegion>
      </Profiler>
      <CalendarDragOverlay<TestEvent, string>>
        {({ source }) => <span>{source.title}</span>}
      </CalendarDragOverlay>
    </CalendarDragProvider>
  );
}

async function renderHarness(
  onChange: (change: CalendarEventChange<TestEvent, string>) => void,
  onCommit: ProfilerOnRenderCallback,
): Promise<DndDragDropManager> {
  let manager: DndDragDropManager | null = null;
  await act(async () => {
    root?.render(
      <Harness
        onChange={onChange}
        onCommit={onCommit}
        onManager={(value) => {
          manager = value;
        }}
      />,
    );
    await Promise.resolve();
  });
  if (!manager) throw new Error("dnd-kit manager was not registered");
  return manager;
}

function pointerEvent(type: string, x: number, y: number, pointerType = "mouse"): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
    isPrimary: true,
    pointerId: 1,
    pointerType,
  });
}

async function start(
  manager: DndDragDropManager,
  event: PointerEvent | KeyboardEvent,
): Promise<void> {
  await act(async () => {
    manager.actions.start({ source: "event-1", coordinates: { x: 50, y: 60 }, event });
    await Promise.resolve();
  });
  expect(manager.dragOperation.status.dragging).toBe(true);
}

async function settleStoppedDrag(manager: DndDragDropManager): Promise<void> {
  for (let pass = 0; pass < 10 && !manager.dragOperation.status.idle; pass += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  expect(manager.dragOperation.status.idle).toBe(true);
}

async function settleStartedDrag(manager: DndDragDropManager): Promise<void> {
  for (let pass = 0; pass < 10 && !manager.dragOperation.status.dragging; pass += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  expect(manager.dragOperation.status.dragging).toBe(true);
}

async function flushAnimationFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

function p95(samples: readonly number[]): number {
  const sorted = samples.toSorted((left, right) => left - right);
  return sorted[Math.floor(sorted.length * 0.95)] ?? 0;
}

test("configured sensors retain pointer-down movement and announce the current placement", async () => {
  const changes: CalendarEventChange<TestEvent, string>[] = [];
  const manager = await renderHarness(
    (change) => changes.push(change),
    () => {},
  );
  const button = document.querySelector("button");
  if (!(button instanceof HTMLButtonElement)) throw new Error("draggable button was not rendered");

  await act(async () => {
    button.dispatchEvent(pointerEvent("pointerdown", 50, 60));
    document.dispatchEvent(pointerEvent("pointermove", 50, 95));
    await Promise.resolve();
  });
  await settleStartedDrag(manager);

  await act(async () => {
    document.dispatchEvent(pointerEvent("pointermove", 50, 96));
    await Promise.resolve();
  });
  await flushAnimationFrame();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 550));
  });
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    "Moved Planning to minute 90 in alpha",
  );

  await act(async () => {
    document.dispatchEvent(pointerEvent("pointerup", 50, 96));
    await Promise.resolve();
  });
  await settleStoppedDrag(manager);
  expect(changes.at(-1)?.proposed).toEqual({
    startMinute: 90,
    endMinute: 150,
    resourceId: "alpha",
  });

  await act(async () => {
    button.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "Space" }));
    await Promise.resolve();
  });
  await settleStartedDrag(manager);
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "ArrowDown" }));
    await Promise.resolve();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 550));
  });
  expect(document.querySelector('[role="status"]')?.textContent).toBe(
    "Moved Planning to minute 90 in alpha",
  );

  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "Enter" }));
    await Promise.resolve();
  });
  await settleStoppedDrag(manager);
  expect(changes.at(-1)?.proposed).toEqual({
    startMinute: 90,
    endMinute: 150,
    resourceId: "alpha",
  });
});

test("pointer/touch/keyboard share proposals with zero calendar commits on pointer move", async () => {
  const changes: CalendarEventChange<TestEvent, string>[] = [];
  let commits = 0;
  const manager = await renderHarness(
    (change) => changes.push(change),
    () => {
      commits += 1;
    },
  );

  expect([...manager.registry.droppables]).toHaveLength(1);
  expect(manager.sensors).toHaveLength(2);
  expect(manager.modifiers).toHaveLength(1);
  // Four dnd-kit core plugins (collision notifier, scroll listener, scroller, style injector)
  // plus the adapter's four configured plugins.
  expect(manager.plugins).toHaveLength(8);
  expect(document.body.textContent).toContain(messages.instructions);

  await start(manager, pointerEvent("pointerdown", 50, 60));
  await flushAnimationFrame();
  expect(document.querySelector('[role="status"]')?.textContent).toBe("Started Planning");
  expect(document.querySelector("[data-calendar-drag-overlay]")).not.toBeNull();
  commits = 0;
  const samples: number[] = [];

  await act(async () => {
    for (let move = 1; move <= 240; move += 1) {
      const y = 60 + (30 * move) / 240;
      const started = performance.now();
      manager.actions.move({
        to: { x: 50, y },
        event: pointerEvent("pointermove", 50, y),
      });
      samples.push(performance.now() - started);
    }
    await Promise.resolve();
  });

  expect(commits).toBe(0);
  expect(changes).toHaveLength(0);
  await act(async () => {
    manager.actions.stop({ event: pointerEvent("pointerup", 50, 90) });
    await Promise.resolve();
  });
  await settleStoppedDrag(manager);
  const pointerChange = changes.at(-1);
  expect(pointerChange?.proposed).toEqual({
    startMinute: 90,
    endMinute: 150,
    resourceId: "alpha",
  });

  await start(manager, pointerEvent("pointerdown", 50, 60, "touch"));
  await act(async () => {
    manager.actions.move({
      to: { x: 50, y: 90 },
      event: pointerEvent("pointermove", 50, 90, "touch"),
    });
    await Promise.resolve();
    manager.actions.stop({ event: pointerEvent("pointerup", 50, 90, "touch") });
    await Promise.resolve();
  });
  await settleStoppedDrag(manager);
  const touchChange = changes.at(-1);

  await start(manager, new KeyboardEvent("keydown", { code: "Space" }));
  await act(async () => {
    manager.actions.move({
      by: { x: 0, y: 1 },
      event: new KeyboardEvent("keydown", { code: "ArrowDown" }),
    });
    await Promise.resolve();
    manager.actions.stop({ event: new KeyboardEvent("keydown", { code: "Enter" }) });
    await Promise.resolve();
  });
  await settleStoppedDrag(manager);
  const keyboardChange = changes.at(-1);

  expect(touchChange?.proposed).toEqual(pointerChange?.proposed);
  expect(keyboardChange?.proposed).toEqual(pointerChange?.proposed);
  expect(pointerChange?.cause).toBe("move");
  expect(touchChange?.input).toBe("touch");
  expect(keyboardChange?.cause).toBe("keyboard");

  console.log(
    `INTERACTION_TRACE ${JSON.stringify({
      pointerMoves: samples.length,
      calendarReactCommits: commits,
      pointerScriptingP95Ms: Number(p95(samples).toFixed(4)),
      proposalsEquivalent: true,
      droppableSurfaces: [...manager.registry.droppables].length,
      sensors: manager.sensors.length,
      announcements: document.querySelector('[role="status"]') !== null,
    })}`,
  );
});

test("dnd-kit source fallback bridges reparent and cancel/unmount emits no proposal", async () => {
  const changes: CalendarEventChange<TestEvent, string>[] = [];
  const manager = await renderHarness(
    (change) => changes.push(change),
    () => {},
  );

  await start(manager, pointerEvent("pointerdown", 50, 60));
  const previousSource = manager.dragOperation.source;
  if (!previousSource?.data) throw new Error("active dnd-kit source data is missing");
  await act(async () => {
    previousSource.unregister();
    await Promise.resolve();
  });
  expect(manager.dragOperation.source).toBe(previousSource);

  const replacementElement = document.createElement("button");
  const replacement = new DndDraggable(
    {
      id: "event-1",
      element: replacementElement,
      data: previousSource.data,
    },
    manager,
  );
  await act(async () => {
    replacement.register();
    await Promise.resolve();
  });
  expect(manager.dragOperation.source).toBe(replacement);

  await act(async () => {
    manager.actions.move({
      to: { x: 50, y: 90 },
      event: pointerEvent("pointermove", 50, 90),
    });
    await Promise.resolve();
    manager.actions.stop({ canceled: true });
    await Promise.resolve();
  });
  await settleStoppedDrag(manager);

  expect(changes).toHaveLength(0);
  expect(document.querySelector("[data-calendar-drag-overlay]")).toBeNull();
  await act(async () => {
    replacement.unregister();
    previousSource.register();
    await Promise.resolve();
  });

  await start(manager, pointerEvent("pointerdown", 50, 60));
  await act(async () => root?.unmount());
  root = null;
  expect(manager.dragOperation.canceled).toBe(true);
  expect([...manager.registry.draggables]).toHaveLength(0);
  expect([...manager.registry.droppables]).toHaveLength(0);
  expect(changes).toHaveLength(0);
});

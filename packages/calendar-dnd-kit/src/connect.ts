import { AutoScroller, Draggable, Droppable, Feedback, type DragDropManager } from "@dnd-kit/dom";
import { eventPlacement } from "@moltenship/calendar-core";
import {
  monitorCalendarDrags,
  observeCalendarRegions,
  startCalendarDrop,
  type CalendarDragFollower,
  type CalendarDropSession,
  type CalendarEventDrag,
  type CalendarPoint,
} from "@moltenship/calendar-dnd";

import {
  calendarDropOf,
  calendarEventData,
  calendarEventOf,
  calendarEventType,
  calendarViewData,
  isCalendarTarget,
} from "./data";

/** The most of a long or wide event the drag's stand-in covers, as the calendar's copy does. */
const PROXY_MAXIMUM = { height: 120, width: 320 } as const;
/** The stand-in moves with the pointer and is dropped where it is, without an animation back. */
const proxyFeedback = [Feedback.configure({ dropAnimation: null, feedback: "move" })];

/**
 * dnd-kit's `CollisionPriority.Highest`, which a view claims only where it's the topmost thing
 * under the pointer: there it wins over a droppable of the app's around or under it, and a
 * droppable of the app's over it wins, since the view isn't topmost there.
 */
const VIEW_PRIORITY = 4;
/** dnd-kit's `CollisionType.PointerIntersection`. */
const POINTER_INTERSECTION = 2;

/** Opaque IDs for the entities the adapter registers, unique on the page. */
let entities = 0;
const nextId = (kind: "event" | "view") => `@moltenship/calendar-${kind}:${(entities += 1)}`;

/** One connection per manager, shared by every `connectCalendarDragDrop` call for it. */
const connections = new WeakMap<
  DragDropManager,
  { count: number; readonly disconnect: () => void }
>();

/** Reports an error without breaking dnd-kit's dispatch to its other listeners. */
function report(error: unknown): void {
  if (typeof reportError === "function") reportError(error);
  else console.error(error);
}

/** Whether `element` holds the topmost thing at a point that the pointer can hit. */
function topmostIn(element: Element, { x, y }: CalendarPoint): boolean {
  const [top] = document.elementsFromPoint(x, y);
  return top !== undefined && element.contains(top);
}

/** Whether a drag started from the keyboard, in any realm. */
function fromKeyboard(event: Event | null): boolean {
  return event?.type.startsWith("key") === true;
}

/**
 * An invisible stand-in for a calendar event while dnd-kit follows its drag: dnd-kit measures the
 * drag's shape, which collision detection needs, from its source's element, and moves that element
 * with the pointer. The calendar's own element stays where React put it, and the calendar shows
 * its own copy under the pointer. The stand-in has the event's size, clipped as that copy is, sits
 * under the pointer as the event was grabbed, and hides from assistive technology: dnd-kit only
 * adds the attributes it finds missing.
 */
function standIn(drag: CalendarEventDrag, grabbed: DOMRect, point: CalendarPoint): HTMLElement {
  const width = Math.min(grabbed.width, PROXY_MAXIMUM.width);
  const height = Math.min(grabbed.height, PROXY_MAXIMUM.height);
  const offset = {
    x: Math.min(Math.max(drag.origin.x - grabbed.left, 0), width),
    y: Math.min(Math.max(drag.origin.y - grabbed.top, 0), height),
  };
  const proxy = document.createElement("div");
  for (const [name, value] of [
    ["aria-describedby", ""],
    ["aria-hidden", "true"],
    ["aria-roledescription", ""],
    ["data-calendar-drag-proxy", ""],
    ["role", "presentation"],
    ["tabindex", "-1"],
  ]) {
    proxy.setAttribute(name!, value!);
  }
  Object.assign(proxy.style, {
    height: `${height}px`,
    left: `${point.x - offset.x}px`,
    margin: "0",
    opacity: "0",
    pointerEvents: "none",
    position: "fixed",
    top: `${point.y - offset.y}px`,
    width: `${width}px`,
  });
  document.body.append(proxy);
  return proxy;
}

/** Whether a draggable is one the calendar takes: an item to drop, or one of its events. */
function takesDrop(source: { readonly data?: unknown }): boolean {
  return calendarDropOf(source) !== null || calendarEventOf(source) !== null;
}

/**
 * Connects the calendar views on the page to a dnd-kit manager, and returns a function that
 * disconnects them. `CalendarDndKit` does this for the `DragDropProvider` it's in; call it
 * yourself with a `DragDropManager` from `@dnd-kit/dom`. Connecting a manager again shares the
 * first connection, which lasts until every call has disconnected.
 *
 * - Each view's region becomes a droppable, disabled while the view is read-only, that takes
 *   only draggables carrying `calendarDropData` and calendar events. Its ID is opaque: tell it by
 *   `isCalendarTarget`. It wins where the view is the topmost thing under the pointer, and a
 *   droppable of yours over the view wins there.
 * - A draggable carrying `calendarDropData` previews in the view under it and proposes there when
 *   dropped, through the view's own policies, `onEventChange` and announcer. Over a droppable of
 *   yours it shows nothing, and dropped there it proposes nothing.
 * - An event a view moves becomes a dnd-kit drag of type `calendarEventType` once the pointer
 *   leaves the view, so your droppables see it like any drag; moves that stay in the view never
 *   reach dnd-kit. Released over one of yours, the drag ends as a drop and the calendar proposes
 *   nothing; any other end, such as a drop back in the calendar or Escape, ends it as `canceled`.
 *   The drag needs dnd-kit's Feedback plugin, one of its defaults, which measures its shape.
 * - dnd-kit's `AutoScroller` is off while a drag is over a view, which scrolls itself.
 */
export function connectCalendarDragDrop(manager: DragDropManager): () => void {
  let connection = connections.get(manager);
  if (connection === undefined) {
    connection = { count: 0, disconnect: connect(manager) };
    connections.set(manager, connection);
  }
  const shared = connection;
  shared.count += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    shared.count -= 1;
    if (shared.count > 0) return;
    connections.delete(manager);
    shared.disconnect();
  };
}

function connect(manager: DragDropManager): () => void {
  const { monitor } = manager;
  const cleanups: (() => void)[] = [];
  /** A droppable per view region, by its element. */
  const droppables = new Map<HTMLElement, Droppable>();
  /** Whether this connection turned the auto-scroller off, so it turns it on again. */
  let pausedScroller = false;

  /** Whether the target is a droppable of the app's rather than a view. */
  function overOther(): boolean {
    const { target } = manager.dragOperation;
    return target != null && !isCalendarTarget(target);
  }

  /**
   * Whether a view that takes drops is the topmost thing at a point. Asked before dnd-kit applies a
   * move, which is when its auto-scroller would act, rather than from the target it works out
   * after.
   */
  function overViewAt({ x, y }: CalendarPoint): boolean {
    const [top] = document.elementsFromPoint(x, y);
    if (top === undefined) return false;
    for (const [element, droppable] of droppables) {
      if (!droppable.disabled && element.contains(top)) return true;
    }
    return false;
  }

  /** Lets the view scroll itself while the drag is over it, and dnd-kit scroll elsewhere. */
  function pauseScroller(pause: boolean): void {
    const scroller = manager.registry.plugins.get(AutoScroller);
    if (scroller === undefined) return;
    if (pause && !scroller.isDisabled()) {
      scroller.disable();
      pausedScroller = true;
    } else if (!pause && pausedScroller) {
      scroller.enable();
      pausedScroller = false;
    }
  }
  cleanups.push(() => pauseScroller(false));

  cleanups.push(
    observeCalendarRegions((regions) => {
      const present = new Set<HTMLElement>();
      for (const { disabled, element } of regions) {
        present.add(element);
        const existing = droppables.get(element);
        if (existing !== undefined) {
          existing.disabled = disabled;
          continue;
        }
        const id = nextId("view");
        const droppable = new Droppable(
          {
            accept: takesDrop,
            collisionDetector: ({ dragOperation }) =>
              topmostIn(element, dragOperation.position.current)
                ? { id, priority: VIEW_PRIORITY, type: POINTER_INTERSECTION, value: 1 }
                : null,
            data: calendarViewData,
            disabled,
            element,
            id,
            register: false,
          },
          manager,
        );
        droppable.register();
        droppables.set(element, droppable);
      }
      for (const [element, droppable] of droppables) {
        if (present.has(element)) continue;
        droppable.destroy();
        droppables.delete(element);
      }
    }),
  );
  cleanups.push(() => {
    for (const droppable of droppables.values()) droppable.destroy();
    droppables.clear();
  });

  // Drags in: a draggable of the app's carrying `calendarDropData`.
  let drop: CalendarDropSession | null = null;
  let point: CalendarPoint | null = null;

  function follow(): void {
    if (drop === null || point === null) return;
    pauseScroller(overViewAt(point));
    drop.move(overOther() ? null : point);
  }

  cleanups.push(
    monitor.addEventListener("dragstart", ({ operation }) => {
      const source = calendarDropOf(operation.source);
      if (source === null) return;
      try {
        drop = startCalendarDrop(source, {
          input: fromKeyboard(operation.activatorEvent) ? "keyboard" : "pointer",
        });
      } catch (error) {
        // Bad data on the app's draggable, such as a duration that isn't positive.
        report(error);
        return;
      }
      point = operation.position.current;
      follow();
    }),
    monitor.addEventListener("dragmove", ({ by, operation, to }) => {
      if (drop === null) return;
      // The operation's position catches up in a microtask; the event has where it's going.
      const { current } = operation.position;
      point = to ?? { x: current.x + (by?.x ?? 0), y: current.y + (by?.y ?? 0) };
      follow();
    }),
    // The target changed, after the position did.
    monitor.addEventListener("dragover", () => {
      if (drop === null) return;
      point = manager.dragOperation.position.current;
      follow();
    }),
    monitor.addEventListener("dragend", ({ canceled, operation }) => {
      const current = drop;
      if (current === null) return;
      drop = null;
      point = null;
      pauseScroller(false);
      const elsewhere = operation.target != null && !isCalendarTarget(operation.target);
      if (canceled || elsewhere) current.cancel();
      else void current.drop();
    }),
  );
  cleanups.push(() => {
    drop?.cancel();
    drop = null;
  });

  // Drags out: an event a view moves, mirrored into a dnd-kit drag once it leaves the view.
  cleanups.push(
    monitorCalendarDrags((drag): CalendarDragFollower => {
      const grabbed = drag.element.getBoundingClientRect();
      /** The dnd-kit drag, once the pointer has left the view. */
      let mirror: { readonly draggable: Draggable; readonly release: () => void } | null = null;
      /** dnd-kit refused the drag, or another was on: the calendar keeps it to itself. */
      let refused = false;
      let started = false;
      let latest = drag.origin;
      const isOurs = () => mirror !== null && manager.dragOperation.source === mirror.draggable;

      function begin(at: CalendarPoint): void {
        if (!manager.dragOperation.status.idle) {
          refused = true;
          return;
        }
        const proxy = standIn(drag, grabbed, at);
        const draggable = new Draggable(
          {
            data: calendarEventData({
              event: drag.event.event,
              eventId: drag.event.id,
              placement: eventPlacement(drag.event),
            }),
            element: proxy,
            id: nextId("event"),
            // Registered now rather than in a microtask, so the drag can start at once.
            register: false,
            sensors: [],
            type: calendarEventType,
          },
          manager,
        );
        draggable.register();
        // Its own Feedback options, set after registering: plugins given to the constructor would
        // register Feedback with none, replacing the app's.
        draggable.plugins = proxyFeedback;
        const stops = [
          monitor.addEventListener("dragstart", () => {
            if (!isOurs()) return;
            started = true;
            pauseScroller(overViewAt(latest));
            manager.actions.move({ to: latest });
          }),
          monitor.addEventListener("dragover", () => {
            if (started && isOurs()) drag.refresh();
          }),
        ];
        const release = () => {
          for (const stop of stops) stop();
          pauseScroller(false);
          // Once the drag has let go of its source, which dnd-kit still reads as it ends.
          const remove = () => {
            if (!manager.dragOperation.status.idle && manager.dragOperation.source === draggable) {
              requestAnimationFrame(remove);
              return;
            }
            draggable.destroy();
            proxy.remove();
          };
          remove();
        };
        mirror = { draggable, release };
        try {
          const controller = manager.actions.start({ coordinates: at, source: draggable });
          // `beforedragstart` was prevented.
          if (controller.signal.aborted) refused = true;
        } catch (error) {
          report(error);
          refused = true;
        }
        if (refused) {
          mirror = null;
          release();
        }
      }

      return {
        claims: () => started && isOurs() && overOther(),
        end: (dropped) => {
          if (mirror === null) return;
          if (isOurs()) manager.actions.stop({ canceled: !dropped });
          mirror.release();
          mirror = null;
        },
        move: (next) => {
          latest = next;
          if (mirror === null) {
            // A move that stays in the view is the calendar's alone.
            if (!refused && !overViewAt(next)) begin(next);
            return;
          }
          if (!started || !isOurs()) return;
          pauseScroller(overViewAt(next));
          manager.actions.move({ to: next });
        },
      };
    }),
  );

  return () => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  };
}

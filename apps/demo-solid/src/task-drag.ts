import {
  monitorCalendarDrags,
  startCalendarDrop,
  type CalendarDropSession,
  type CalendarPoint,
} from "@moltenship/calendar-solid";
import { createSignal, onCleanup } from "solid-js";

import type { DemoOccurrence } from "@demo/demo-model";
import { taskFromOccurrence, taskOccurrence, type DemoTask } from "@demo/tasks";

// What the React demo does through dnd-kit (apps/demo/src/unscheduled.ts), on the calendar's own
// drag and drop: a task's card drags into the views through `startCalendarDrop`, by pointer or
// keyboard, and a one-off event drags out of them to the list through `monitorCalendarDrags`.

/** How far a press moves before it's a drag, so a click stays a click. */
const dragThreshold = 4;
/**
 * A finger holds still this long, within `touchTolerance`, to pick a task up, as dnd-kit's pointer
 * sensor has it in the React demo: a finger that moves sooner scrolls the sidebar instead.
 */
const touchDelay = 250;
const touchTolerance = 5;
/** How far an arrow key moves a keyboard drag, and with Shift. */
const keyStep = { large: 80, small: 20 } as const;

const within = (element: Element, { x, y }: CalendarPoint) => {
  if (!element.checkVisibility()) return false;
  const box = element.getBoundingClientRect();
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
};

/** A copy of the card that follows the drag, above everything and letting the pointer through. */
function dragImage(card: HTMLElement) {
  const box = card.getBoundingClientRect();
  const image = card.cloneNode(true) as HTMLElement;
  image.removeAttribute("id");
  image.removeAttribute("data-task-id");
  image.setAttribute("aria-hidden", "true");
  image.dataset.dragImage = "";
  Object.assign(image.style, {
    inset: "0 auto auto 0",
    margin: "0",
    pointerEvents: "none",
    position: "fixed",
    top: "0",
    width: `${box.width}px`,
    zIndex: "60",
  });
  image.popover = "manual";
  document.body.append(image);
  image.showPopover();
  return {
    image,
    place: ({ x, y }: CalendarPoint, offset: CalendarPoint) => {
      image.style.transform = `translate(${x - offset.x}px, ${y - offset.y}px)`;
    },
  };
}

/**
 * Makes a task's card draggable onto the calendar: by pointer, past a few pixels, or by keyboard,
 * Space or Enter to pick it up, arrows to move, Space or Enter to drop it and Escape to cancel.
 * Over `list`, its own list, the calendar shows nothing.
 */
export function createTaskDrag(
  task: () => DemoTask,
  list: () => HTMLElement | undefined,
  disabled: () => boolean,
) {
  const [dragging, setDragging] = createSignal(false);
  const [overCalendar, setOverCalendar] = createSignal(false);
  let session: CalendarDropSession<DemoOccurrence, string> | null = null;
  let image: ReturnType<typeof dragImage> | null = null;
  let offset: CalendarPoint = { x: 0, y: 0 };
  let point: CalendarPoint = { x: 0, y: 0 };
  /** Removes the listeners of the press under way. */
  let release: (() => void) | undefined;

  function start(card: HTMLElement, input: "keyboard" | "pointer", from: CalendarPoint) {
    const { minutes, title } = task();
    session = startCalendarDrop<DemoOccurrence, string>(
      { duration: { minutes }, event: taskOccurrence(task()), title },
      { input },
    );
    const box = card.getBoundingClientRect();
    offset = { x: from.x - box.left, y: from.y - box.top };
    image = dragImage(card);
    setDragging(true);
    follow(from);
  }

  function follow(next: CalendarPoint) {
    point = next;
    image?.place(next, offset);
    const own = list();
    session?.move(own !== undefined && within(own, next) ? null : next);
    setOverCalendar(session?.placement != null);
  }

  function end() {
    image?.image.remove();
    image = null;
    session = null;
    setDragging(false);
    setOverCalendar(false);
  }

  function drop() {
    const current = session;
    end();
    void current?.drop();
  }

  function cancel() {
    const current = session;
    end();
    current?.cancel();
  }

  onCleanup(() => {
    release?.();
    if (session !== null) cancel();
  });

  const onPointerDown = (down: PointerEvent) => {
    if (down.button !== 0 || session !== null || disabled()) return;
    release?.();
    const card = down.currentTarget as HTMLElement;
    const origin = { x: down.clientX, y: down.clientY };
    const touch = down.pointerType === "touch";
    const moved = (at: CalendarPoint) => Math.hypot(at.x - origin.x, at.y - origin.y);
    card.setPointerCapture(down.pointerId);
    // Once a finger has picked the task up, its moves drag it rather than scroll the page.
    const holdPage = (move: TouchEvent) => move.preventDefault();
    let hold: ReturnType<typeof setTimeout> | undefined;
    if (touch) {
      hold = setTimeout(() => {
        hold = undefined;
        window.addEventListener("touchmove", holdPage, { passive: false });
        start(card, "pointer", origin);
      }, touchDelay);
    }
    const onMove = (move: PointerEvent) => {
      const at = { x: move.clientX, y: move.clientY };
      if (session === null) {
        if (touch) {
          if (moved(at) > touchTolerance) release?.();
          return;
        }
        if (moved(at) < dragThreshold) return;
        start(card, "pointer", origin);
      }
      follow(at);
    };
    const onKey = (key: KeyboardEvent) => {
      if (key.key !== "Escape" || session === null) return;
      key.preventDefault();
      cancel();
    };
    const finish = (up: PointerEvent) => {
      release?.();
      if (session === null) return;
      if (up.type === "pointerup") drop();
      else cancel();
    };
    release = () => {
      clearTimeout(hold);
      card.removeEventListener("pointermove", onMove);
      card.removeEventListener("pointerup", finish);
      card.removeEventListener("pointercancel", finish);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("touchmove", holdPage);
      release = undefined;
    };
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerup", finish);
    card.addEventListener("pointercancel", finish);
    window.addEventListener("keydown", onKey, true);
  };

  const onKeyDown = (key: KeyboardEvent) => {
    const card = key.currentTarget as HTMLElement;
    if (session === null) {
      if ((key.key !== " " && key.key !== "Enter") || disabled()) return;
      key.preventDefault();
      const box = card.getBoundingClientRect();
      start(card, "keyboard", { x: box.left + box.width / 2, y: box.top + box.height / 2 });
      return;
    }
    const step = key.shiftKey ? keyStep.large : keyStep.small;
    const moves: Readonly<Record<string, CalendarPoint>> = {
      ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
    };
    const by = moves[key.key];
    if (by !== undefined) follow({ x: point.x + by.x, y: point.y + by.y });
    else if (key.key === " " || key.key === "Enter") drop();
    else if (key.key === "Escape") cancel();
    else if (key.key !== "Tab") return;
    key.preventDefault();
  };

  return {
    dragging,
    overCalendar,
    props: {
      onBlur: () => session !== null && cancel(),
      onKeyDown,
      onPointerDown,
    },
  };
}

/**
 * The list as a place to drag one-off events to, which unschedules them: while one is over
 * `list`, the calendar previews nothing, and a release there calls `onDrop`.
 */
export function createUnscheduledDrop(
  list: () => HTMLElement | undefined,
  onDrop: (occurrence: DemoOccurrence) => void,
) {
  const [over, setOver] = createSignal(false);
  onCleanup(
    monitorCalendarDrags((drag) => {
      const occurrence = drag.event.event as DemoOccurrence;
      if (taskFromOccurrence(occurrence) === null) return;
      let inside = false;
      return {
        claims: () => inside,
        end: (dropped) => {
          setOver(false);
          if (dropped) onDrop(occurrence);
        },
        move: (point) => {
          const element = list();
          inside = element !== undefined && within(element, point);
          setOver(inside);
        },
      };
    }),
  );
  return over;
}

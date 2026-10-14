import { sameFocus, type CalendarFocus, type EventId, type ResourceId } from "@moltenship/calendar";
import { act } from "react";

import { toPlainDate } from "./environment";
import { CalendarQueryError, eventElements, type CellQuery, type EventQuery } from "./queries";

/** Modifier keys held with a key. */
export interface KeyModifiers {
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
}

/**
 * Arrow-key steps through a view, by direction rather than key. What a step is depends on the
 * view: in a time grid, `across` is a day and `down` a slot; in a month, a day and a week; in
 * resource columns, a column (the next resource, then the next day) and a slot; in a timeline,
 * `across` is a slot and `down` the next resource.
 */
export interface KeyboardSteps {
  /**
   * Steps toward the inline end, or back when negative: Arrow Right in a left-to-right calendar,
   * Arrow Left in a right-to-left one, from `Root`'s `direction`.
   */
  readonly across?: number;
  /** Steps down, or up when negative: Arrow Down or Arrow Up. */
  readonly down?: number;
}

/** Arrow keys to press, each a number of times, in this order. */
export interface ArrowPresses {
  readonly up?: number;
  readonly down?: number;
  readonly left?: number;
  readonly right?: number;
}

/**
 * Drives a calendar's keyboard model as a person would: focus, arrows, and the grab mode, where
 * Space picks up the focused event (Shift+Space its end, again its start) or starts a create on
 * the focused cell, arrows step it, Enter drops it and Escape cancels it. Keys go to the focused
 * element inside `act`, so they work in jsdom, happy-dom and a browser alike.
 */
export interface KeyboardDriver<TResourceId extends ResourceId = ResourceId> {
  /** Focuses an event's element; on `date`, the part showing that day. */
  focusEvent(
    event: EventQuery,
    options?: { readonly date?: string | Temporal.PlainDate },
  ): Promise<HTMLElement>;
  /** Focuses a day, or a slot when `time` is given, through the calendar's focus. */
  focusCell(cell: CellQuery<TResourceId>): Promise<HTMLElement>;
  /** Presses a key on the focused element. */
  press(key: string, modifiers?: KeyModifiers): Promise<void>;
  arrows(presses: ArrowPresses): Promise<void>;
  /** Presses arrow keys for `down` steps, then `across` ones; during a grab they move it. */
  step(steps: KeyboardSteps): Promise<void>;
  /** Space: picks up the focused event, or starts a create on the focused cell. */
  grab(): Promise<void>;
  /** Shift+Space: picks up the focused event's end; during a resize, switches to the other edge. */
  grabEdge(): Promise<void>;
  /** Enter: drops what's grabbed, proposing the change. */
  drop(): Promise<void>;
  /** Escape: cancels a grab. */
  cancel(): Promise<void>;
  /** Focuses the event, grabs it, steps and drops it. */
  moveEvent(event: EventQuery, steps: KeyboardSteps): Promise<void>;
  /** Focuses the event, grabs its end (or start), steps it and drops it. */
  resizeEvent(
    event: EventQuery,
    steps: KeyboardSteps & { readonly edge?: "end" | "start" },
  ): Promise<void>;
  /** Focuses the cell, starts a create, grows it by steps and drops it. */
  createEvent(cell: CellQuery<TResourceId>, steps?: KeyboardSteps): Promise<void>;
}

interface KeyboardContext {
  readonly container: HTMLElement;
  readonly direction: () => "ltr" | "rtl";
  readonly focus: () => CalendarFocus | null;
  readonly setFocus: (focus: CalendarFocus) => void;
  readonly eventId: (query: EventQuery) => EventId;
}

const codes: Readonly<Record<string, string>> = { " ": "Space" };

export function createKeyboardDriver<TResourceId extends ResourceId>(
  context: KeyboardContext,
): KeyboardDriver<TResourceId> {
  const { container } = context;

  async function press(key: string, modifiers: KeyModifiers = {}) {
    const target = document.activeElement;
    if (!(target instanceof HTMLElement) || !container.contains(target)) {
      throw new CalendarQueryError(
        `Nothing in the calendar has focus to press ${JSON.stringify(key)} on; focus an event or a cell first.`,
      );
    }
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: codes[key] ?? key,
          key,
          ...modifiers,
        }),
      );
      await Promise.resolve();
    });
  }

  async function repeat(key: string, times: number) {
    for (let index = 0; index < times; index += 1) await press(key);
  }

  async function arrows({ down = 0, left = 0, right = 0, up = 0 }: ArrowPresses) {
    await repeat("ArrowUp", up);
    await repeat("ArrowDown", down);
    await repeat("ArrowLeft", left);
    await repeat("ArrowRight", right);
  }

  async function step({ across = 0, down = 0 }: KeyboardSteps) {
    const later = context.direction() === "rtl" ? "ArrowLeft" : "ArrowRight";
    const earlier = later === "ArrowLeft" ? "ArrowRight" : "ArrowLeft";
    await repeat(down >= 0 ? "ArrowDown" : "ArrowUp", Math.abs(down));
    await repeat(across >= 0 ? later : earlier, Math.abs(across));
  }

  async function focusEvent(
    query: EventQuery,
    options: { readonly date?: string | Temporal.PlainDate } = {},
  ) {
    const id = context.eventId(query);
    const elements = eventElements(container, id).filter((element) =>
      element.hasAttribute("tabindex"),
    );
    const date = options.date === undefined ? undefined : toPlainDate(options.date).toString();
    const element =
      date === undefined
        ? elements[0]
        : elements.find(
            (candidate) => candidate.closest("[data-date]")?.getAttribute("data-date") === date,
          );
    if (element === undefined) {
      throw new CalendarQueryError(
        `The view shows no focusable element for event ${String(id)}${date === undefined ? "" : ` on ${date}`}.`,
      );
    }
    await act(async () => element.focus());
    return element;
  }

  async function focusCell(cell: CellQuery<TResourceId>) {
    const date = toPlainDate(cell.date);
    const focus: CalendarFocus =
      cell.time === undefined
        ? {
            date,
            kind: "day",
            ...(cell.resourceId === undefined ? {} : { resourceId: cell.resourceId }),
          }
        : {
            date,
            kind: "slot",
            time: Temporal.PlainTime.from(cell.time),
            ...(cell.resourceId === undefined ? {} : { resourceId: cell.resourceId }),
          };
    await act(async () => context.setFocus(focus));
    const stops = [...container.querySelectorAll<HTMLElement>('[tabindex="0"]')].filter(
      (element) => element.closest('[data-calendar-part="toolbar"]') === null,
    );
    // Without a resource, the cell in any resource matches, as focus lands on the first one.
    const matches = (now: CalendarFocus | null) =>
      now !== null &&
      sameFocus(
        now,
        (cell.resourceId === undefined
          ? { ...focus, resourceId: now.resourceId }
          : focus) as CalendarFocus,
      );
    for (const stop of stops) {
      await act(async () => stop.focus());
      if (matches(context.focus())) return stop;
      await act(async () => context.setFocus(focus));
    }
    const where =
      cell.time === undefined ? date.toString() : `${date.toString()} at ${String(cell.time)}`;
    throw new CalendarQueryError(
      `The view shows no cell for ${where}${cell.resourceId === undefined ? "" : ` in resource ${String(cell.resourceId)}`}.`,
    );
  }

  return Object.freeze({
    arrows,
    cancel: () => press("Escape"),
    async createEvent(cell: CellQuery<TResourceId>, steps: KeyboardSteps = {}) {
      await focusCell(cell);
      await press(" ");
      await step(steps);
      await press("Enter");
    },
    drop: () => press("Enter"),
    focusCell,
    focusEvent,
    grab: () => press(" "),
    grabEdge: () => press(" ", { shiftKey: true }),
    async moveEvent(event: EventQuery, steps: KeyboardSteps) {
      await focusEvent(event);
      await press(" ");
      await step(steps);
      await press("Enter");
    },
    press,
    async resizeEvent(
      event: EventQuery,
      { edge = "end", ...steps }: KeyboardSteps & { readonly edge?: "end" | "start" },
    ) {
      await focusEvent(event);
      await press(" ", { shiftKey: true });
      if (edge === "start") await press(" ", { shiftKey: true });
      await step(steps);
      await press("Enter");
    },
    step,
  });
}

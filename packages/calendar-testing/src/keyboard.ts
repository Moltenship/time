import {
  sameFocus,
  type CalendarFocus,
  type EventId,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar";
import { act } from "react";

import { toPlainDate, type DateInput } from "./environment";
import { CalendarQueryError, type CellQuery, type EventQuery } from "./queries";

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
 * `across` is a slot, or a day over days, and `down` the next resource.
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

/** Which part of an event to focus: the one on `date`, in `resourceId`. */
export interface EventFocusOptions<TResourceId extends ResourceId = ResourceId> {
  /** The day whose part takes focus; the day the event starts by default. */
  readonly date?: DateInput;
  /** The resource whose copy takes focus, in a resource view. */
  readonly resourceId?: TResourceId | null;
}

/**
 * Drives a calendar's keyboard model as a person would: focus, arrows, and the grab mode, where
 * Space picks up the focused event (Shift+Space its end, again its start) or starts a create on
 * the focused cell, arrows step it, Enter drops it and Escape cancels it. Keys go to the focused
 * element inside `act`, so they work in jsdom, happy-dom and a browser alike.
 */
export interface KeyboardDriver<
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  /**
   * Focuses an event through the calendar's focus, as arrow keys would: its part on `date`, in
   * `resourceId`. Throws when the view doesn't show that part, and leaves focus as it was.
   */
  focusEvent(
    event: EventQuery<TEventId>,
    options?: EventFocusOptions<TResourceId>,
  ): Promise<HTMLElement>;
  /**
   * Focuses a day, or a slot when `time` is given, through the calendar's focus; a slot renders
   * only while it has focus. Throws when the view doesn't show the cell, and leaves focus as it
   * was.
   */
  focusCell(cell: CellQuery<TResourceId>): Promise<HTMLElement>;
  /** Presses a key on the focused element, as `keydown`. */
  press(key: string, modifiers?: KeyModifiers): Promise<void>;
  /** Presses arrow keys by count: up, down, left, then right. */
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
  moveEvent(
    event: EventQuery<TEventId>,
    steps: KeyboardSteps & EventFocusOptions<TResourceId>,
  ): Promise<void>;
  /** Focuses the event, grabs its end (or start), steps it and drops it. */
  resizeEvent(
    event: EventQuery<TEventId>,
    steps: KeyboardSteps & EventFocusOptions<TResourceId> & { readonly edge?: "end" | "start" },
  ): Promise<void>;
  /** Focuses the cell, starts a create, grows it by steps and drops it. */
  createEvent(cell: CellQuery<TResourceId>, steps?: KeyboardSteps): Promise<void>;
}

interface KeyboardContext<TEventId extends EventId> {
  readonly container: HTMLElement;
  readonly direction: () => "ltr" | "rtl";
  readonly timeZone: () => string;
  readonly focus: () => CalendarFocus | null;
  readonly setFocus: (focus: CalendarFocus | null) => void;
  readonly event: (
    query: EventQuery<TEventId>,
  ) => NormalizedCalendarEvent<unknown, TEventId, ResourceId>;
}

/** `KeyboardEvent.code` for a key, on a US layout. */
function codeOf(key: string): string {
  if (key === " ") return "Space";
  if (/^[a-z]$/iu.test(key)) return `Key${key.toUpperCase()}`;
  if (/^\d$/u.test(key)) return `Digit${key}`;
  return key;
}

function withResource(
  focus: CalendarFocus,
  resourceId: ResourceId | null | undefined,
): CalendarFocus {
  return resourceId === undefined ? focus : ({ ...focus, resourceId } as CalendarFocus);
}

export function createKeyboardDriver<TEventId extends EventId, TResourceId extends ResourceId>(
  context: KeyboardContext<TEventId>,
): KeyboardDriver<TEventId, TResourceId> {
  const { container } = context;

  async function press(key: string, modifiers: KeyModifiers = {}) {
    const target = document.activeElement;
    if (!(target instanceof HTMLElement) || target === document.body) {
      throw new CalendarQueryError(
        `Nothing has focus to press ${JSON.stringify(key)} on; focus an event or a cell first.`,
      );
    }
    await act(async () => {
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          code: codeOf(key),
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

  /**
   * Sets the calendar's focus, then moves DOM focus to the view's tab stop and checks that it
   * landed there: the tab stop is the focused element when the view shows it, or else its entry.
   * On failure, the focus goes back to what it was.
   */
  async function focusThrough(
    focus: CalendarFocus,
    matches: (now: CalendarFocus | null) => boolean,
    describeTarget: () => string,
  ): Promise<HTMLElement> {
    const before = context.focus();
    const tried = new Set<HTMLElement>();
    for (;;) {
      await act(async () => context.setFocus(focus));
      const stop = [...container.querySelectorAll<HTMLElement>('[tabindex="0"]')].find(
        (element) =>
          !tried.has(element) && element.closest('[data-calendar-part="toolbar"]') === null,
      );
      if (stop === undefined) break;
      tried.add(stop);
      // Focusing what already has focus fires nothing, so move it off first.
      if (document.activeElement === stop) await act(async () => stop.blur());
      await act(async () => stop.focus());
      if (matches(context.focus())) return stop;
    }
    await act(async () => context.setFocus(before));
    throw new CalendarQueryError(`The view shows no ${describeTarget()}.`);
  }

  function startDate(event: NormalizedCalendarEvent<unknown, TEventId, ResourceId>) {
    if (event.kind === "all-day") return event.start;
    if (event.kind === "floating") return event.start.toPlainDate();
    return event.start.toZonedDateTimeISO(context.timeZone()).toPlainDate();
  }

  function focusEvent(query: EventQuery<TEventId>, options: EventFocusOptions<TResourceId> = {}) {
    const event = context.event(query);
    const date = options.date === undefined ? startDate(event) : toPlainDate(options.date);
    const focus = withResource({ date, eventId: event.id, kind: "event" }, options.resourceId);
    return focusThrough(
      focus,
      (now) =>
        now?.kind === "event" &&
        now.eventId === event.id &&
        now.date.equals(date) &&
        (options.resourceId === undefined || now.resourceId === options.resourceId),
      () =>
        `focusable part of event ${JSON.stringify(event.id)} on ${date.toString()}${
          options.resourceId === undefined
            ? ""
            : ` in resource ${JSON.stringify(options.resourceId)}`
        }`,
    );
  }

  function focusCell(cell: CellQuery<TResourceId>) {
    const date = toPlainDate(cell.date);
    const focus = withResource(
      cell.time === undefined
        ? { date, kind: "day" }
        : { date, kind: "slot", time: Temporal.PlainTime.from(cell.time) },
      cell.resourceId,
    );
    return focusThrough(
      focus,
      // Without a resource, the cell in any resource matches, as focus lands on the first one.
      (now) =>
        now !== null &&
        sameFocus(
          now,
          cell.resourceId === undefined ? withResource(focus, now.resourceId ?? undefined) : focus,
        ),
      () =>
        `cell for ${date.toString()}${cell.time === undefined ? "" : ` at ${String(cell.time)}`}${
          cell.resourceId === undefined ? "" : ` in resource ${JSON.stringify(cell.resourceId)}`
        }`,
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
    async moveEvent(
      event: EventQuery<TEventId>,
      { date, resourceId, ...steps }: KeyboardSteps & EventFocusOptions<TResourceId>,
    ) {
      await focusEvent(event, { date, resourceId });
      await press(" ");
      await step(steps);
      await press("Enter");
    },
    press,
    async resizeEvent(
      event: EventQuery<TEventId>,
      {
        date,
        edge = "end",
        resourceId,
        ...steps
      }: KeyboardSteps & EventFocusOptions<TResourceId> & { readonly edge?: "end" | "start" },
    ) {
      await focusEvent(event, { date, resourceId });
      await press(" ", { shiftKey: true });
      if (edge === "start") await press(" ", { shiftKey: true });
      await step(steps);
      await press("Enter");
    },
    step,
  });
}

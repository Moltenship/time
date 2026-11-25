import {
  anchorShowingDate,
  keyboardSessionProposal,
  moveKeyboardCursor,
  sameFocus,
  showsInResource,
  slotDuration,
  startKeyboardSession,
  visibleResources,
  type CalendarCellFocus,
  type CalendarEventPlacement,
  type CalendarFocus,
  type CalendarInteractionCheck,
  type CalendarInteractionUpdate,
  type CalendarKeyboardSession,
  type CalendarNavigationCommand,
  type CalendarProposalDetail,
  type CalendarSpatialNavigation,
  type ResourceTree,
} from "@moltenship/calendar-core";
import { plainDateIntervalContains, type WallTimeSnapOptions } from "@moltenship/calendar-temporal";

import {
  DEFAULT_SNAP,
  type CalendarInteractionRuntime,
  type CalendarViewRuntime,
} from "./interaction";
import type { KeyboardGrab } from "./keyboard-store";
import type { CalendarCommandOptions } from "./types";

/** How a view's keyboard creates, moves and resizes events; read whenever a key arrives. */
export interface CalendarKeyboardOptions {
  /**
   * Which way time runs through the view's slots: down the block axis, as in a time grid (the
   * default), or along the inline axis, as in a timeline. A slot create grows that way.
   */
  readonly axis?: "block" | "inline";
  /**
   * How long an event created on a slot starts out, in whole slots; arrow keys then change it
   * as a pointer drag would. One hour by default. A create on a day starts as that day.
   */
  readonly createDuration?: Temporal.DurationLike;
  /** Length and alignment of time-grid slots; pass the pointer layer's `snap`. 15 minutes by default. */
  readonly snap?: WallTimeSnapOptions;
}

/**
 * What a framework's handler got for a DOM event, when the framework wraps DOM events in its own,
 * as React does: the keyboard prevents its default and stops its propagation, so the framework's
 * own handlers further out see both.
 */
export interface CalendarKeyEventWrapper {
  readonly preventDefault: () => void;
  readonly stopPropagation: () => void;
}

/**
 * A view's keyboard, from `createCalendarKeyboard`. An integration calls its methods from the
 * `keydown` and `focusout` handlers of the element around the view's focusable cells and events.
 * Bind `keydown` on that element itself (`addEventListener` from a ref in Solid, not
 * `onKeyDown`): a handler the framework delegates to the document runs once the key has bubbled
 * past every element, too late for Escape's stopped propagation to keep it from the handlers
 * around the view.
 */
export interface CalendarKeyboardController {
  /**
   * Leaves the element: focus moving outside `region`, the element the handler is on, cancels a
   * gesture in progress, a task later, unless focus has come back by then, as it does when a
   * grabbed event re-renders in a new place.
   */
  readonly focusOut: (event: FocusEvent, region: HTMLElement) => void;
  /**
   * Handles a key pressed inside the view. A key the calendar acts on has its default prevented,
   * and Escape also stops propagating, through `wrapper` when given (see
   * `CalendarKeyEventWrapper`), else through `event` itself. Keys with Alt, Ctrl or Meta, keys
   * composing text, and keys whose default is already prevented are left alone.
   */
  readonly keyDown: (event: KeyboardEvent, wrapper?: CalendarKeyEventWrapper) => void;
}

const DEFAULT_CREATE_DURATION: Temporal.DurationLike = { hours: 1 };

/**
 * What a key tells the state handlers it changes: its reason, and the key itself, from which the
 * store works out the source, the keyboard's, or the agent's while an agent's step presses it.
 */
function keyCommand(event: KeyboardEvent): CalendarCommandOptions {
  return { event, reason: "keyboard-navigation" };
}
const keyboardInput: CalendarProposalDetail = Object.freeze({ input: "keyboard" });

const navigationKeys: Readonly<Record<string, CalendarNavigationCommand>> = {
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  End: "end",
  Home: "home",
  PageDown: "page-down",
  PageUp: "page-up",
};

type UpdateDetail =
  | { readonly phase: "cancel" | "start" | "step" }
  | {
      readonly phase: "commit";
      readonly proposed: CalendarCommitPlacement;
      readonly warnings?: readonly string[];
    }
  | { readonly error?: unknown; readonly phase: "reject"; readonly reason: string };

type CalendarCommitPlacement = Extract<
  CalendarInteractionUpdate,
  { readonly phase: "commit" }
>["proposed"];

/**
 * The keyboard of one rendered active view: navigation, and keyboard move, resize and create.
 * `getOptions` and `getResources` (the root's resource tree) are read whenever a key arrives, so
 * the controller is created once per root and view and never again for new options.
 *
 * - Arrow keys, Home, End, Page Up, and Page Down move focus through the view's
 *   `getSpatialNavigation`, navigating the view when focus leaves it. Enter moves into a cell's
 *   events and Escape back out.
 * - Space grabs the focused event to move it, or the focused cell to create an event there;
 *   Shift+Space grabs an event's end to resize it, and again switches to its start. Navigation
 *   keys then step the gesture, Enter or Space commits it through `proposeEventChange`, and
 *   Escape, Tab, or leaving the view cancels it. On a read-only root, Space grabs nothing.
 *
 * Every phase is announced through the root's announcer channel. A view that unmounts mid-gesture
 * lets go of it with `interaction.keyboard.set(null)`.
 */
export function createCalendarKeyboard(
  { actions, announcements, isReadOnly, keyboard, read }: CalendarInteractionRuntime,
  { getView, roving }: CalendarViewRuntime,
  getOptions: () => CalendarKeyboardOptions,
  getResources: () => ResourceTree | null,
): CalendarKeyboardController {
  const getSnap = () => getOptions().snap ?? DEFAULT_SNAP;
  // Keys reach these handlers only while their view is rendered.
  const view = () => getView()!;

  function navigate(
    command: CalendarNavigationCommand,
    focus: CalendarFocus | null,
  ): CalendarSpatialNavigation | null {
    const { definition, environment, options, projection, range } = view();
    return (
      definition.strategy.getSpatialNavigation?.({
        command,
        environment,
        focus,
        options,
        projection,
        range,
        snap: getSnap(),
      }) ?? null
    );
  }

  /** The cell a navigation result names, for keys that move a cell. */
  function cellOf(result: CalendarSpatialNavigation | null): CalendarCellFocus | null {
    return result !== null && "focus" in result && result.focus.kind !== "event"
      ? result.focus
      : null;
  }

  function interactionOptions() {
    return { snap: getSnap(), timeZone: view().environment.timeZone };
  }

  /**
   * Navigates the view by whole ranges until it shows `date`. `command` carries the key, or the
   * focus change, behind it, so the state handlers hear a person's keys as the keyboard's.
   */
  function reveal(date: Temporal.PlainDate, command: CalendarCommandOptions) {
    const { definition, environment, options, range } = view();
    if (plainDateIntervalContains(range, date)) return;
    const { anchorDate } = read();
    actions.setAnchorDate(
      anchorShowingDate(definition.strategy, anchorDate, date, environment, options),
      command,
    );
  }

  /** Moves the calendar's focus and, once the view renders it, DOM focus. */
  function moveFocus(focus: CalendarFocus | null, command: CalendarCommandOptions) {
    if (sameFocus(focus, read().focus as CalendarFocus | null)) {
      roving.focusTabStop("now");
      return;
    }
    roving.focusTabStop("after-update");
    actions.setFocus(focus, command);
    if (focus !== null) reveal(focus.date, command);
  }

  function apply(
    result: CalendarSpatialNavigation | null,
    command: CalendarCommandOptions,
  ): boolean {
    if (result === null) return false;
    if ("focus" in result) {
      moveFocus(result.focus, command);
    } else {
      const { definition, options } = view();
      // Focus enters the next range once it renders, from its end when paging back.
      roving.focusTabStop("after-update");
      if (result.page < 0) roving.enterFromEnd();
      actions.setAnchorDate(
        definition.strategy.navigate(read().anchorDate, result.page, options),
        command,
      );
      actions.setFocus(null, command);
    }
    return true;
  }

  function announce(grab: KeyboardGrab, detail: UpdateDetail) {
    const { check, session } = grab;
    announcements.announcer.announce({
      cause: session.cause,
      event: grab.event,
      input: "keyboard",
      original: session.original,
      proposed: session.proposed,
      ...(detail.phase === "start" || detail.phase === "step" ? { check } : undefined),
      ...detail,
    } as CalendarInteractionUpdate);
  }

  /** What the root's policies would say to committing `session` now, as its preview shows. */
  function checkOf(session: CalendarKeyboardSession): CalendarInteractionCheck {
    const proposal = keyboardSessionProposal(session);
    // The question the commit will ask, with its input, so a policy answers both alike.
    return proposal === null ? null : actions.checkEventChange(proposal, keyboardInput);
  }

  /**
   * Follows the grabbed event into the cursor's date and resource, or a create's cell. A move out
   * of the event's last copy in a resource, as into the unassigned bucket, follows it to a resource
   * it still shows in.
   */
  function focusOfSession(session: CalendarKeyboardSession): CalendarFocus {
    const { cursor, eventId, proposed } = session;
    return eventId === null
      ? cursor
      : {
          date: cursor.date,
          eventId,
          kind: "event",
          resourceId: resourceOn(proposed, cursor.resourceId),
        };
  }

  /** A slot create starts `createDuration` long: its cursor steps later, as a drag would. */
  function startCreate(cell: CalendarCellFocus): CalendarKeyboardSession {
    let session = startKeyboardSession({ cause: "create", cell }, interactionOptions());
    if (cell.kind !== "slot") return session;
    const later =
      getOptions().axis !== "inline"
        ? "down"
        : view().environment.direction === "rtl"
          ? "left"
          : "right";
    const duration = Temporal.Duration.from(getOptions().createDuration ?? DEFAULT_CREATE_DURATION);
    const slots = Math.round(
      duration.total({ unit: "minutes" }) / slotDuration(getSnap()).total({ unit: "minutes" }),
    );
    for (let step = 1; step < slots; step += 1) {
      const cursor = cellOf(navigate(later, session.cursor));
      if (cursor === null) break;
      session = moveKeyboardCursor(session, cursor, interactionOptions());
    }
    return session;
  }

  function grab(
    focus: CalendarFocus,
    cause: "create" | "move" | "resize-end",
    command: CalendarCommandOptions,
  ): boolean {
    if (focus.kind !== "event") {
      if (cause !== "create") return false;
      const session = startCreate(focus);
      const next: KeyboardGrab = {
        cell: focus,
        check: checkOf(session),
        event: null,
        origin: focus,
        session,
      };
      keyboard.set(next);
      moveFocus(focusOfSession(session), command);
      announce(next, { phase: "start" });
      return true;
    }
    if (cause === "create") return false;

    const event = view().events.get(focus.eventId);
    const cell = cellOf(navigate("exit", focus));
    if (event === undefined || cell === null) return false;
    const session = startKeyboardSession({ cause, cell, event }, interactionOptions());
    const next: KeyboardGrab = { cell, check: null, event, origin: focus, session };
    if (event.isReadOnly) {
      announce(next, { phase: "reject", reason: "read-only" });
      return true;
    }
    keyboard.set(next);
    announce(next, { phase: "start" });
    return true;
  }

  function step(
    current: KeyboardGrab,
    key: CalendarNavigationCommand,
    command: CalendarCommandOptions,
  ) {
    const cursor = cellOf(navigate(key, current.session.cursor));
    if (cursor === null) return;
    const session = moveKeyboardCursor(current.session, cursor, interactionOptions());
    if (session === current.session) return;
    const next = { ...current, check: checkOf(session), session };
    keyboard.set(next);
    moveFocus(focusOfSession(session), command);
    announce(next, { phase: "step" });
  }

  /** Grabs the other edge, starting the resize over from the event as it was. */
  function switchEdge(current: KeyboardGrab, command: CalendarCommandOptions) {
    const { cell, event, session } = current;
    if (event === null || !session.cause.startsWith("resize")) return;
    const cause = session.cause === "resize-end" ? "resize-start" : "resize-end";
    const restarted = startKeyboardSession({ cause, cell, event }, interactionOptions());
    const next = { ...current, check: null, session: restarted };
    keyboard.set(next);
    moveFocus(focusOfSession(restarted), command);
    announce(next, { phase: "start" });
  }

  function cancel(current: KeyboardGrab, command: CalendarCommandOptions) {
    keyboard.set(null);
    moveFocus(current.origin, command);
    announce(current, { phase: "cancel" });
  }

  function commit(current: KeyboardGrab, command: CalendarCommandOptions) {
    const proposal = keyboardSessionProposal(current.session);
    if (proposal === null) {
      cancel(current, command);
      return;
    }
    keyboard.set(null);
    // A later gesture, focus move, or view switch keeps focus where it went.
    const focused = read().focus as CalendarFocus | null;
    const { definition } = view();
    const owned = () =>
      keyboard.get() === null &&
      getView()?.definition === definition &&
      sameFocus(read().focus as CalendarFocus | null, focused);

    void actions.proposeEventChange(proposal, keyboardInput).then((result) => {
      if (result.status === "committed") {
        const { eventId, proposed } = result.change;
        // A policy may have moved the event off the date focus is on.
        if (eventId !== null && proposed !== null && owned()) {
          const { cursor } = current.session;
          // Still the key's doing: focus follows the event it committed.
          moveFocus(
            {
              date: dateOn(proposed, cursor.date),
              eventId,
              kind: "event",
              resourceId: resourceOn(proposed, cursor.resourceId),
            },
            command,
          );
        }
        announce(current, {
          phase: "commit",
          proposed: proposed!,
          warnings: result.change.warnings,
        });
      } else {
        if (owned()) moveFocus(current.origin, command);
        announce(current, {
          phase: "reject",
          reason: result.reason,
          ...(result.error === undefined ? {} : { error: result.error }),
        });
      }
    });
  }

  /** `date` when `placement` covers it, else the placement's first date. */
  function dateOn(placement: CalendarEventPlacement, date: Temporal.PlainDate): Temporal.PlainDate {
    const { timeZone } = view().environment;
    const wall = (point: Temporal.Instant | Temporal.PlainDateTime) =>
      point instanceof Temporal.Instant
        ? point.toZonedDateTimeISO(timeZone).toPlainDateTime()
        : point;
    // The end is exclusive.
    const [first, last] =
      placement.kind === "all-day"
        ? [placement.start, placement.end.subtract({ days: 1 })]
        : [
            wall(placement.start).toPlainDate(),
            wall(placement.end).subtract({ nanoseconds: 1 }).toPlainDate(),
          ];
    return Temporal.PlainDate.compare(first, date) <= 0 &&
      Temporal.PlainDate.compare(date, last) <= 0
      ? date
      : first;
  }

  /**
   * The resource focus follows a placement into: `resourceId` when the placement shows there, else
   * the first resource it books that is visible, so the copy focus moves to renders, even scrolled
   * out of view, and the unassigned bucket when it books none.
   */
  function resourceOn(
    placement: CalendarEventPlacement,
    resourceId: CalendarFocus["resourceId"],
  ): CalendarFocus["resourceId"] {
    const booked = placement.resourceIds;
    if (resourceId === undefined || showsInResource(booked, resourceId)) return resourceId;
    if (booked.length === 0) return null;
    // The latest resources: a save can finish after the root's resources change.
    const tree = getResources();
    const visible = tree === null ? [] : visibleResources(tree, read().expandedResourceIds);
    return booked.find((id) => visible.some((row) => row.id === id));
  }

  function onGrabbedKey(current: KeyboardGrab, event: KeyboardEvent): boolean {
    const key = navigationKeys[event.key];
    const command = keyCommand(event);
    if (key !== undefined) {
      step(current, key, command);
      return true;
    }
    switch (event.key) {
      case "Enter":
        commit(current, command);
        return true;
      case " ":
        if (event.shiftKey) switchEdge(current, command);
        else commit(current, command);
        return true;
      case "Escape":
        cancel(current, command);
        return true;
      case "Tab":
        cancel(current, command);
        return false;
      default:
        return false;
    }
  }

  function onIdleKey(focus: CalendarFocus | null, event: KeyboardEvent): boolean {
    const key = navigationKeys[event.key];
    const command = keyCommand(event);
    if (key !== undefined) return !event.shiftKey && apply(navigate(key, focus), command);
    if (focus === null) return false;
    switch (event.key) {
      // Enter on an event is left to the element, which usually opens it.
      case "Enter":
        return (
          focus.kind !== "event" && !event.shiftKey && apply(navigate("enter", focus), command)
        );
      case "Escape":
        return focus.kind === "event" && apply(navigate("exit", focus), command);
      // A read-only root takes no changes, so Space is left to the element, as Enter is.
      case " ":
        return (
          !isReadOnly &&
          grab(
            focus,
            focus.kind !== "event" ? "create" : event.shiftKey ? "resize-end" : "move",
            command,
          )
        );
      default:
        return false;
    }
  }

  return Object.freeze({
    focusOut(event: FocusEvent, region: HTMLElement) {
      if (keyboard.get() === null) return;
      const next = event.relatedTarget as Node | null;
      if (next !== null && region.contains(next)) return;
      // A grabbed event re-rendering in a new place blurs on its way; focus returns to it.
      const command = { event, reason: "focus-change" } as const;
      setTimeout(() => {
        const current = keyboard.get();
        if (current !== null && !region.contains(document.activeElement)) cancel(current, command);
      });
    },
    keyDown(event: KeyboardEvent, wrapper: CalendarKeyEventWrapper = event) {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const current = keyboard.get();
      const handled =
        current === null
          ? onIdleKey(roving.focusAt(event.target as Node), event)
          : onGrabbedKey(current, event);
      if (!handled) return;
      wrapper.preventDefault();
      if (event.key === "Escape") wrapper.stopPropagation();
    },
  });
}

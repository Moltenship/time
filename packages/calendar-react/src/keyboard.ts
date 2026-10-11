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
  type CalendarSpatialNavigation,
  type ResourceTree,
} from "@moltenship/calendar-core";
import { plainDateIntervalContains, type WallTimeSnapOptions } from "@moltenship/calendar-temporal";
import {
  useContext,
  useEffect,
  useInsertionEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
} from "react";

import {
  DEFAULT_SNAP,
  useInteractionRuntime,
  useViewRuntime,
  type CalendarInteractionRuntime,
  type CalendarViewRuntime,
} from "./interaction";
import type { KeyboardGrab } from "./keyboard-store";
import { CalendarResourcesContext } from "./resources";
import { useStateSelector } from "./state-binding";
import type { CalendarStateSelectorOptions } from "./types";

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

const DEFAULT_CREATE_DURATION: Temporal.DurationLike = { hours: 1 };

/** Handlers for the element that holds a view's focusable cells and events. */
export interface CalendarKeyboardHandlers {
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

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
  | { readonly phase: "reject"; readonly reason: string };

type CalendarCommitPlacement = Extract<
  CalendarInteractionUpdate,
  { readonly phase: "commit" }
>["proposed"];

function createKeyboardHandlers(
  { actions, announcements, keyboard, read }: CalendarInteractionRuntime,
  { getView, roving }: CalendarViewRuntime,
  getOptions: () => CalendarKeyboardOptions,
  getResources: () => ResourceTree | null,
): CalendarKeyboardHandlers {
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

  /** Navigates the view by whole ranges until it shows `date`. */
  function reveal(date: Temporal.PlainDate) {
    const { definition, environment, options, range } = view();
    if (plainDateIntervalContains(range, date)) return;
    const { anchorDate } = read();
    actions.setAnchorDate(
      anchorShowingDate(definition.strategy, anchorDate, date, environment, options),
    );
  }

  /** Moves the calendar's focus and, once the view renders it, DOM focus. */
  function moveFocus(focus: CalendarFocus | null) {
    if (sameFocus(focus, read().focus as CalendarFocus | null)) {
      roving.focusTabStop("now");
      return;
    }
    roving.focusTabStop("after-update");
    actions.setFocus(focus);
    if (focus !== null) reveal(focus.date);
  }

  function apply(result: CalendarSpatialNavigation | null): boolean {
    if (result === null) return false;
    if ("focus" in result) {
      moveFocus(result.focus);
    } else {
      const { definition, options } = view();
      // Focus enters the next range once it renders, from its end when paging back.
      roving.focusTabStop("after-update");
      if (result.page < 0) roving.enterFromEnd();
      actions.setAnchorDate(definition.strategy.navigate(read().anchorDate, result.page, options));
      actions.setFocus(null);
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
    return proposal === null ? null : actions.checkEventChange(proposal);
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

  function grab(focus: CalendarFocus, cause: "create" | "move" | "resize-end"): boolean {
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
      moveFocus(focusOfSession(session));
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

  function step(current: KeyboardGrab, command: CalendarNavigationCommand) {
    const cursor = cellOf(navigate(command, current.session.cursor));
    if (cursor === null) return;
    const session = moveKeyboardCursor(current.session, cursor, interactionOptions());
    if (session === current.session) return;
    const next = { ...current, check: checkOf(session), session };
    keyboard.set(next);
    moveFocus(focusOfSession(session));
    announce(next, { phase: "step" });
  }

  /** Grabs the other edge, starting the resize over from the event as it was. */
  function switchEdge(current: KeyboardGrab) {
    const { cell, event, session } = current;
    if (event === null || !session.cause.startsWith("resize")) return;
    const cause = session.cause === "resize-end" ? "resize-start" : "resize-end";
    const restarted = startKeyboardSession({ cause, cell, event }, interactionOptions());
    const next = { ...current, check: null, session: restarted };
    keyboard.set(next);
    moveFocus(focusOfSession(restarted));
    announce(next, { phase: "start" });
  }

  function cancel(current: KeyboardGrab) {
    keyboard.set(null);
    moveFocus(current.origin);
    announce(current, { phase: "cancel" });
  }

  function commit(current: KeyboardGrab) {
    const proposal = keyboardSessionProposal(current.session);
    if (proposal === null) {
      cancel(current);
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

    void actions.proposeEventChange(proposal).then((result) => {
      if (result.status === "committed") {
        const { eventId, proposed } = result.change;
        // A policy may have moved the event off the date focus is on.
        if (eventId !== null && proposed !== null && owned()) {
          const { cursor } = current.session;
          moveFocus({
            date: dateOn(proposed, cursor.date),
            eventId,
            kind: "event",
            resourceId: resourceOn(proposed, cursor.resourceId),
          });
        }
        announce(current, {
          phase: "commit",
          proposed: proposed!,
          warnings: result.change.warnings,
        });
      } else {
        if (owned()) moveFocus(current.origin);
        announce(current, { phase: "reject", reason: result.reason });
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

  function onGrabbedKey(current: KeyboardGrab, event: KeyboardEvent<HTMLElement>): boolean {
    const command = navigationKeys[event.key];
    if (command !== undefined) {
      step(current, command);
      return true;
    }
    switch (event.key) {
      case "Enter":
        commit(current);
        return true;
      case " ":
        if (event.shiftKey) switchEdge(current);
        else commit(current);
        return true;
      case "Escape":
        cancel(current);
        return true;
      case "Tab":
        cancel(current);
        return false;
      default:
        return false;
    }
  }

  function onIdleKey(focus: CalendarFocus | null, event: KeyboardEvent<HTMLElement>): boolean {
    const command = navigationKeys[event.key];
    if (command !== undefined) return !event.shiftKey && apply(navigate(command, focus));
    if (focus === null) return false;
    switch (event.key) {
      // Enter on an event is left to the element, which usually opens it.
      case "Enter":
        return focus.kind !== "event" && !event.shiftKey && apply(navigate("enter", focus));
      case "Escape":
        return focus.kind === "event" && apply(navigate("exit", focus));
      case " ":
        return grab(
          focus,
          focus.kind !== "event" ? "create" : event.shiftKey ? "resize-end" : "move",
        );
      default:
        return false;
    }
  }

  return Object.freeze({
    onBlur(event: FocusEvent<HTMLElement>) {
      if (keyboard.get() === null) return;
      const region = event.currentTarget;
      const next = event.relatedTarget;
      if (next !== null && region.contains(next)) return;
      // A grabbed event re-rendering in a new place blurs on its way; focus returns to it.
      setTimeout(() => {
        const current = keyboard.get();
        if (current !== null && !region.contains(document.activeElement)) cancel(current);
      });
    },
    onKeyDown(event: KeyboardEvent<HTMLElement>) {
      if (event.defaultPrevented || event.nativeEvent.isComposing) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const current = keyboard.get();
      const handled =
        current === null
          ? onIdleKey(roving.focusAt(event.target as Node), event)
          : onGrabbedKey(current, event);
      if (!handled) return;
      event.preventDefault();
      if (event.key === "Escape") event.stopPropagation();
    },
  });
}

/**
 * Keyboard navigation and keyboard move, resize, and create for a view; spread the handlers on
 * the element around its focusable cells and events (see `useRovingFocus`).
 *
 * - Arrow keys, Home, End, Page Up, and Page Down move focus through the view's
 *   `getSpatialNavigation`, navigating the view when focus leaves it. Enter moves into a cell's
 *   events and Escape back out.
 * - Space grabs the focused event to move it, or the focused cell to create an event there;
 *   Shift+Space grabs an event's end to resize it, and again switches to its start. Navigation
 *   keys then step the gesture, Enter or Space commits it through `proposeEventChange`, and
 *   Escape, Tab, or leaving the view cancels it.
 *
 * Every phase is announced through the root's `Announcer`.
 */
export function useCalendarKeyboard(
  options: CalendarKeyboardOptions = {},
): CalendarKeyboardHandlers {
  const interaction = useInteractionRuntime();
  const view = useViewRuntime();
  const resources = useContext(CalendarResourcesContext);
  const latest = useRef({ options, resources });
  useInsertionEffect(() => {
    latest.current = { options, resources };
  });
  const handlers = useMemo(
    () =>
      createKeyboardHandlers(
        interaction,
        view,
        () => latest.current.options,
        () => latest.current.resources,
      ),
    [interaction, view],
  );
  // A view that unmounts mid-gesture leaves nothing grabbed.
  const { keyboard } = interaction;
  useEffect(() => () => keyboard.set(null), [keyboard]);
  return handlers;
}

const selectSession = (session: CalendarKeyboardSession | null) => session;

/**
 * The keyboard gesture in progress, or `null` while idle. Pass a selector to re-render only when
 * its result changes, such as whether a cell is inside a create's range. The selector also gets
 * what the root's policies say about committing the gesture now, to show an invalid preview.
 */
export function useCalendarInteraction(): CalendarKeyboardSession | null;
export function useCalendarInteraction<TSelected>(
  selector: (session: CalendarKeyboardSession | null, check: CalendarInteractionCheck) => TSelected,
  options?: CalendarStateSelectorOptions<TSelected>,
): TSelected;
export function useCalendarInteraction<TSelected>(
  selector: (
    session: CalendarKeyboardSession | null,
    check: CalendarInteractionCheck,
  ) => TSelected = selectSession as never,
  options?: CalendarStateSelectorOptions<TSelected>,
): TSelected {
  return useStateSelector(
    useInteractionRuntime().keyboard.grabs,
    (grab) => selector(grab?.session ?? null, grab?.check ?? null),
    options,
  );
}

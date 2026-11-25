import {
  eventIdAttributes,
  useCalendarInteraction,
  useRovingFocus,
  type EventId,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { children, createMemo, omit, Show, untrack, type Accessor } from "solid-js";

import type { EventLabeler } from "@registry/calendar/event-label";
import { eventChipClass, eventIconClass } from "@registry/shared/calendar/event-chip.styles";
import { previewCheck, previewCheckAttributes } from "@registry/shared/calendar/preview-state";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { cn } from "cn";

export interface EventChipProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Sets `data-color`; without it the chip uses the theme's default event tokens. */
  readonly color?: CalendarEventColor;
  /** A change to the event is still being saved: the chip is dimmed and marked busy. */
  readonly pending?: boolean;
}

/** Base event surface shared by every view: tinted fill, accent edge, readable text. */
export function EventChip(props: EventChipProps) {
  const rest = omit(props, "class", "color", "pending", "type");
  return (
    <button
      aria-busy={props.pending === true ? "true" : undefined}
      data-slot="calendar-event"
      data-color={props.color}
      data-pending={props.pending === true ? "" : undefined}
      type={props.type ?? "button"}
      class={cn(eventChipClass, props.class)}
      {...rest}
    />
  );
}

export interface EventIconProps {
  /** What a view's `getEventIcon` returned for the event; nothing renders without an icon. */
  readonly children?: JSX.Element;
  readonly class?: string;
}

/**
 * The icon a view's `getEventIcon` gives an event, inline before its title, in the chip's text
 * colour; size it for the chip's text through `class`. It's decorative and hidden from assistive
 * technology, as the event's accessible name says what it means.
 */
export function EventIcon(props: EventIconProps) {
  const icon = children(() => props.children);
  const shown = () => {
    const value = icon();
    return value != null && typeof value !== "boolean" && value !== "";
  };
  return (
    <Show when={shown()}>
      <span
        aria-hidden="true"
        data-slot="calendar-event-icon"
        class={cn(eventIconClass, props.class)}
      >
        {icon()}
      </span>
    </Show>
  );
}

export interface EventChipFocusOptions<TEvent> {
  /** The first date this element shows the event on. */
  readonly date: Temporal.PlainDate;
  /** Dates the element covers from `date`, such as a month bar's span. */
  readonly days?: number;
  /** Whether the element is one of the view's focus targets; a copy in a list is not. */
  readonly focusTarget?: boolean;
  readonly labelEvent: EventLabeler<TEvent>;
  /**
   * Rendered beside the visible dates of a scrolling view, ready to scroll into view: neither a
   * focus target nor in the tab order, so the visible dates keep the view's tab stop.
   */
  readonly offscreen?: boolean;
  /** The resource this copy shows in, in a view with a copy per resource. */
  readonly resourceId?: ResourceId | null;
}

/**
 * Props that make an `EventChip` one of its view's focus targets: the event's ID attributes, its
 * roving tab stop unless `focusTarget` is false or it is `offscreen`, its accessible name, whether
 * a keyboard gesture has grabbed it, and whether the policies would reject or flag where it is
 * going, or a change is still saving. Spread them on the
 * chip: `<EventChip {...chip}>`. They are getters, so they follow `event` and `options`; the
 * event's ID is read once, as an element shows one event.
 */
export function useEventChip<TEvent>(
  event: Accessor<NormalizedCalendarEvent<TEvent, EventId, ResourceId>>,
  options: Accessor<EventChipFocusOptions<TEvent>>,
) {
  const id = untrack(event).id;
  const grabbed = useCalendarInteraction((session) => session?.eventId === id);
  const check = useCalendarInteraction((session, answer) =>
    session?.eventId === id ? previewCheck(answer) : undefined,
  );
  // A grabbed event previews as pending, but nothing is saving until the gesture commits.
  const pending = () => event().isPending === true && !grabbed();
  const target = () => options().offscreen !== true && options().focusTarget !== false;
  let element: HTMLElement | undefined;
  // The element joins the view's roving focus only while it is a focus target; leaving it, as a
  // copy that scrolls off screen does, releases its place.
  const roving = createMemo(() => {
    if (!target()) return null;
    const own = useRovingFocus(
      () => ({
        date: options().date,
        eventId: id,
        kind: "event",
        resourceId: options().resourceId,
      }),
      () => ({ days: options().days ?? 1 }),
    );
    if (element !== undefined) own.ref(element);
    return own;
  });

  return {
    ...eventIdAttributes(id),
    onFocus: (event: FocusEvent) => {
      untrack(roving)?.onFocus(event);
    },
    ref: (node: HTMLElement) => {
      element = node;
      untrack(roving)?.ref(node);
    },
    get tabindex() {
      const own = roving();
      return own !== null ? own.tabindex : options().offscreen === true ? -1 : undefined;
    },
    get "aria-label"() {
      return options().labelEvent({ ...event(), isPending: pending() });
    },
    get "data-grabbed"() {
      return grabbed() ? "" : undefined;
    },
    get "data-invalid"() {
      return previewCheckAttributes(check())["data-invalid"];
    },
    get "data-warning"() {
      return previewCheckAttributes(check())["data-warning"];
    },
    get pending() {
      return pending();
    },
  };
}

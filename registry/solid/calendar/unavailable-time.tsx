import type { CalendarResource, ClosedTime, ResourceId } from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { unavailableBand } from "@registry/shared/calendar/unavailable-band";
import { unavailableTimeClass } from "@registry/shared/calendar/unavailable-time.styles";
import { cn } from "cn";

/** What a view's `renderUnavailable` gets about one stretch of closed time. */
export interface UnavailableTimeState {
  /** Why it's closed, its exception's label, and whether open time meets either end. */
  readonly band: ClosedTime;
  /** The date of the column it's in, or along a timeline the date it starts on. */
  readonly date: Temporal.PlainDate;
  /** The resource whose hours these are; `null` for the calendar's own. */
  readonly resource: CalendarResource<unknown, ResourceId> | null;
}

/**
 * Replaces the shading of closed time: a function of its props and state that returns the element
 * to draw in its place, such as a tint for rooms. Spread the props on your element; they place it
 * and keep it `aria-hidden`.
 */
export type UnavailableTimeRender = (
  props: JSX.HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>,
  state: UnavailableTimeState,
) => JSX.Element;

export interface UnavailableTimeProps extends UnavailableTimeState {
  readonly class: string;
  /** Where it starts and ends along the column or row, as fractions of it. */
  readonly end: number;
  readonly render?: UnavailableTimeRender;
  readonly slot: string;
  readonly start: number;
  readonly style?: JSX.CSSProperties;
}

/**
 * One stretch of closed time, behind events. Screen readers hear it in the names of the cells it
 * covers instead, so it is hidden from them. `data-reason`, `data-label`, `data-opens-before`,
 * `data-opens-after`, `--band-start` and `--band-end` let CSS style it, such as a gradient that
 * fades into open time.
 */
export function UnavailableTime(props: UnavailableTimeProps) {
  const own = () => {
    const { attributes, variables } = unavailableBand(
      props.band,
      props.slot,
      props.start,
      props.end,
    );
    return {
      ...attributes,
      "aria-hidden": "true" as const,
      class: cn(unavailableTimeClass, props.class),
      style: { ...variables, ...props.style },
    };
  };
  // Show runs its child once, untracked: the render is an expression in it, so it runs again when
  // the band or its place changes, as React's does.
  return (
    <Show when={props.render} fallback={<div {...own()} />}>
      {(render) => (
        <>
          {render()(own(), {
            get band() {
              return props.band;
            },
            get date() {
              return props.date;
            },
            get resource() {
              return props.resource;
            },
          })}
        </>
      )}
    </Show>
  );
}

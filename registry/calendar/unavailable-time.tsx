"use client";

import type { CalendarResource, ClosedTime, ResourceId } from "@moltenship/calendar";
import type { CSSProperties, HTMLAttributes, ReactElement } from "react";

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
  props: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | undefined>,
  state: UnavailableTimeState,
) => ReactElement;

export interface UnavailableTimeProps extends UnavailableTimeState {
  readonly className: string;
  /** Where it starts and ends along the column or row, as fractions of it. */
  readonly end: number;
  readonly render?: UnavailableTimeRender;
  readonly slot: string;
  readonly start: number;
  readonly style?: CSSProperties;
}

const percent = (fraction: number) => `${fraction * 100}%`;

/**
 * One stretch of closed time, behind events. Screen readers hear it in the names of the cells it
 * covers instead, so it is hidden from them. `data-reason`, `data-label`, `data-opens-before`,
 * `data-opens-after`, `--band-start` and `--band-end` let CSS style it, such as a gradient that
 * fades into open time.
 */
export function UnavailableTime({
  band,
  className,
  date,
  end,
  render,
  resource,
  slot,
  start,
  style,
}: UnavailableTimeProps) {
  const props = {
    "aria-hidden": true,
    className: cn("pointer-events-none absolute", className),
    "data-label": band.label,
    "data-opens-after": band.opensAfter ? "" : undefined,
    "data-opens-before": band.opensBefore ? "" : undefined,
    "data-reason": band.reason,
    "data-slot": slot,
    style: {
      "--band-end": percent(end),
      "--band-start": percent(start),
      ...style,
    } as CSSProperties,
  };
  return render === undefined ? <div {...props} /> : render(props, { band, date, resource });
}

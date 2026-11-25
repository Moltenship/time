import {
  plainDateIntervalContains,
  type ClosedDate,
  type ClosedTime,
  type EventDayFragment,
  type EventId,
  type PlainDateInterval,
  type ResourceId,
  type YearDay,
  type YearMonth,
  type YearProjection,
  type YearWeek,
} from "@moltenship/calendar";

/**
 * The year's layout, one place for every framework's markup: which closed days are shaded, a
 * day's dots, the days by date, and keeping the month the user is after in view.
 */

/**
 * Which closed days the year shades: the dates an exception closes, such as holidays, those and
 * the weekly ones too, such as weekends, or none. A closed day's name says "closed" either way.
 */
export type YearClosedDays = "all" | "exceptions" | "none";

/** Where a shaded day sits in its row's run of shaded days, which the shading rounds the ends of. */
export interface YearShade {
  readonly band: ClosedDate & ClosedTime;
  /** The run starts on this day: the day before it in the row isn't shaded. */
  readonly first: boolean;
  /** The run ends on this day. */
  readonly last: boolean;
}

/** A day of a week row: whether it's closed, and its shading when the year shades it. */
export interface YearClosedDay {
  /** Set when the day has no working hours. */
  readonly closed: ClosedDate | undefined;
  /** Set when the view shades this closed day. */
  readonly shade: YearShade | undefined;
}

type Week<TEvent> = YearWeek<TEvent, EventId, ResourceId>;

/**
 * The closed days of a week row by column, and the shading of those `shadeClosedDays` picks: a
 * shaded day's band opens where its row has an open day beside it.
 */
export function closedDaysOf(
  week: Week<unknown>,
  closed: ReadonlyMap<string, ClosedDate>,
  shadeClosedDays: YearClosedDays,
): readonly YearClosedDay[] {
  const closedOn = (column: number) => {
    const day = week.days[column];
    return day == null ? undefined : closed.get(day.date.toString());
  };
  const isShaded = (column: number) => {
    const day = closedOn(column);
    return (
      day !== undefined &&
      (shadeClosedDays === "all" ||
        (shadeClosedDays === "exceptions" && day.reason === "exception"))
    );
  };
  const isOpen = (column: number) => week.days[column] != null && closedOn(column) === undefined;
  const last = week.days.length - 1;
  return week.days.map((_, column) => {
    const date = closedOn(column);
    return {
      closed: date,
      shade:
        date === undefined || !isShaded(column)
          ? undefined
          : {
              band: {
                ...date,
                opensAfter: column < last && isOpen(column + 1),
                opensBefore: column > 0 && isOpen(column - 1),
              },
              first: column === 0 || !isShaded(column - 1),
              last: column === last || !isShaded(column + 1),
            },
    };
  });
}

/** The most event colours a day shows as dots. */
export const MAX_DOTS = 3;

/** The day's event colours in display order, each once; `undefined` is the theme's default. */
export function dotColors<TEvent, TColor>(
  fragments: readonly EventDayFragment<TEvent, EventId, ResourceId>[],
  getEventColor: ((event: TEvent) => TColor) | undefined,
): readonly (TColor | undefined)[] {
  const colors: (TColor | undefined)[] = [];
  for (const { event } of fragments) {
    const color = getEventColor?.(event.event);
    if (!colors.includes(color)) colors.push(color);
    if (colors.length === MAX_DOTS) break;
  }
  return colors;
}

/** The seven dates of a month's weekday header, from its first week's start. */
export function weekdaysOf(month: YearMonth<unknown, EventId, ResourceId>): Temporal.PlainDate[] {
  return Array.from({ length: 7 }, (_, index) => month.weeks[0]!.range.start.add({ days: index }));
}

/** The year's days by ISO date, so the popover shows a day's events as they are now. */
export function yearDaysByDate<TEvent>(
  projection: YearProjection<TEvent, EventId, ResourceId>,
): ReadonlyMap<string, YearDay<TEvent, EventId, ResourceId>> {
  const byDate = new Map<string, YearDay<TEvent, EventId, ResourceId>>();
  for (const month of projection.months) {
    for (const week of month.weeks) {
      for (const day of week.days) if (day !== null) byDate.set(day.date.toString(), day);
    }
  }
  return byDate;
}

/** All-day and multi-day events show as filled bars in a day's list; others as a dot. */
export function isBarFragment(fragment: EventDayFragment<unknown, EventId, ResourceId>): boolean {
  const { event } = fragment;
  return event.kind === "all-day" || fragment.startsBeforeDay || fragment.endsAfterDay;
}

/** A key for an event in a day's list: `typeof` keeps numeric 1 and string "1" apart. */
export function eventKey(fragment: EventDayFragment<unknown, EventId, ResourceId>): string {
  return `${typeof fragment.event.id}:${fragment.event.id}`;
}

/** The ID of the popover trigger in `date`'s cell, under the view's own `prefix`. */
export function triggerIdOf(prefix: string, date: Temporal.PlainDate): string {
  return `${prefix}${date.toString()}`;
}

/** The cell of `date` in the view: the view's tab stop, where the popover returns focus. */
export function dayCellOf(
  view: HTMLElement | null | undefined,
  date: Temporal.PlainDate,
): HTMLElement | null {
  return (
    view?.querySelector<HTMLElement>(`[role="gridcell"][data-date="${date.toString()}"]`) ?? null
  );
}

/** Room left above a month scrolled into view, so its name doesn't touch the edge. */
export const SCROLL_MARGIN = 12;

function prefersReducedMotion(element: Element): boolean {
  return (
    element.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ===
    true
  );
}

/**
 * Scrolls the view, and never the page around it, until `date`'s month shows from its top, as
 * where months stack on a phone. A month already in view stays where it is.
 */
export function showMonth(view: HTMLElement, date: Temporal.PlainDate, behavior: ScrollBehavior) {
  const month = view.querySelector(`[data-month="${date.toPlainYearMonth().toString()}"]`);
  if (month === null) return;
  const bounds = view.getBoundingClientRect();
  const { bottom, top } = month.getBoundingClientRect();
  if (top >= bounds.top && bottom <= bounds.bottom) return;
  const position = view.scrollTop + top - bounds.top - SCROLL_MARGIN;
  if (typeof view.scrollTo === "function") view.scrollTo({ behavior, top: position });
  else view.scrollTop = position;
}

/**
 * Keeps the month the user is after in view: the date Today, Previous, Next or a picked date asks
 * for, smoothly within the year, and when a year opens, the day keyboard focus would enter on.
 * Keys that move focus into another year leave it to focus, which brings its day into view. Each
 * framework calls `request` from `useAnchorDateRequests` and `yearShown` once each year renders.
 */
export interface MonthInView {
  /** Something asked for `date`; `shown` is the range the view on screen shows for it. */
  request(
    view: HTMLElement | null | undefined,
    date: Temporal.PlainDate,
    shown: PlainDateInterval | null,
    range: PlainDateInterval,
  ): void;
  /** The year `range` has rendered: show the date asked for, or the day focus would enter on. */
  yearShown(view: HTMLElement | null | undefined, range: PlainDateInterval): void;
}

export function createMonthInView(): MonthInView {
  let requested: Temporal.PlainDate | null = null;
  return {
    request(view, date, shown, range) {
      if (view == null) return;
      // Keys move focus within the year without asking for a date, so this is Today or a pick.
      if (shown?.start.equals(range.start) === true) {
        showMonth(view, date, prefersReducedMotion(view) ? "instant" : "smooth");
      } else {
        // Shown once the new year renders.
        requested = date;
      }
    },
    yearShown(view, range) {
      const date = requested;
      requested = null;
      if (view == null || view.contains(view.ownerDocument.activeElement)) return;
      const entry = view
        .querySelector('[role="gridcell"][tabindex="0"]')
        ?.getAttribute("data-date");
      const target =
        date !== null && plainDateIntervalContains(range, date)
          ? date
          : entry == null
            ? null
            : Temporal.PlainDate.from(entry);
      if (target !== null) showMonth(view, target, "instant");
    },
  };
}

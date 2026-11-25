import type {
  CalendarAnnotationSource,
  TimeGridAnnotationMark,
  TimeGridBand,
} from "@moltenship/calendar";

import type { EventInset } from "./time-grid-geometry";

/*
 * Where the time grid draws the root's annotations, one place for every framework's markup: the
 * rail's size, the marks' lanes, and which events move aside for them.
 */

/** The rail's size and lanes, in px. The layout needs them as numbers to merge and pack marks. */
export interface TimeGridAnnotationRail {
  /** The column edge the rail sits on. */
  readonly side?: "start" | "end";
  /** 18 in a multi-day grid and 30 in a single day by default. */
  readonly width?: number;
  /** 12 and 20 by default. A mark is never shorter than it is wide, so a short one is a circle. */
  readonly markWidth?: number;
  /** `pack` shares the rail between overlapping marks; `per-source` gives each source a lane. */
  readonly layout?: "pack" | "per-source";
}

export type ResolvedAnnotationRail = Required<TimeGridAnnotationRail>;

/** `rail` draws marks in a strip beside events; `overlay` gives them the whole column. */
export type AnnotationPlacement = "rail" | "overlay";

/** What the rail's geometry needs from a grid's annotation layout. */
export interface AnnotationGeometry {
  readonly enabled: boolean;
  /** The shortest a mark draws, as a fraction of the day; 0 for an overlay. */
  readonly minHeight: number;
  readonly placement: AnnotationPlacement;
  readonly rail: ResolvedAnnotationRail;
}

/** Px an event keeps free at each side of the column's event area, for the rail. */
export type AnnotationEventInset = EventInset;

/** The registry's default `--calendar-hour-height` (3rem) over a day, until the grid is measured. */
export const DEFAULT_COLUMN_HEIGHT = 24 * 48;
/** Marks of one source closer than this many px merge, so they never touch. */
const MIN_GAP_PX = 3;
/** Space between the rail's edges and its lanes. */
const RAIL_PADDING = 2;
/** Narrower marks drop their icon. */
export const MIN_ICON_WIDTH = 10;
/** The strip the event area already keeps free at its end, for creating beside busy blocks. */
const CREATE_STRIP = 8;
/** Bands this close, as fractions of a day, meet rather than overlap, as in the event layout. */
const EDGE_TOLERANCE = 1e-9;

/** The rail's options with their defaults, which depend on whether the grid shows several days. */
export function resolveRail(
  rail: TimeGridAnnotationRail | undefined,
  dense: boolean,
): ResolvedAnnotationRail {
  return {
    layout: rail?.layout ?? "pack",
    markWidth: rail?.markWidth ?? (dense ? 12 : 20),
    side: rail?.side ?? "start",
    width: rail?.width ?? (dense ? 18 : 30),
  };
}

/**
 * The marks' shortest height and the gap below which a source's marks merge, as fractions of a
 * column `columnHeight` px tall. An overlay draws marks at their true length and never merges them.
 */
export function annotationMarkSizes(
  placement: AnnotationPlacement,
  markWidth: number,
  columnHeight: number,
): { readonly minGap: number; readonly minHeight: number } {
  return placement === "overlay"
    ? { minGap: 0, minHeight: 0 }
    : { minGap: MIN_GAP_PX / columnHeight, minHeight: markWidth / columnHeight };
}

/** What the rail takes from the events beside its marks; `undefined` when it takes nothing. */
export function annotationEventInset(layout: AnnotationGeometry): AnnotationEventInset | undefined {
  if (!layout.enabled || layout.placement === "overlay") return undefined;
  return layout.rail.side === "start"
    ? { end: 0, start: layout.rail.width }
    : { end: Math.max(0, layout.rail.width + 2 - CREATE_STRIP), start: 0 };
}

/**
 * Whether a band crosses one of the column's marks as the rail draws it: never shorter than the
 * layout's `minHeight`, and drawn up from the day's end when too close to midnight to fit.
 */
export function bandBesideMarks(
  layout: AnnotationGeometry,
  marks: readonly TimeGridAnnotationMark[],
  { height, top }: TimeGridBand,
): boolean {
  return marks.some((mark) => {
    const from = Math.min(mark.top, 1 - layout.minHeight);
    const to = Math.max(mark.top + mark.height, from + layout.minHeight);
    return top < to - EDGE_TOLERANCE && from < top + height - EDGE_TOLERANCE;
  });
}

/**
 * Which of a column's events move aside for the rail. Overlapping events form groups as the
 * event layout groups them, and a group moves as one when any of its events is beside a mark, so
 * its events keep their places beside each other. Every other event keeps the column's width.
 */
export function eventsBesideMarks(
  layout: AnnotationGeometry,
  marks: readonly TimeGridAnnotationMark[],
  events: readonly TimeGridBand[],
): readonly boolean[] {
  const moved = events.map(() => false);
  if (marks.length === 0) return moved;
  const order = events.map((_, index) => index).sort((a, b) => events[a]!.top - events[b]!.top);
  let group: number[] = [];
  let bottom = -Infinity;
  const place = () => {
    if (group.some((index) => bandBesideMarks(layout, marks, events[index]!))) {
      for (const index of group) moved[index] = true;
    }
  };
  for (const index of order) {
    const { height, top } = events[index]!;
    if (bottom <= top + EDGE_TOLERANCE) {
      place();
      group = [];
    }
    group.push(index);
    bottom = Math.max(bottom, top + height);
  }
  place();
  return moved;
}

/** A mark's width and its offset from the rail's start, in px, within its lane. */
export function markPlacement(
  rail: ResolvedAnnotationRail,
  mark: TimeGridAnnotationMark,
): { readonly offset: number; readonly width: number } {
  const laneWidth = (rail.width - RAIL_PADDING * 2) / mark.lanes;
  const width = Math.max(
    2,
    Math.min(rail.markWidth, Math.floor(laneWidth) - (mark.lanes > 1 ? 1 : 0)),
  );
  return { offset: RAIL_PADDING + mark.lane * laneWidth + (laneWidth - width) / 2, width };
}

/** A mark's geometry as the CSS variables its classes read. */
export function markVariables(
  mark: TimeGridAnnotationMark,
  { offset, width }: { readonly offset: number; readonly width: number },
): Record<"--mark-height" | "--mark-offset" | "--mark-top" | "--mark-width", string> {
  return {
    "--mark-height": `${mark.height * 100}%`,
    "--mark-offset": `${offset}px`,
    "--mark-top": `${mark.top * 100}%`,
    "--mark-width": `${width}px`,
  };
}

/**
 * A source's `color`, one of the theme's `colors`, and its `Icon`, when they are valid. Sources
 * reach the view through the root as plain `CalendarAnnotationSource`s, so the fields are checked
 * rather than assumed: an icon is a function component, or a React memo or forwardRef object.
 */
export function annotationSourceStyle<Color extends string, Icon>(
  source: CalendarAnnotationSource,
  colors: readonly Color[],
): { readonly color?: Color; readonly Icon?: Icon } {
  const { color, Icon } = source as { readonly color?: unknown; readonly Icon?: unknown };
  return {
    color: colors.find((known) => known === color),
    Icon:
      typeof Icon === "function" || (typeof Icon === "object" && Icon !== null)
        ? (Icon as Icon)
        : undefined,
  };
}

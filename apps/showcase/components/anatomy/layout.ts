type AnatomySide = "top" | "right" | "bottom" | "left";

export interface AnatomyCallout {
  /** The part in words, such as "Day cell". */
  readonly label: string;
  /** The part's name in code: a component, prop, or attribute such as `data-date`. */
  readonly name?: string;
  /** The point on the part the line ends at, in figure units. */
  readonly anchor: readonly [x: number, y: number];
  /** The side of the figure the label sits on. */
  readonly side: AnatomySide;
  /** Top and bottom labels: which way the text runs from the line. Centered by default. */
  readonly align?: "start" | "center" | "end";
  /** Top and bottom labels: rows of extra distance, to stagger neighbours. */
  readonly row?: number;
  /** Draws a bracket this long along the side, centered on the anchor, instead of a dot. */
  readonly span?: number;
}

export interface AnatomyBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PlacedCallout {
  readonly callout: AnatomyCallout;
  /** The leader line, from the label to the part or bracket. */
  readonly line: readonly [x1: number, y1: number, x2: number, y2: number];
  readonly bracket?: string;
  /** Where the first line of text sits: its center, or its start or end edge. */
  readonly text: { readonly x: number; readonly y: number; readonly anchor: TextAnchor };
  /** The label's bounding box. */
  readonly box: AnatomyBox;
}

type TextAnchor = "start" | "middle" | "end";

/**
 * How labels are sized and spaced. Wide figures show the label and name as text; narrow ones show
 * a numbered badge in the same place, so the lines stay and the schematic stays uncovered.
 */
interface LabelMetrics {
  /** Space between the figure and its labels. */
  readonly gap: number;
  /** Space between a label and the start of its line. */
  readonly lineGap: number;
  /** Height of one staggered row of top or bottom labels. */
  readonly rowHeight: number;
  /** Distance from the top of a label to the middle of its first line. */
  readonly lead: number;
  readonly size: (callout: AnatomyCallout) => { readonly width: number; readonly height: number };
}

/** Distance between the label line and the name line under it. */
export const NAME_OFFSET = 15;
/** Generous average glyph width for the label and name sizes, used to reserve room for labels. */
const CHAR_WIDTH = 6.9;
/** Half the height of a line of label text. */
const HALF_LINE = 8;
/** Badge diameter in figure units, at the scale narrow screens show figures. */
const BADGE_SIZE = 28;
/** Distance of a bracket from the figure, and the length of its end ticks. */
const BRACKET_OFFSET = 6;
const BRACKET_TICK = 4;
const PADDING = 8;

const textMetrics: LabelMetrics = {
  gap: 16,
  lineGap: 4,
  rowHeight: 38,
  lead: HALF_LINE,
  size: ({ label, name }) => ({
    width: Math.ceil(Math.max(label.length, name?.length ?? 0) * CHAR_WIDTH),
    height: 2 * HALF_LINE + (name === undefined ? 0 : NAME_OFFSET),
  }),
};

const badgeMetrics: LabelMetrics = {
  gap: 12,
  lineGap: 0,
  rowHeight: BADGE_SIZE + 4,
  lead: BADGE_SIZE / 2,
  size: () => ({ width: BADGE_SIZE, height: BADGE_SIZE }),
};

function bracketPath(side: AnatomySide, [x, y]: readonly [number, number], span: number): string {
  const half = span / 2;
  switch (side) {
    case "left":
      return `M${x + BRACKET_TICK},${y - half} H${x} V${y + half} H${x + BRACKET_TICK}`;
    case "right":
      return `M${x - BRACKET_TICK},${y - half} H${x} V${y + half} H${x - BRACKET_TICK}`;
    case "top":
      return `M${x - half},${y + BRACKET_TICK} V${y} H${x + half} V${y + BRACKET_TICK}`;
    case "bottom":
      return `M${x - half},${y - BRACKET_TICK} V${y} H${x + half} V${y - BRACKET_TICK}`;
  }
}

function placeSideways(
  callout: AnatomyCallout,
  width: number,
  metrics: LabelMetrics,
): PlacedCallout {
  const [x, y] = callout.anchor;
  const left = callout.side === "left";
  const direction = left ? -1 : 1;
  const edge = left ? 0 : width;
  const near = edge + direction * metrics.gap;
  const bracketX = edge + direction * BRACKET_OFFSET;
  const size = metrics.size(callout);

  return {
    callout,
    line: [near - direction * metrics.lineGap, y, callout.span === undefined ? x : bracketX, y],
    bracket:
      callout.span === undefined
        ? undefined
        : bracketPath(callout.side, [bracketX, y], callout.span),
    text: { x: near, y, anchor: left ? "end" : "start" },
    box: { x: left ? near - size.width : near, y: y - metrics.lead, ...size },
  };
}

function placeVertically(
  callout: AnatomyCallout,
  height: number,
  metrics: LabelMetrics,
): PlacedCallout {
  const [x, y] = callout.anchor;
  const top = callout.side === "top";
  const size = metrics.size(callout);
  const distance = metrics.gap + (callout.row ?? 0) * metrics.rowHeight;
  // The label's edge nearest the figure.
  const near = top ? -distance : height + distance;
  const boxY = top ? near - size.height : near;
  const bracketY = top ? -BRACKET_OFFSET : height + BRACKET_OFFSET;
  const align = callout.align ?? "center";
  const anchor: TextAnchor = align === "center" ? "middle" : align;
  const boxX = align === "start" ? x : align === "end" ? x - size.width : x - size.width / 2;

  return {
    callout,
    line: [
      x,
      near + (top ? metrics.lineGap : -metrics.lineGap),
      x,
      callout.span === undefined ? y : bracketY,
    ],
    bracket:
      callout.span === undefined
        ? undefined
        : bracketPath(callout.side, [x, bracketY], callout.span),
    text: { x, y: boxY + metrics.lead, anchor },
    box: { x: boxX, y: boxY, ...size },
  };
}

/**
 * Places each callout's label, line, and bracket around a `width` × `height` figure: as text, or
 * as a numbered badge where the figure is too small for text.
 */
export function placeCallouts(
  width: number,
  height: number,
  callouts: readonly AnatomyCallout[],
  labels: "text" | "badges",
): readonly PlacedCallout[] {
  const metrics = labels === "text" ? textMetrics : badgeMetrics;
  return callouts.map((callout) => {
    if (callout.side === "left" || callout.side === "right") {
      return placeSideways(callout, width, metrics);
    }
    // Badges are round, so they center on their line whatever the label alignment.
    return placeVertically(
      labels === "text" ? callout : { ...callout, align: "center" },
      height,
      metrics,
    );
  });
}

/** The smallest box around the figure and every label, with a little padding. */
export function calloutViewBox(
  width: number,
  height: number,
  placed: readonly PlacedCallout[],
): AnatomyBox {
  const boxes = [{ x: 0, y: 0, width, height }, ...placed.map(({ box }) => box)];
  const minX = Math.min(...boxes.map((box) => box.x)) - PADDING;
  const minY = Math.min(...boxes.map((box) => box.y)) - PADDING;
  const maxX = Math.max(...boxes.map((box) => box.x + box.width)) + PADDING;
  const maxY = Math.max(...boxes.map((box) => box.y + box.height)) + PADDING;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

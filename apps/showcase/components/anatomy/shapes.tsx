import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import type { ReactNode, SVGProps } from "react";

/** Radii per corner: top left, top right, bottom right, bottom left. */
type Corners = readonly [number, number, number, number];

/** A rectangle path with its own radius per corner, so continued edges can stay square. */
function roundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  [topLeft, topRight, bottomRight, bottomLeft]: Corners,
): string {
  return [
    `M${x + topLeft},${y}`,
    `H${x + width - topRight}`,
    `A${topRight},${topRight} 0 0 1 ${x + width},${y + topRight}`,
    `V${y + height - bottomRight}`,
    `A${bottomRight},${bottomRight} 0 0 1 ${x + width - bottomRight},${y + height}`,
    `H${x + bottomLeft}`,
    `A${bottomLeft},${bottomLeft} 0 0 1 ${x},${y + height - bottomLeft}`,
    `V${y + topLeft}`,
    `A${topLeft},${topLeft} 0 0 1 ${x + topLeft},${y}`,
    "Z",
  ].join(" ");
}

/** A view's surface: the background and border the registry views sit on. */
export function Surface(props: SVGProps<SVGRectElement>) {
  return (
    <rect
      rx={12}
      className="fill-background stroke-border"
      vectorEffect="non-scaling-stroke"
      {...props}
    />
  );
}

/** A 1px grid line, as drawn by `border-calendar-grid`. */
export function GridLine(props: SVGProps<SVGLineElement>) {
  return <line className="stroke-calendar-grid" vectorEffect="non-scaling-stroke" {...props} />;
}

interface EventShapeProps {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: CalendarEventColor;
  readonly corners: Corners;
  /** The 3px accent edge of `EventChip`; month bars drop it where they continue a week. */
  readonly accent?: boolean;
  /** The 1px background ring time-grid events use to stay apart where they overlap. */
  readonly ring?: boolean;
  /** Text and icons, drawn in the event's foreground colour. */
  readonly children?: ReactNode;
}

/** `EventChip`'s surface: tinted fill, accent edge, and per-corner radii from the view. */
export function EventShape({
  accent = true,
  children,
  color,
  corners,
  height,
  ring = false,
  width,
  x,
  y,
}: EventShapeProps) {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners;

  return (
    <g data-color={color} className="fill-calendar-event-foreground">
      <path
        d={roundedRect(x, y, width, height, corners)}
        className={`${accent ? "fill-calendar-event-border" : "fill-calendar-event"} ${ring ? "stroke-background" : ""}`}
        vectorEffect="non-scaling-stroke"
      />
      {accent && (
        <path
          d={roundedRect(x + 3, y, width - 3, height, [
            Math.max(0, topLeft - 3),
            topRight,
            bottomRight,
            Math.max(0, bottomLeft - 3),
          ])}
          className="fill-calendar-event"
        />
      )}
      {children}
    </g>
  );
}

/** A Lucide-style chevron centered on (`x`, `y`). */
export function Chevron({
  className,
  direction,
  size,
  x,
  y,
}: {
  /** The stroke colour, such as `stroke-foreground`. */
  readonly className: string;
  readonly direction: "left" | "right" | "down";
  readonly size: number;
  readonly x: number;
  readonly y: number;
}) {
  const half = size / 2;
  const quarter = size / 4;
  const d =
    direction === "down"
      ? `M${x - half},${y - quarter} L${x},${y + quarter} L${x + half},${y - quarter}`
      : direction === "left"
        ? `M${x + quarter},${y - half} L${x - quarter},${y} L${x + quarter},${y + half}`
        : `M${x - quarter},${y - half} L${x + quarter},${y} L${x - quarter},${y + half}`;

  return (
    <path
      d={d}
      className={`fill-none ${className}`}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

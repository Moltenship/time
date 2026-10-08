import type { ComponentProps, ReactNode } from "react";

import {
  calloutViewBox,
  NAME_OFFSET,
  placeCallouts,
  type AnatomyBox,
  type AnatomyCallout,
  type PlacedCallout,
} from "./layout";

export interface AnatomyProps {
  /** Accessible name of the figure, such as "Parts of the month view". */
  readonly label: string;
  /** Size of the schematic, in SVG units. */
  readonly width: number;
  readonly height: number;
  readonly callouts: readonly AnatomyCallout[];
  /** The schematic, drawn as SVG from (0, 0) to (`width`, `height`). */
  readonly children: ReactNode;
}

function viewBoxAttribute({ x, y, width, height }: AnatomyBox): string {
  return `${x} ${y} ${width} ${height}`;
}

/** The leader line, ending in a dot on the part or a bracket along it. */
function Leader({ bracket, line: [x1, y1, x2, y2] }: PlacedCallout) {
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        className="stroke-fd-muted-foreground/70"
        vectorEffect="non-scaling-stroke"
      />
      {bracket === undefined ? (
        <circle cx={x2} cy={y2} r={2.75} className="fill-fd-muted-foreground" />
      ) : (
        <path
          d={bracket}
          className="fill-none stroke-fd-muted-foreground/70"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </g>
  );
}

function Label({ callout: { label, name }, text }: PlacedCallout) {
  return (
    <g>
      <text
        x={text.x}
        y={text.y}
        textAnchor={text.anchor}
        dominantBaseline="central"
        fontSize={13}
        className="fill-fd-foreground italic"
      >
        {label}
      </text>
      {name !== undefined && (
        <text
          x={text.x}
          y={text.y + NAME_OFFSET}
          textAnchor={text.anchor}
          dominantBaseline="central"
          fontSize={11.5}
          className="fill-fd-muted-foreground font-mono"
        >
          {name}
        </text>
      )}
    </g>
  );
}

function Badge({ className = "", ...props }: ComponentProps<"span">) {
  return (
    <span
      className={`flex size-5 shrink-0 items-center justify-center rounded-full bg-fd-foreground text-[0.6875rem] font-semibold text-fd-background tabular-nums ${className}`}
      {...props}
    />
  );
}

/** Percentage of `size` that `value` sits at from `start`, for placing HTML over a view box. */
function percent(value: number, start: number, size: number): string {
  return `${((value - start) / size) * 100}%`;
}

/**
 * A schematic with labelled callouts, in the style of React Aria's anatomy diagrams. Wide
 * containers label each line with the part's name; narrow ones number the lines and list the
 * parts below. The list is always in the accessibility tree, so the parts read as text.
 */
export function Anatomy({ callouts, children, height, label, width }: AnatomyProps) {
  const labelled = placeCallouts(width, height, callouts, "text");
  const numbered = placeCallouts(width, height, callouts, "badges");
  const wide = calloutViewBox(width, height, labelled);
  const narrow = calloutViewBox(width, height, numbered);

  return (
    <figure aria-label={label} className="not-prose @container my-6">
      <div className="rounded-xl border bg-fd-card p-2 @min-[40rem]:p-4">
        <svg
          aria-hidden
          viewBox={viewBoxAttribute(wide)}
          className="mx-auto hidden w-full @min-[40rem]:block"
          style={{ maxWidth: wide.width }}
        >
          {children}
          {labelled.map((placed) => (
            <g key={placed.callout.label}>
              <Leader {...placed} />
              <Label {...placed} />
            </g>
          ))}
        </svg>
        <div className="relative @min-[40rem]:hidden">
          <svg aria-hidden viewBox={viewBoxAttribute(narrow)} className="block w-full">
            {children}
            {numbered.map((placed) => (
              <Leader key={placed.callout.label} {...placed} />
            ))}
          </svg>
          {numbered.map(({ box, callout }, index) => (
            <Badge
              key={callout.label}
              aria-hidden
              className="absolute -translate-1/2"
              style={{
                left: percent(box.x + box.width / 2, narrow.x, narrow.width),
                top: percent(box.y + box.height / 2, narrow.y, narrow.height),
              }}
            >
              {index + 1}
            </Badge>
          ))}
        </div>
      </div>
      <ol className="mt-3 flex flex-col gap-2 text-sm @min-[40rem]:sr-only">
        {callouts.map(({ label: part, name }, index) => (
          <li key={part} className="flex items-center gap-2">
            <Badge aria-hidden>{index + 1}</Badge>
            <span>{part}</span>
            {name !== undefined && (
              <code className="font-mono text-xs text-fd-muted-foreground">{name}</code>
            )}
          </li>
        ))}
      </ol>
    </figure>
  );
}

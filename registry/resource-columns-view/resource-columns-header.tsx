import type { ResourceId } from "@moltenship/calendar";
import type { VirtualItem } from "@tanstack/react-virtual";
import { ChevronRightIcon } from "lucide-react";
import { useMemo, type ReactNode, type RefCallback } from "react";

import { cn } from "cn";

/** What a column header shows of its resource. */
export interface ResourceHeading {
  readonly depth: number;
  /** Whether the resource's children show; `undefined` for a resource without children. */
  readonly expanded?: boolean;
  readonly id: ResourceId;
  readonly parentId?: ResourceId;
  readonly title: string;
}

export interface ResourceColumnsHeaderProps {
  /** One `aria-colindex` step per day, after the gutter. */
  readonly days: number;
  /** Follows the body's sideways scroll; see `useAxisSync`. */
  readonly followX: RefCallback<HTMLElement>;
  readonly headings: readonly ResourceHeading[];
  /** The rendered columns, from the column virtualizer. */
  readonly items: readonly VirtualItem[];
  /** Shows or hides a resource's children. */
  readonly onToggle: (id: ResourceId) => void;
  /** The corner over the gutter, such as the time zone's offset. */
  readonly corner: ReactNode;
  readonly scrollbarWidth: number;
  readonly totalSize: number;
}

/** Height of one hierarchy level, in rem. */
const LEVEL = 2;

/**
 * One column's header. A resource sits on the row for its depth, under a band for each group it
 * belongs to. An expanded group's own column starts its band, so the band names the group over
 * all of its columns; a collapsed group shows its name with a closed chevron.
 */
function ResourceHeader({
  heading: { depth, expanded, id, title },
  groups,
  levels,
  onToggle,
}: {
  readonly heading: ResourceHeading;
  /** Titles of the groups the resource sits in, outermost first. */
  readonly groups: readonly string[];
  readonly levels: number;
  readonly onToggle: (id: ResourceId) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {groups.map((_, level) => (
        <div
          key={level}
          aria-hidden
          className="shrink-0 bg-muted"
          style={{ height: `${LEVEL}rem` }}
        />
      ))}
      <div
        className={cn(
          "flex shrink-0 items-center gap-1 border-s border-calendar-grid px-2",
          expanded === true && "bg-muted",
        )}
        style={{ height: `${LEVEL}rem` }}
      >
        {expanded !== undefined && (
          <button
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
            className="-ms-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            onClick={() => onToggle(id)}
            // The grid keeps one tab stop.
            tabIndex={-1}
            type="button"
          >
            <ChevronRightIcon
              className={cn(
                "size-4 transition-transform rtl:-scale-x-100",
                expanded && "rotate-90",
              )}
            />
          </button>
        )}
        <span className="truncate text-sm font-medium" title={title}>
          {title}
        </span>
        {groups.length > 0 && <span className="sr-only">, {groups.join(", ")}</span>}
      </div>
      <div
        className="flex-1 border-s border-calendar-grid"
        style={{ minHeight: `${(levels - depth - 1) * LEVEL}rem` }}
      />
    </div>
  );
}

/**
 * The header row: the corner over the gutter, then a header per rendered resource column,
 * grouped by the resource hierarchy. Collapsing a group hides its columns.
 */
export function ResourceColumnsHeader({
  corner,
  days,
  followX,
  headings,
  items,
  onToggle,
  scrollbarWidth,
  totalSize,
}: ResourceColumnsHeaderProps) {
  const titles = useMemo(
    () => new Map(headings.map((heading) => [heading.id, heading] as const)),
    [headings],
  );
  const levels = headings.reduce((deepest, { depth }) => Math.max(deepest, depth + 1), 1);
  const groupsOf = (heading: ResourceHeading) => {
    const groups: string[] = [];
    for (let parent = heading.parentId; parent !== undefined;) {
      const group = titles.get(parent);
      if (group === undefined) break;
      groups.unshift(group.title);
      parent = group.parentId;
    }
    return groups;
  };

  return (
    <div role="row" className="flex" style={{ height: `${levels * LEVEL}rem` }}>
      <div
        role="columnheader"
        aria-colindex={1}
        className="flex w-(--calendar-gutter-width) shrink-0 items-end justify-end pe-2 pb-1 text-[0.625rem] text-calendar-axis"
      >
        {corner}
      </div>
      <div
        className="relative min-w-0 flex-1 overflow-clip"
        style={{ marginInlineEnd: scrollbarWidth }}
      >
        <div ref={followX} className="relative h-full" style={{ width: totalSize }}>
          {items.map(({ index, key, size, start }) => {
            const heading = headings[index]!;
            return (
              <div
                key={key}
                role="columnheader"
                aria-colindex={2 + index * days}
                aria-colspan={days > 1 ? days : undefined}
                className="absolute inset-y-0"
                style={{ insetInlineStart: start, width: size }}
              >
                <ResourceHeader
                  groups={groupsOf(heading)}
                  heading={heading}
                  levels={levels}
                  onToggle={onToggle}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

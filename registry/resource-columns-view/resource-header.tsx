import {
  useResourceExpansion,
  type CalendarEnvironmentBase,
  type CalendarResource,
  type ResourceId,
  type VisibleResource,
} from "@moltenship/calendar";
import { ChevronRightIcon } from "lucide-react";
import { createContext, use, type ComponentProps } from "react";

import { ResourceStatusBadge, useResourceStatusSummary } from "@registry/calendar/resource-status";
import { ResourceTime } from "@registry/calendar/resource-time";
import { cn } from "cn";

/** What the view hands a resource header; the parts read the rest through `useResourceHeader`. */
export interface ResourceHeaderProps<
  TResource extends CalendarResource<unknown, ResourceId> = CalendarResource<unknown, ResourceId>,
> {
  /** The resource, or `null` for the Unassigned column. */
  readonly resource: TResource | null;
  /** The resource's name, or "Unassigned". */
  readonly title: string;
}

export interface ResourceHeaderContextValue {
  /** The calendar's locale and display time zone. */
  readonly environment: Pick<CalendarEnvironmentBase, "locale" | "timeZone">;
  /** Names of the groups the resource sits in, outermost first. */
  readonly groups: readonly string[];
  /** Whether the default header shows the resource's status; see the view's `resourceStatus`. */
  readonly status: boolean;
  readonly title: string;
  readonly visible: VisibleResource;
}

export const ResourceHeaderContext = createContext<ResourceHeaderContextValue | null>(null);

/** The header's resource, its name and its groups, for parts inside a resource header. */
export function useResourceHeader(): ResourceHeaderContextValue {
  const context = use(ResourceHeaderContext);
  if (context === null) throw new Error("useResourceHeader is for parts inside a resource header.");
  return context;
}

function GroupToggle({ id, title }: { readonly id: ResourceId; readonly title: string }) {
  const { expanded, toggle } = useResourceExpansion(id);

  return (
    <button
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
      className="-ms-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      onClick={toggle}
      // The grid keeps one tab stop.
      tabIndex={-1}
      type="button"
    >
      <ChevronRightIcon
        className={cn(
          "size-4 transition-transform rtl:-scale-x-100",
          // Down when open: RTL mirrors it to point left, so it turns the other way.
          expanded && "rotate-90 rtl:-rotate-90",
        )}
      />
    </button>
  );
}

/** The chevron that shows or hides a group's columns; nothing for a resource without children. */
export function ResourceHeaderToggle() {
  const { title, visible } = useResourceHeader();
  return visible.hasChildren && visible.id !== null ? (
    <GroupToggle id={visible.id} title={title} />
  ) : null;
}

/**
 * Something drawn before the name, such as a person's avatar or a room's icon. Screen readers skip
 * it, since the name beside it already says who or what the column is.
 */
export function ResourceHeaderIcon({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="resource-header-icon"
      className={cn("flex shrink-0 items-center", className)}
      {...props}
    />
  );
}

/** The resource's name, cut short with an ellipsis; hovering shows it whole. Children replace it. */
export function ResourceHeaderTitle({ children, className, ...props }: ComponentProps<"span">) {
  const { title, visible } = useResourceHeader();
  return (
    <span
      data-slot="resource-header-title"
      className={cn(
        "truncate text-sm font-medium",
        visible.id === null && "text-muted-foreground",
        className,
      )}
      title={title}
      {...props}
    >
      {children ?? title}
    </span>
  );
}

/**
 * The resource's local time and UTC offset, while its `timeZone` keeps a different clock from the
 * display time zone; nothing otherwise.
 */
export function ResourceHeaderTime({ className, ...props }: ComponentProps<"span">) {
  const { environment, visible } = useResourceHeader();
  return (
    <ResourceTime
      // The header's name runs on from the resource's: "Leo, local time 5:30 PM".
      separator
      className={cn("truncate leading-none", className)}
      environment={environment}
      timeZone={visible.resource?.timeZone}
      {...props}
    />
  );
}

/**
 * The resource's status now, such as "Busy until 3:00 PM", as a badge, with the view's
 * `resourceStatus`, which makes room for it. Nothing without it, for a group or the Unassigned
 * column, or while server rendering.
 */
export function ResourceHeaderStatus({ className, ...props }: ComponentProps<"span">) {
  const { environment, status, visible } = useResourceHeader();
  // A group's own bookings aren't its members', so a group shows no status of its own.
  const summary = useResourceStatusSummary(
    environment,
    status && !visible.hasChildren ? visible.id : null,
  );
  if (summary === null) return null;
  return (
    <>
      {/* Read after the name and local time, which the header's name runs on from. */}
      <span className="sr-only">, </span>
      <ResourceStatusBadge className={className} summary={summary} {...props} />
    </>
  );
}

/**
 * The default composition: a group's chevron, then the name, with the local time under it for a
 * resource in another time zone and, with the view's `resourceStatus`, its status after that.
 */
export function DefaultResourceHeader() {
  const { status } = useResourceHeader();
  return (
    <>
      <ResourceHeaderToggle />
      <span className="flex min-w-0 flex-col">
        <ResourceHeaderTitle />
        {status ? (
          <span className="flex min-w-0 items-center gap-1">
            {/* The badge keeps its words and the local time gives way after it, out of sight in
                a narrow column; the name still reads the time first. */}
            <ResourceHeaderTime className="order-last min-w-0 shrink @max-[11rem]:sr-only" />
            <ResourceHeaderStatus />
          </span>
        ) : (
          <ResourceHeaderTime />
        )}
      </span>
    </>
  );
}

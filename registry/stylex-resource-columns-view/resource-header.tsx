"use client";

import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import {
  useResourceExpansion,
  type CalendarEnvironmentBase,
  type CalendarResource,
  type ResourceId,
  type VisibleResource,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { ChevronRightIcon } from "lucide-react";
import { createContext, use, type ComponentProps } from "react";

import {
  ResourceStatusPart,
  type ResourceHeaderStatusValue,
} from "@registry/stylex-calendar/resource-status";
import { ResourceTime } from "@registry/stylex-calendar/resource-time";
import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

const styles = stylex.create({
  chevron: {
    height: "1rem",
    scale: { default: null, ":dir(rtl)": "-1 1" },
    transitionDuration: "150ms",
    transitionProperty: "transform, translate, scale, rotate",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    width: "1rem",
  },
  // Down when open: RTL mirrors it to point left, so it turns the other way.
  chevronExpanded: {
    rotate: { default: "90deg", ":dir(rtl)": "-90deg" },
  },
  icon: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
  },
  names: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  statusLine: {
    alignItems: "center",
    display: "flex",
    gap: "0.25rem",
    minWidth: 0,
  },
  time: {
    lineHeight: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // Visually hidden in a narrow column, whose name still reads the time.
  timeBesideStatus: {
    borderWidth: { default: null, "@container (width < 11rem)": 0 },
    clip: { default: null, "@container (width < 11rem)": "rect(0, 0, 0, 0)" },
    flexShrink: 1,
    height: { default: null, "@container (width < 11rem)": 1 },
    margin: { default: null, "@container (width < 11rem)": -1 },
    minWidth: 0,
    order: 9999,
    overflow: "hidden",
    padding: { default: null, "@container (width < 11rem)": 0 },
    position: { default: null, "@container (width < 11rem)": "absolute" },
    width: { default: null, "@container (width < 11rem)": 1 },
  },
  title: {
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "1.25rem",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  titleUnassigned: {
    color: calendarVars["--muted-foreground"],
  },
  toggle: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": calendarVars["--accent"],
    },
    borderRadius: "calc(var(--radius) * 0.8)",
    borderWidth: 0,
    color: {
      default: calendarVars["--muted-foreground"],
      ":hover": calendarVars["--accent-foreground"],
    },
    cursor: "pointer",
    display: "flex",
    flexShrink: 0,
    height: "1.5rem",
    justifyContent: "center",
    marginInlineStart: "-0.25rem",
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineOffset: { default: null, ":focus-visible": 1 },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    padding: 0,
    width: "1.5rem",
  },
});

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
  /**
   * The resource's status, now or during a draft, with the view's `resourceStatus`; `null`
   * without it, for a group, or for the Unassigned column.
   */
  readonly status: ResourceHeaderStatusValue | null;
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

/** A header part's props: a `span`'s, with styles from the app after its own. */
type ResourceHeaderPartProps = ComponentProps<"span"> & {
  readonly xstyle?: XStyle;
};

function GroupToggle({ id, title }: { readonly id: ResourceId; readonly title: string }) {
  const { expanded, toggle } = useResourceExpansion(id);

  return (
    <button
      aria-expanded={expanded}
      aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
      {...stylex.props(styles.toggle)}
      onClick={toggle}
      // The grid keeps one tab stop.
      tabIndex={-1}
      type="button"
    >
      <ChevronRightIcon {...stylex.props(styles.chevron, expanded && styles.chevronExpanded)} />
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
export function ResourceHeaderIcon({
  className,
  style,
  xstyle,
  ...props
}: ResourceHeaderPartProps) {
  return (
    <span
      aria-hidden
      data-slot="resource-header-icon"
      {...props}
      {...xprops({ className, style }, styles.icon, xstyle)}
    />
  );
}

/** The resource's name, cut short with an ellipsis; hovering shows it whole. Children replace it. */
export function ResourceHeaderTitle({
  children,
  className,
  style,
  xstyle,
  ...props
}: ResourceHeaderPartProps) {
  const { title, visible } = useResourceHeader();
  return (
    <span
      data-slot="resource-header-title"
      title={title}
      {...props}
      {...xprops(
        { className, style },
        styles.title,
        visible.id === null && styles.titleUnassigned,
        xstyle,
      )}
    >
      {children ?? title}
    </span>
  );
}

/**
 * The resource's local time and UTC offset, while its `timeZone` keeps a different clock from the
 * display time zone; nothing otherwise.
 */
export function ResourceHeaderTime({ className, xstyle, ...props }: ResourceHeaderPartProps) {
  const { environment, visible } = useResourceHeader();
  return (
    <ResourceTime
      // The header's name runs on from the resource's: "Leo, local time 5:30 PM".
      separator
      className={className}
      environment={environment}
      timeZone={visible.resource?.timeZone}
      xstyle={[styles.time, xstyle]}
      {...props}
    />
  );
}

/**
 * The resource's status, with the view's `resourceStatus`, which makes room for it: during a
 * draft, whether it's busy or outside its hours then, and otherwise now, such as "Busy until
 * 3:00 PM", as a badge or the option's `DraftStatus`. Nothing without it, for a group, whose own
 * bookings aren't its members', for the Unassigned column, or while server rendering.
 */
export function ResourceHeaderStatus({
  className,
  xstyle,
}: {
  readonly className?: string;
  readonly xstyle?: XStyle;
}) {
  const { status } = useResourceHeader();
  if (status === null || (status.summary === null && status.draft === null)) return null;
  return (
    <>
      {/* Read after the name and local time, which the header's name runs on from. */}
      <VisuallyHidden>, </VisuallyHidden>
      <ResourceStatusPart className={className} status={status} xstyle={xstyle} />
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
      <span {...stylex.props(styles.names)}>
        <ResourceHeaderTitle />
        {status !== null ? (
          <span {...stylex.props(styles.statusLine)}>
            {/* The badge keeps its words and the local time gives way after it, out of sight in
                a narrow column; the name still reads the time first. */}
            <ResourceHeaderTime xstyle={styles.timeBesideStatus} />
            <ResourceHeaderStatus />
          </span>
        ) : (
          <ResourceHeaderTime />
        )}
      </span>
    </>
  );
}

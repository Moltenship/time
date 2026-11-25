import type { VisibleResource } from "@moltenship/calendar";

/*
 * The resource columns' words, one place for every framework's markup. Edit or translate them
 * here; the time grid's own, such as "Timed events", are in `time-grid-labels.ts`.
 */

/** The column of events without resources, with `unassigned: "bucket"`. */
export const unassignedTitle = "Unassigned";

/** A resource's name, or "Unassigned" for the bucket of events without resources. */
export function resourceTitle({ resource }: VisibleResource): string {
  return resource?.title ?? unassignedTitle;
}

/** The chevron that shows or hides a group's columns. */
export function groupToggleLabel(expanded: boolean, title: string): string {
  return `${expanded ? "Collapse" : "Expand"} ${title}`;
}

/** What a resource header adds after its name for screen readers: the groups it sits in. */
export function resourceGroupsWords(groups: readonly string[]): string {
  return `, ${groups.join(", ")}`;
}

/** The dates row's header over the gutter, for screen readers. */
export const datesLabel = "Date";

/** An all-day cell's name: the resource's, then the date's. */
export function resourceDateLabel(title: string, date: string): string {
  return `${title}, ${date}`;
}

/** What separates a header's status from the name and local time before it, for screen readers. */
export const statusSeparator = ", ";

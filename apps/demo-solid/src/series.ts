import type { CalendarEventChange } from "@moltenship/calendar-core";

import type { RecurrenceEditScope } from "@registry/recurrence-scope-dialog/recurrence-scope-dialog";

import type { Meeting } from "./calendar";

// The page's one repeating event, kept small: a series is its occurrences, plain events that share
// a `series`, and a change to one applies to the scope the registry's dialog asks for. An app with
// real rules expands them with @moltenship/calendar-recurrence, as the React demo does.

type Change = CalendarEventChange<Meeting, string, string>;

/** The occurrences of `series`, earliest first. */
function occurrencesOf(events: readonly Meeting[], series: string) {
  return events
    .filter((event) => event.series === series && event.interval.kind === "timed")
    .toSorted((a, b) =>
      Temporal.Instant.compare(
        a.interval.start as Temporal.Instant,
        b.interval.start as Temporal.Instant,
      ),
    );
}

/** The scopes a change to an occurrence can take: "following" isn't offered on the first. */
export function seriesScopes(change: Change, events: readonly Meeting[]): RecurrenceEditScope[] {
  const series = change.cause === "create" ? undefined : change.event.series;
  if (series === undefined || change.cause === "create") return ["this"];
  // A move into the all-day row has no time to give the other occurrences.
  if (change.cause !== "delete" && change.proposed.kind !== "timed") return ["this"];
  const first = occurrencesOf(events, series)[0]?.id === change.eventId;
  return first ? ["this", "all"] : ["this", "following", "all"];
}

/** The events once `change` applies to `scope` of its occurrence's series. */
export function applyToSeries(
  events: readonly Meeting[],
  change: Exclude<Change, { readonly cause: "create" }>,
  scope: RecurrenceEditScope,
): readonly Meeting[] {
  const { event } = change;
  const series = event.series;
  const start = event.interval.start as Temporal.Instant;
  const inScope = (other: Meeting) =>
    other.id === event.id ||
    (scope !== "this" &&
      series !== undefined &&
      other.series === series &&
      other.interval.kind === "timed" &&
      (scope === "all" || Temporal.Instant.compare(other.interval.start, start) >= 0));
  if (change.cause === "delete") return events.filter((other) => !inScope(other));
  const { proposed } = change;
  if (proposed.kind !== "timed" || event.interval.kind !== "timed") {
    return events.map((other) =>
      other.id === event.id ? { ...other, interval: proposed } : other,
    );
  }
  // Each occurrence moves by what this one moved, at each end.
  const startBy = event.interval.start.until(proposed.start);
  const endBy = event.interval.end.until(proposed.end);
  return events.map((other) =>
    !inScope(other) || other.interval.kind !== "timed"
      ? other
      : {
          ...other,
          interval: {
            end: other.interval.end.add(endBy),
            kind: "timed",
            start: other.interval.start.add(startBy),
          },
        },
  );
}

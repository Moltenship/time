import type { CalendarEventPlacement } from "@moltenship/calendar";
import {
  expandRecurrenceRule,
  recurrenceOverrideEdit,
  type EventRecurrence,
  type RecurrenceRule,
  type RecurrenceSeriesEdit,
} from "@moltenship/calendar-recurrence";

import type { DemoEvent } from "./calendar";
import { withPlacement } from "./event-changes";
import { withoutEnd, type RuleEnd } from "./repeat";
import type { DemoResourceId } from "./resources";

export type DemoSeriesEdit = RecurrenceSeriesEdit<DemoEvent, string, DemoResourceId>;

/** What the event editor changes besides the time: the fields every occurrence shows. */
export type EventFields = Pick<DemoEvent, "calendarId" | "description" | "title">;

/** What the event editor changed besides the time, for the occurrences the edit's scope covers. */
export interface SeriesEditExtras {
  /** A new end from the Repeat field: COUNT, UNTIL or neither. */
  readonly end?: RuleEnd;
  /** The editor's title, description and calendar. */
  readonly fields?: EventFields;
  /** Where the edited occurrence goes, which a series that stops repeating keeps. */
  readonly placement?: CalendarEventPlacement<DemoResourceId>;
  /**
   * A new way to repeat from the Repeat field, without its end; `null` stops the series repeating.
   * It starts the series' occurrences over, so their exceptions and overrides go, and without a
   * rule the series is one event where the edited occurrence went.
   */
  readonly rule?: RecurrenceRule | null;
  /** Where timed series without `sourceTimeZone` repeat: the expander's `defaultTimeZone`. */
  readonly timeZone?: string;
}

function withFields(event: DemoEvent, fields: EventFields, shared?: DemoEvent): DemoEvent {
  // With `shared`, only the fields the event has in common with it, so what an occurrence changed
  // on its own stays.
  const takes = (name: keyof EventFields) => shared === undefined || event[name] === shared[name];
  const { description, ...rest } = event;
  const next = {
    ...rest,
    calendarId: takes("calendarId") ? fields.calendarId : event.calendarId,
    title: takes("title") ? fields.title : event.title,
  };
  const kept = takes("description") ? fields.description : description;
  return kept === undefined ? next : { ...next, description: kept };
}

/**
 * The rule an edit writes with the editor's changes: `shape` in place of how `current` repeats,
 * and `end` in place of its end. The Repeat field shows a COUNT for the whole series, so a series
 * a `"following"` edit starts, after `before` occurrences, gets what's left of it.
 */
function rewrite(
  current: RecurrenceRule | undefined,
  shape: RecurrenceRule | undefined,
  end: RuleEnd | undefined,
  before = 0,
): RecurrenceRule | undefined {
  const base = shape ?? (current === undefined ? undefined : withoutEnd(current));
  if (base === undefined) return undefined;
  const { count, until } = end ?? current ?? {};
  return {
    ...base,
    ...(count === undefined
      ? {}
      : { count: end === undefined ? count : Math.max(1, count - before) }),
    ...(until === undefined ? {} : { until }),
  };
}

/** A restarted series' recurrence: its new rule, and none of the old one's dates. */
function restarted(recurrence: EventRecurrence, rule: RecurrenceRule): EventRecurrence {
  const { duration, wallStart } = recurrence;
  return {
    rule,
    ...(duration === undefined ? {} : { duration }),
    ...(wallStart === undefined ? {} : { wallStart }),
  };
}

function withoutRecurrence(event: DemoEvent): DemoEvent {
  const { recurrence: _recurrence, ...rest } = event;
  return rest;
}

/**
 * Where a series restarted with `rule` first happens: the rule's first day from `placement` on, as
 * the first occurrence always counts and would otherwise stay on a day the new rule doesn't use.
 * The editor's presets spell their days out, so a start a day earlier doesn't change them.
 */
function firstPlacement(
  rule: RecurrenceRule,
  placement: CalendarEventPlacement<DemoResourceId>,
  timeZone: string,
): CalendarEventPlacement<DemoResourceId> {
  try {
    if (placement.kind === "timed") {
      const zone = placement.sourceTimeZone ?? timeZone;
      const start = placement.start.toZonedDateTimeISO(zone);
      const earlier = start.subtract({ days: 1 }).toInstant();
      const [first] = expandRecurrenceRule(
        withoutEnd(rule),
        {
          end: earlier.add(placement.start.until(placement.end)),
          kind: "timed",
          sourceTimeZone: zone,
          start: earlier,
        },
        { before: start.add({ years: 8 }).toInstant(), from: placement.start },
      ).dates;
      if (!(first instanceof Temporal.Instant)) return placement;
      return { ...placement, end: first.add(placement.start.until(placement.end)), start: first };
    }
    if (placement.kind === "all-day") {
      const earlier = placement.start.subtract({ days: 1 });
      const [first] = expandRecurrenceRule(
        withoutEnd(rule),
        { end: placement.start, kind: "all-day", start: earlier },
        { before: placement.start.add({ years: 8 }), from: placement.start },
      ).dates;
      if (!(first instanceof Temporal.PlainDate)) return placement;
      return { ...placement, end: first.add(placement.start.until(placement.end)), start: first };
    }
  } catch {
    // A rule the engine can't expand starts where it did; the expander reports it.
  }
  return placement;
}

/**
 * Applies a series edit to the demo's events, as `applyRecurrenceEdit` does for
 * `RecurringCalendarEvent`s: the master's update or delete, the series a `"following"` edit
 * starts, the edited occurrence's override, and the series' other overrides by
 * `recurrenceOverrideEdit`. New events get IDs from `createId`. `extras` adds what the event editor
 * changed besides the time.
 */
export function applySeriesEdit(
  events: readonly DemoEvent[],
  edit: DemoSeriesEdit,
  createId: () => string,
  { end, fields, placement, rule, timeZone = "UTC" }: SeriesEditExtras = {},
): DemoEvent[] {
  const master = events.find(({ id, override }) => id === edit.seriesId && override === undefined);
  const restarts = rule !== undefined && edit.scope !== "this";
  const shape = rule ?? undefined;
  const { series } = edit;
  // How many occurrences the old series keeps, when it ends by COUNT.
  const ended = series.action === "update" ? series.recurrence.rule : undefined;
  const before = ended?.until === undefined ? (ended?.count ?? 0) : 0;
  const created: DemoEvent[] = [];
  /** Events the scope covers, which take the editor's fields. */
  const covered = new Set<string>();
  /** Overrides the scope covers, which take the fields they share with the master. */
  const coveredOverrides = new Set<string>();

  let newSeriesId: string | undefined;
  if (edit.newSeries !== undefined) {
    const { from, id, placement, recurrence } = edit.newSeries;
    const { override: _override, ...source } = from;
    newSeriesId = id ?? createId();
    const started = withPlacement({ ...source, id: newSeriesId, recurrence }, placement);
    const next = rewrite(recurrence.rule, shape, end, before);
    created.push(
      rule === null || next === undefined
        ? withoutRecurrence(started)
        : {
            ...started,
            recurrence: restarts ? restarted(recurrence, next) : { ...recurrence, rule: next },
          },
    );
    covered.add(newSeriesId);
  }
  const seriesIdOf = (series: "current" | "new") =>
    series === "new" && newSeriesId !== undefined ? newSeriesId : edit.seriesId;

  const { override: edited } = edit;
  const next = events.flatMap((event): DemoEvent[] => {
    if (event === master) {
      if (series.action === "delete") return [];
      if (series.action === "keep") return [event];
      if (edit.scope !== "all") {
        return [withPlacement({ ...event, recurrence: series.recurrence }, series.placement)];
      }
      covered.add(event.id);
      // Without a rule, the series is one event where the edited occurrence went.
      if (rule === null) {
        return [withPlacement(withoutRecurrence(event), placement ?? series.placement)];
      }
      const next = rewrite(series.recurrence.rule, shape, end) ?? series.recurrence.rule;
      if (next === undefined) {
        return [withPlacement({ ...event, recurrence: series.recurrence }, series.placement)];
      }
      if (shape === undefined) {
        return [
          withPlacement(
            { ...event, recurrence: { ...series.recurrence, rule: next } },
            series.placement,
          ),
        ];
      }
      return [
        withPlacement(
          { ...event, recurrence: restarted(series.recurrence, next) },
          firstPlacement(next, series.placement, timeZone),
        ),
      ];
    }

    const { override } = event;
    if (override === undefined || override.seriesId !== edit.seriesId) return [event];
    if (edited !== undefined && edited.action !== "create" && event.id === edited.eventId) {
      if (edited.action === "delete" || restarts) return [];
      covered.add(event.id);
      return [
        withPlacement(
          {
            ...event,
            override: {
              ...override,
              ...(edited.cancelled === true ? { cancelled: true } : {}),
              recurrenceId: edited.recurrenceId,
              seriesId: seriesIdOf(edited.series),
            },
          },
          edited.placement,
        ),
      ];
    }

    const rekey = recurrenceOverrideEdit(edit, override.recurrenceId);
    if (rekey.action === "delete") return [];
    // A new rule makes other occurrences, so overrides of the old ones it covers go.
    if (restarts && (edit.scope === "all" || rekey.action === "update")) return [];
    if (rekey.action === "keep") {
      if (edit.scope === "all") coveredOverrides.add(event.id);
      return [event];
    }
    coveredOverrides.add(event.id);
    return [
      {
        ...event,
        override: {
          ...override,
          recurrenceId: rekey.recurrenceId,
          seriesId: seriesIdOf(rekey.series),
        },
      },
    ];
  });

  if (edited?.action === "create") {
    const { recurrence: _recurrence, ...source } = edited.from;
    const id = createId();
    created.push(
      withPlacement(
        {
          ...source,
          id,
          override: { recurrenceId: edited.recurrenceId, seriesId: edited.seriesId },
        },
        edited.placement,
      ),
    );
    covered.add(id);
  }

  const all = [...next, ...created];
  if (fields === undefined) return all;
  return all.map((event) =>
    covered.has(event.id)
      ? withFields(event, fields)
      : coveredOverrides.has(event.id)
        ? withFields(event, fields, master)
        : event,
  );
}

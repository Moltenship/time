import type { CalendarEventPlacement } from "@moltenship/calendar";
import {
  recurrenceOverrideEdit,
  type EventRecurrence,
  type RecurrenceRule,
  type RecurrenceSeriesEdit,
} from "@moltenship/calendar-recurrence";

import type { DemoEvent } from "./calendar";
import { withPlacement } from "./event-changes";
import type { DemoResourceId } from "./resources";

export type DemoSeriesEdit = RecurrenceSeriesEdit<DemoEvent, string, DemoResourceId>;

/** What the event editor changes besides the time: the fields every occurrence shows. */
export type EventFields = Pick<DemoEvent, "calendarId" | "description" | "title">;

export interface SeriesEditExtras {
  /** The editor's title, description and calendar, for the events the edit's scope covers. */
  readonly fields?: EventFields;
  /** Where the edited occurrence goes, which a series that stops repeating keeps. */
  readonly placement?: CalendarEventPlacement<DemoResourceId>;
  /**
   * A rule from the editor's Repeat field, for `"following"` and `"all"`: `null` stops the series
   * repeating. Changing how a series repeats starts its occurrences over, so their exceptions and
   * overrides go, and without a rule the series is one event where the edited occurrence went.
   */
  readonly rule?: RecurrenceRule | null;
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

function repeating(recurrence: EventRecurrence, rule: RecurrenceRule): EventRecurrence {
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
  { fields, placement, rule }: SeriesEditExtras = {},
): DemoEvent[] {
  const master = events.find(({ id, override }) => id === edit.seriesId && override === undefined);
  const restarts = rule !== undefined && edit.scope !== "this";
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
    created.push(
      !restarts
        ? started
        : rule === null
          ? withoutRecurrence(started)
          : { ...started, recurrence: repeating(recurrence, rule) },
    );
    covered.add(newSeriesId);
  }
  const seriesIdOf = (series: "current" | "new") =>
    series === "new" && newSeriesId !== undefined ? newSeriesId : edit.seriesId;

  const { override: edited } = edit;
  const next = events.flatMap((event): DemoEvent[] => {
    if (event === master) {
      const { series } = edit;
      if (series.action === "delete") return [];
      if (series.action === "keep") return [event];
      if (edit.scope === "all") covered.add(event.id);
      if (!restarts || edit.scope !== "all") {
        return [withPlacement({ ...event, recurrence: series.recurrence }, series.placement)];
      }
      // Without a rule, the series is one event where the edited occurrence went.
      if (rule === null) {
        return [withPlacement(withoutRecurrence(event), placement ?? series.placement)];
      }
      return [
        withPlacement(
          { ...event, recurrence: repeating(series.recurrence, rule) },
          series.placement,
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

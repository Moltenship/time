import type {
  CalendarEventInterval,
  CalendarEventPlacement,
  CalendarEventUpdateChange,
} from "@moltenship/calendar";
import type { RecurrenceRule } from "@moltenship/calendar-recurrence";

import type { DemoCalendarActions, DemoEvent, DemoOccurrence } from "./demo-model";
import { eventFromDraft, type EventDraft } from "./event-draft";
import { repeatChange, type RuleEnd } from "./repeat";
import type { DemoResourceId } from "./resources";
import type { EventFields } from "./series-edits";

/** What the editor saves: an event as it is, or a change to an occurrence of a series. */
export type EventDialogSave =
  | {
      readonly event: DemoEvent;
      readonly type: "event";
      /** What the calendar's policies flagged the event with. */
      readonly warnings: readonly string[];
    }
  | {
      /** The occurrence's new time, as the calendar hands `onEventChange` a change. */
      readonly change: CalendarEventUpdateChange<DemoOccurrence, string, DemoResourceId>;
      /** The Repeat field's new end, when only that changed. */
      readonly end?: RuleEnd;
      readonly fields: EventFields;
      /** The Repeat field's new way to repeat, without its end: `null` for "Does not repeat". */
      readonly rule?: RecurrenceRule | null;
      readonly type: "occurrence";
      readonly warnings: readonly string[];
    };

function parseInput<T>(value: string, parse: (value: string) => T): T | undefined {
  try {
    return parse(value);
  } catch {
    return undefined;
  }
}

export const parseDate = (value: string) =>
  parseInput(value, (text) => Temporal.PlainDate.from(text));
export const parseTime = (value: string) =>
  parseInput(value, (text) => Temporal.PlainTime.from(text));
export const timeValue = (time: Temporal.PlainTime) => time.toString({ smallestUnit: "minute" });

function placementOf(
  interval: CalendarEventInterval,
  resourceIds: readonly DemoResourceId[] = [],
): CalendarEventPlacement<DemoResourceId> {
  switch (interval.kind) {
    case "timed": {
      const { end, sourceTimeZone, start } = interval;
      return {
        end,
        kind: "timed",
        resourceIds,
        ...(sourceTimeZone === undefined ? {} : { sourceTimeZone }),
        start,
      };
    }
    case "all-day":
      return { end: interval.end, kind: "all-day", resourceIds, start: interval.start };
    case "floating":
      return { end: interval.end, kind: "floating", resourceIds, start: interval.start };
  }
}

function samePlacement(
  left: CalendarEventPlacement<DemoResourceId>,
  right: CalendarEventPlacement<DemoResourceId>,
): boolean {
  return (
    left.kind === right.kind &&
    String(left.start) === String(right.start) &&
    String(left.end) === String(right.end) &&
    left.resourceIds.join() === right.resourceIds.join()
  );
}

export interface EventFormOptions {
  readonly actions: Pick<DemoCalendarActions, "checkEventChange">;
  readonly initial: EventDraft;
  /**
   * Saves what the calendar's policies accept. Resolves with an error to show, or nothing once
   * it's handled: saved, or left for the user to try again.
   */
  readonly onSave: (save: EventDialogSave) => Promise<string | undefined>;
  readonly timeZone: string;
}

/**
 * Saves the editor's draft: checks it against the calendar's policies, then hands `onSave` the
 * event or the occurrence's change. Resolves with an error to show, or nothing once it's handled.
 * `setSaving` hears when a series edit is waiting on its scope; each UI keeps its own state.
 */
export async function submitEventDraft(
  { actions, initial, onSave, timeZone }: EventFormOptions,
  draft: EventDraft,
  setSaving: (saving: boolean) => void,
): Promise<string | undefined> {
  const { checkEventChange } = actions;
  const result = eventFromDraft(draft, timeZone, draft.id ?? draft.newId ?? crypto.randomUUID());
  if ("error" in result) return result.error;
  // Times typed here meet the same policies as a drag, such as working hours.
  const proposed = placementOf(result.event, result.event.resourceIds);
  const check = checkEventChange(
    initial.id === undefined
      ? { cause: "create", proposed }
      : { cause: "update", eventId: initial.id, proposed },
  );
  if (check?.status === "rejected") {
    return check.reason === "outside-availability"
      ? "That's outside working hours. Pick another time, or change Working hours in Settings."
      : check.reason === "resource-conflict"
        ? "A room it books is taken then. Pick another room or time, or change Rooms and people in Settings."
        : "That change isn't allowed.";
  }
  const warnings = check?.change.warnings ?? [];
  const { occurrence } = initial;
  if (occurrence === undefined) return onSave({ event: result.event, type: "event", warnings });

  const { calendarId, description, title } = result.event;
  const fields = { calendarId, title, ...(description === undefined ? {} : { description }) };
  const original = placementOf(occurrence.interval, occurrence.event.resourceIds);
  const repeat = repeatChange(initial.repeat, draft.repeat, proposed, draft.seriesTimeZone);
  const unchanged =
    repeat.rule === undefined &&
    repeat.end === undefined &&
    samePlacement(original, proposed) &&
    title === occurrence.event.title &&
    calendarId === occurrence.event.calendarId &&
    description === occurrence.event.description;
  // Nothing to ask about: close as Save does for an unchanged event.
  if (unchanged) return onSave({ event: occurrence.event, type: "event", warnings });
  setSaving(true);
  try {
    return await onSave({
      change: {
        cause: "update",
        event: occurrence,
        eventId: occurrence.id,
        id: `editor-${occurrence.id}`,
        original,
        proposed,
      },
      fields,
      ...repeat,
      type: "occurrence",
      warnings,
    });
  } finally {
    setSaving(false);
  }
}

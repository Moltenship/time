// #region adapters
import { createCalendar, defineEventAdapter } from "@moltenship/calendar";
import {
  createOccurrenceAdapter,
  parseRecurrenceRule,
  type RecurrenceAdapters,
  type RecurrenceOccurrence,
} from "@moltenship/calendar-recurrence";

export interface Meeting {
  readonly id: string;
  readonly title: string;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  /** Where it was booked. A series repeats on this zone's wall clock. */
  readonly timeZone: string;
  /** On a series' first meeting: an RRULE, such as "FREQ=WEEKLY;BYDAY=MO,WE". */
  readonly repeats?: string;
  /** Starts of meetings the series skips. */
  readonly skips?: readonly Temporal.Instant[];
  /** On a meeting that replaces one of a series: the series, and the start it replaces. */
  readonly replaces?: { readonly seriesId: string; readonly start: Temporal.Instant };
}

export const adapters: RecurrenceAdapters<Meeting, string, never> = {
  event: defineEventAdapter<Meeting>()({
    getId: (meeting) => meeting.id,
    getTitle: (meeting) => meeting.title,
    getInterval: (meeting) => ({
      kind: "timed",
      start: meeting.start,
      end: meeting.end,
      sourceTimeZone: meeting.timeZone,
    }),
    getResourceIds: () => [],
  }),
  recurrence: {
    getRecurrence: (meeting) =>
      meeting.repeats === undefined
        ? undefined
        : { rule: parseRecurrenceRule(meeting.repeats).rule, exceptionDates: meeting.skips },
    getOverride: (meeting) =>
      meeting.replaces && {
        seriesId: meeting.replaces.seriesId,
        recurrenceId: meeting.replaces.start,
      },
  },
};

export const Calendar = createCalendar<RecurrenceOccurrence<Meeting, string>>()({
  eventAdapter: createOccurrenceAdapter(adapters.event),
});
// #endregion adapters

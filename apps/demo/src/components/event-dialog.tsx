import type {
  CalendarEventInterval,
  CalendarEventPlacement,
  CalendarEventUpdateChange,
} from "@moltenship/calendar";
import type { RecurrenceRule } from "@moltenship/calendar-recurrence";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@registry/ui/button";
import { Checkbox } from "@registry/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@registry/ui/dialog";
import { Input } from "@registry/ui/input";
import { Label } from "@registry/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@registry/ui/select";
import { Textarea } from "@registry/ui/textarea";

import { DemoCalendar, type DemoEvent, type DemoOccurrence } from "../calendar";
import { demoCalendars, isDemoCalendarId } from "../calendars";
import {
  eventFromDraft,
  intervalFromDraft,
  moveDraftStart,
  repeatsFrom,
  type EventDraft,
} from "../event-draft";
import { repeatChange, seriesDate, type RuleEnd } from "../repeat";
import type { DemoResourceId } from "../resources";
import type { EventFields } from "../series-edits";
import { RepeatField } from "./repeat-field";
import { ResourcePicker } from "./resource-picker";

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

export interface EventDialogProps {
  /** The event being created or edited; the dialog is open while it is set. */
  readonly draft: EventDraft | null;
  readonly locale: Intl.LocalesArgument;
  readonly onOpenChange: (open: boolean) => void;
  /**
   * Saves what the calendar's policies accept. Resolves with an error to show, or nothing once
   * it's handled: saved, or left for the user to try again.
   */
  readonly onSave: (save: EventDialogSave) => Promise<string | undefined>;
  /** Where focus goes when the dialog closes, such as the event it edits. */
  readonly returnFocus?: HTMLElement | null;
  readonly timeZone: string;
}

export function EventDialog({
  draft,
  locale,
  onOpenChange,
  onSave,
  returnFocus,
  timeZone,
}: EventDialogProps) {
  return (
    <Dialog open={draft !== null} onOpenChange={onOpenChange}>
      <DialogContent
        // Bounded by the viewport so a long description scrolls instead of pushing Save off-screen.
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        finalFocus={() => (returnFocus?.isConnected === true ? returnFocus : true)}
      >
        {draft !== null && (
          <EventForm initial={draft} locale={locale} onSave={onSave} timeZone={timeZone} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CalendarOption({ calendarId }: { readonly calendarId: unknown }) {
  const calendar = demoCalendars.find(({ id }) => id === calendarId);
  return (
    <>
      <span
        data-color={calendar?.color}
        className="size-3 shrink-0 rounded-full bg-calendar-event-border"
      />
      {calendar?.name}
    </>
  );
}

function parseInput<T>(value: string, parse: (value: string) => T): T | undefined {
  try {
    return parse(value);
  } catch {
    return undefined;
  }
}

const parseDate = (value: string) => parseInput(value, (text) => Temporal.PlainDate.from(text));
const parseTime = (value: string) => parseInput(value, (text) => Temporal.PlainTime.from(text));
const timeValue = (time: Temporal.PlainTime) => time.toString({ smallestUnit: "minute" });

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

function EventForm({
  initial,
  locale,
  onSave,
  timeZone,
}: {
  readonly initial: EventDraft;
  readonly locale: Intl.LocalesArgument;
  readonly onSave: EventDialogProps["onSave"];
  readonly timeZone: string;
}) {
  const id = useId();
  const { checkEventChange } = DemoCalendar.useCalendarActions();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const update = (next: Partial<EventDraft>) => setDraft((current) => ({ ...current, ...next }));
  const interval = intervalFromDraft(draft, timeZone);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = eventFromDraft(draft, timeZone, draft.id ?? crypto.randomUUID());
    if ("error" in result) {
      setError(result.error);
      return;
    }
    // Times typed here meet the same policies as a drag, such as working hours.
    const proposed = placementOf(result.event, result.event.resourceIds);
    const check = checkEventChange(
      initial.id === undefined
        ? { cause: "create", proposed }
        : { cause: "update", eventId: initial.id, proposed },
    );
    if (check?.status === "rejected") {
      setError(
        check.reason === "outside-availability"
          ? "That's outside working hours. Pick another time, or change Working hours in Settings."
          : "That change isn't allowed.",
      );
      return;
    }
    const warnings = check?.change.warnings ?? [];
    const { occurrence } = initial;
    if (occurrence === undefined) {
      setError(await onSave({ event: result.event, type: "event", warnings }));
      return;
    }

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
    if (unchanged) {
      setError(await onSave({ event: occurrence.event, type: "event", warnings }));
      return;
    }
    setSaving(true);
    try {
      setError(
        await onSave({
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
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="grid gap-4" noValidate onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{initial.id === undefined ? "New event" : "Edit event"}</DialogTitle>
      </DialogHeader>
      <Input
        aria-invalid={error !== undefined && draft.title.trim() === ""}
        aria-label="Title"
        autoFocus
        className="h-11 text-lg md:text-lg"
        onChange={(event) => update({ title: event.target.value })}
        placeholder="Add title"
        value={draft.title}
      />
      <Label className="w-fit">
        <Checkbox
          checked={draft.allDay}
          onCheckedChange={(checked) => update({ allDay: checked === true })}
        />
        All day
      </Label>
      <fieldset className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-3">
        <legend className="sr-only">When</legend>
        <Label htmlFor={`${id}-start`}>Starts</Label>
        <Input
          className={draft.allDay ? "col-span-2 px-2.5" : "px-2.5"}
          id={`${id}-start`}
          onChange={(event) => {
            const date = parseDate(event.target.value);
            if (date) setDraft((current) => moveDraftStart(current, date, current.startTime));
          }}
          type="date"
          value={draft.startDate.toString()}
        />
        <Input
          aria-label="Start time"
          className="w-26 px-2.5 sm:w-28"
          hidden={draft.allDay}
          onChange={(event) => {
            const time = parseTime(event.target.value);
            if (time) setDraft((current) => moveDraftStart(current, current.startDate, time));
          }}
          step={300}
          type="time"
          value={timeValue(draft.startTime)}
        />
        <Label htmlFor={`${id}-end`}>Ends</Label>
        <Input
          className={draft.allDay ? "col-span-2 px-2.5" : "px-2.5"}
          id={`${id}-end`}
          onChange={(event) => {
            const endDate = parseDate(event.target.value);
            if (endDate) update({ endDate });
          }}
          type="date"
          value={draft.endDate.toString()}
        />
        <Input
          aria-label="End time"
          className="w-26 px-2.5 sm:w-28"
          hidden={draft.allDay}
          onChange={(event) => {
            const endTime = parseTime(event.target.value);
            if (endTime) update({ endTime });
          }}
          step={300}
          type="time"
          value={timeValue(draft.endTime)}
        />
      </fieldset>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-calendar`}>Calendar</Label>
        <Select
          onValueChange={(calendarId) => {
            if (isDemoCalendarId(calendarId)) update({ calendarId });
          }}
          value={draft.calendarId}
        >
          <SelectTrigger className="w-full" id={`${id}-calendar`}>
            <SelectValue>{(calendarId) => <CalendarOption calendarId={calendarId} />}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {demoCalendars.map((calendar) => (
                <SelectItem key={calendar.id} value={calendar.id}>
                  <CalendarOption calendarId={calendar.id} />
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <RepeatField
        locale={locale}
        minimumEnd={repeatsFrom(draft, timeZone)}
        onChange={(repeat) => update({ repeat })}
        // Presets are named after the day the series repeats on, in its own zone.
        startDate={
          "error" in interval ? draft.startDate : seriesDate(interval, draft.seriesTimeZone)
        }
        timeZone={draft.seriesTimeZone}
        value={draft.repeat}
      />
      {draft.calendarId === "work" && (
        <ResourcePicker
          eventId={initial.id}
          interval={"error" in interval ? null : interval}
          onChange={(resourceIds) => update({ resourceIds })}
          value={draft.resourceIds ?? []}
        />
      )}
      <div className="grid gap-2">
        <Label htmlFor={`${id}-description`}>Description</Label>
        <Textarea
          className="max-h-40"
          id={`${id}-description`}
          onChange={(event) => update({ description: event.target.value })}
          value={draft.description}
        />
      </div>
      {error !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button disabled={saving} type="submit">
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

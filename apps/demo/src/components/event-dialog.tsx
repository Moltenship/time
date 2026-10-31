import { useId } from "react";

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

import { DemoCalendar } from "../calendar";
import { demoCalendars, isDemoCalendarId } from "../calendars";
import { moveDraftStart, repeatsFrom, type EventDraft } from "../event-draft";
import {
  parseDate,
  parseTime,
  timeValue,
  useEventForm,
  type EventFormOptions,
} from "../event-form";
import { seriesDate } from "../repeat";
import { RepeatField } from "./repeat-field";
import { ResourcePicker } from "./resource-picker";

export interface EventDialogProps {
  /** The event being created or edited; the dialog is open while it is set. */
  readonly draft: EventDraft | null;
  readonly locale: Intl.LocalesArgument;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: EventFormOptions["onSave"];
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
  const actions = DemoCalendar.useCalendarActions();
  const { draft, error, interval, saving, setDraft, submit, update } = useEventForm({
    actions,
    initial,
    onSave,
    timeZone,
  });

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
          // A task goes on a time slot, so it can go back to the unscheduled tasks.
          disabled={initial.newId !== undefined}
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

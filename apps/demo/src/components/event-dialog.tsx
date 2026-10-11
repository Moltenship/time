import type { CalendarEventPlacement } from "@moltenship/calendar";
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

import { DemoCalendar, type DemoEvent } from "../calendar";
import { demoCalendars, isDemoCalendarId } from "../calendars";
import { eventFromDraft, intervalFromDraft, moveDraftStart, type EventDraft } from "../event-draft";
import { ResourcePicker } from "./resource-picker";
import type { DemoResourceId } from "../resources";

export interface EventDialogProps {
  /** The event being created or edited; the dialog is open while it is set. */
  readonly draft: EventDraft | null;
  readonly onOpenChange: (open: boolean) => void;
  /** Saves an event the calendar's policies accept, with the warnings they flag it with. */
  readonly onSave: (event: DemoEvent, warnings: readonly string[]) => void;
  /** Where focus goes when the dialog closes, such as the event it edits. */
  readonly returnFocus?: HTMLElement | null;
  readonly timeZone: string;
}

export function EventDialog({
  draft,
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
        {draft !== null && <EventForm initial={draft} onSave={onSave} timeZone={timeZone} />}
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

function placementOf(event: DemoEvent): CalendarEventPlacement<DemoResourceId> {
  const resourceIds = event.resourceIds ?? [];
  return event.kind === "timed"
    ? { end: event.end, kind: "timed", resourceIds, start: event.start }
    : { end: event.end, kind: "all-day", resourceIds, start: event.start };
}

function EventForm({
  initial,
  onSave,
  timeZone,
}: {
  readonly initial: EventDraft;
  readonly onSave: EventDialogProps["onSave"];
  readonly timeZone: string;
}) {
  const id = useId();
  const { checkEventChange } = DemoCalendar.useCalendarActions();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string>();
  const update = (next: Partial<EventDraft>) => setDraft((current) => ({ ...current, ...next }));
  const interval = intervalFromDraft(draft, timeZone);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = eventFromDraft(draft, timeZone, draft.id ?? crypto.randomUUID());
    if ("error" in result) {
      setError(result.error);
      return;
    }
    // Times typed here meet the same policies as a drag, such as working hours.
    const proposed = placementOf(result.event);
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
    onSave(result.event, check?.change.warnings ?? []);
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
          className="px-2.5"
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
          className="px-2.5"
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
        <Button type="submit">Save</Button>
      </DialogFooter>
    </form>
  );
}

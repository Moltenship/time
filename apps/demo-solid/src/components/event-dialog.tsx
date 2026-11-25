import { SelectItemIcon, SelectValueIcon } from "@ui-sdk/solid/select";
import { createMemo, createSignal, createUniqueId, For, Show, untrack } from "solid-js";

import { Button } from "@registry/calendar-ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@registry/calendar-ui/select";

import { demoCalendars, type DemoCalendarId } from "@demo/calendars";
import { intervalFromDraft, moveDraftStart, repeatsFrom, type EventDraft } from "@demo/event-draft";
import {
  parseDate,
  parseTime,
  submitEventDraft,
  timeValue,
  type EventFormOptions,
} from "@demo/event-form";
import { seriesDate } from "@demo/repeat";

import { Calendar } from "../calendar";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input, Textarea } from "../ui/input";
import { Label } from "../ui/label";
import { RepeatField } from "./repeat-field";
import { ResourcePicker } from "./resource-picker";

/**
 * The React demo's event editor (apps/demo/src/components/event-dialog.tsx): title, all day, the
 * start and end, the calendar, Repeat, rooms and people for work events, and a description. Saving
 * goes through the same `submitEventDraft`, which meets the calendar's policies first.
 */
export function EventDialog(props: {
  /** The event being created or edited; the dialog is open while it is set. */
  readonly draft: EventDraft | null;
  readonly locale: Intl.LocalesArgument;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: EventFormOptions["onSave"];
  /** Where focus goes when the dialog closes, such as the event it edits. */
  readonly returnFocus?: HTMLElement | null;
  readonly timeZone: string;
}) {
  // The last draft stays while the dialog fades out; a new one starts a fresh form.
  let last: EventDraft | null = null;
  const shown = createMemo(() => (last = props.draft ?? last));
  return (
    <Dialog open={props.draft !== null} onOpenChange={props.onOpenChange}>
      <DialogContent
        class="sm:max-w-md"
        finalFocus={() => (props.returnFocus?.isConnected === true ? props.returnFocus : undefined)}
      >
        <Show when={shown()} keyed>
          {(draft) => (
            <EventForm
              initial={draft}
              locale={props.locale}
              onSave={props.onSave}
              timeZone={props.timeZone}
            />
          )}
        </Show>
      </DialogContent>
    </Dialog>
  );
}

const calendarItems = demoCalendars.map(({ id, name }) => ({ label: name, value: id }));

function CalendarDot(props: { readonly calendarId: DemoCalendarId }) {
  return (
    <span
      data-color={demoCalendars.find(({ id }) => id === props.calendarId)?.color}
      class="size-3 shrink-0 rounded-full bg-calendar-event-border"
    />
  );
}

function EventForm(props: {
  readonly initial: EventDraft;
  readonly locale: Intl.LocalesArgument;
  readonly onSave: EventFormOptions["onSave"];
  readonly timeZone: string;
}) {
  const id = createUniqueId();
  const actions = Calendar.useCalendarActions();
  // The form owns its draft from here on, as React's `useEventForm` does.
  const [draft, setDraft] = createSignal(untrack(() => props.initial));
  const [error, setError] = createSignal<string>();
  const [saving, setSaving] = createSignal(false);
  const update = (next: Partial<EventDraft>) => setDraft((current) => ({ ...current, ...next }));
  const interval = createMemo(() => intervalFromDraft(draft(), props.timeZone));
  const validInterval = () => {
    const current = interval();
    return "error" in current ? null : current;
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const options = {
      actions,
      initial: props.initial,
      onSave: props.onSave,
      timeZone: props.timeZone,
    };
    setError(await submitEventDraft(options, draft(), setSaving));
  };

  return (
    <form class="grid gap-4" novalidate onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{props.initial.id === undefined ? "New event" : "Edit event"}</DialogTitle>
      </DialogHeader>
      <Input
        aria-invalid={error() !== undefined && draft().title.trim() === "" ? "true" : undefined}
        aria-label="Title"
        autofocus
        class="h-11 text-lg md:text-lg"
        onInput={(event) => update({ title: event.currentTarget.value })}
        placeholder="Add title"
        value={draft().title}
      />
      <Label class="w-fit">
        <Checkbox
          checked={draft().allDay}
          // A task goes on a time slot, so it can go back to the unscheduled tasks.
          disabled={props.initial.newId !== undefined}
          onCheckedChange={(allDay) => update({ allDay })}
        />
        All day
      </Label>
      <fieldset class="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-3">
        <legend class="sr-only">When</legend>
        <Label for={`${id}-start`}>Starts</Label>
        <Input
          class={draft().allDay ? "col-span-2 px-2.5" : "px-2.5"}
          id={`${id}-start`}
          onInput={(event) => {
            const date = parseDate(event.currentTarget.value);
            if (date) setDraft((current) => moveDraftStart(current, date, current.startTime));
          }}
          type="date"
          value={draft().startDate.toString()}
        />
        <Input
          aria-label="Start time"
          class="w-26 px-2.5 sm:w-28"
          hidden={draft().allDay}
          onInput={(event) => {
            const time = parseTime(event.currentTarget.value);
            if (time) setDraft((current) => moveDraftStart(current, current.startDate, time));
          }}
          step={300}
          type="time"
          value={timeValue(draft().startTime)}
        />
        <Label for={`${id}-end`}>Ends</Label>
        <Input
          class={draft().allDay ? "col-span-2 px-2.5" : "px-2.5"}
          id={`${id}-end`}
          onInput={(event) => {
            const endDate = parseDate(event.currentTarget.value);
            if (endDate) update({ endDate });
          }}
          type="date"
          value={draft().endDate.toString()}
        />
        <Input
          aria-label="End time"
          class="w-26 px-2.5 sm:w-28"
          hidden={draft().allDay}
          onInput={(event) => {
            const endTime = parseTime(event.currentTarget.value);
            if (endTime) update({ endTime });
          }}
          step={300}
          type="time"
          value={timeValue(draft().endTime)}
        />
      </fieldset>
      <div class="grid gap-2">
        <Label for={`${id}-calendar`}>Calendar</Label>
        <Select<DemoCalendarId>
          items={calendarItems}
          onValueChange={(calendarId) => update({ calendarId })}
          value={draft().calendarId}
        >
          <SelectTrigger class="w-full" id={`${id}-calendar`}>
            <SelectValueIcon class="flex" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <For each={calendarItems}>
                {(calendar) => (
                  <SelectItem label={calendar.label} value={calendar.value}>
                    <SelectItemIcon class="flex">
                      <CalendarDot calendarId={calendar.value} />
                    </SelectItemIcon>
                    {calendar.label}
                  </SelectItem>
                )}
              </For>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <RepeatField
        locale={props.locale}
        minimumEnd={repeatsFrom(draft(), props.timeZone)}
        onChange={(repeat) => update({ repeat })}
        // Presets are named after the day the series repeats on, in its own zone.
        startDate={(() => {
          const current = validInterval();
          return current === null ? draft().startDate : seriesDate(current, draft().seriesTimeZone);
        })()}
        timeZone={draft().seriesTimeZone}
        value={draft().repeat}
      />
      <Show when={draft().calendarId === "work"}>
        <ResourcePicker
          eventId={props.initial.id}
          interval={validInterval()}
          onChange={(resourceIds) => update({ resourceIds })}
          value={draft().resourceIds ?? []}
        />
      </Show>
      <div class="grid gap-2">
        <Label for={`${id}-description`}>Description</Label>
        <Textarea
          class="max-h-40"
          id={`${id}-description`}
          onInput={(event) => update({ description: event.currentTarget.value })}
          value={draft().description}
        />
      </div>
      <Show when={error()}>
        {(message) => (
          <p role="alert" class="text-sm text-destructive">
            {message()}
          </p>
        )}
      </Show>
      <DialogFooter>
        <Button disabled={saving()} type="submit">
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

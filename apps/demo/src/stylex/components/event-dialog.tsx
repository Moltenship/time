import * as stylex from "@stylexjs/stylex";
import { useId } from "react";

import { eventColorStyles } from "@registry/stylex-calendar-theme/event-color-styles";
import { Button } from "@registry/stylex-calendar-ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@registry/stylex-calendar-ui/select";

import { demoCalendars, getCalendarColor, isDemoCalendarId } from "../../calendars";
import { moveDraftStart, repeatsFrom, type EventDraft } from "../../event-draft";
import { parseDate, parseTime, timeValue, type EventFormOptions } from "../../event-form";
import { useEventForm } from "../../use-event-form";
import { seriesDate } from "../../repeat";
import { StylexDemoCalendar } from "../calendar";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input, Label, Textarea } from "../ui/field";
import { visuallyHidden } from "../ui/visually-hidden";
import { RepeatField } from "./repeat-field";
import { ResourcePicker } from "./resource-picker";

const small = "@media (min-width: 640px)";

const styles = stylex.create({
  content: {
    maxWidth: { default: "calc(100% - 2rem)", [small]: "28rem" },
  },
  form: {
    display: "grid",
    gap: "1rem",
  },
  title: {
    fontSize: "1.125rem",
    height: "2.75rem",
    lineHeight: "calc(1.75 / 1.125)",
  },
  allDay: {
    width: "fit-content",
  },
  when: {
    alignItems: "center",
    columnGap: "0.5rem",
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    rowGap: "0.75rem",
  },
  span: {
    gridColumn: "span 2 / span 2",
  },
  time: {
    width: { default: "6.5rem", [small]: "7rem" },
  },
  field: {
    display: "grid",
    gap: "0.5rem",
  },
  full: {
    width: "100%",
  },
  dot: {
    backgroundColor: "var(--calendar-event-border)",
    borderRadius: "9999px",
    flexShrink: 0,
    height: "0.75rem",
    width: "0.75rem",
  },
  option: {
    alignItems: "center",
    display: "flex",
    gap: "0.375rem",
  },
  description: {
    maxHeight: "10rem",
  },
  error: {
    color: "var(--destructive)",
    fontSize: "0.875rem",
    lineHeight: "calc(1.25 / 0.875)",
  },
});

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
        finalFocus={() => (returnFocus?.isConnected === true ? returnFocus : undefined)}
        xstyle={styles.content}
      >
        {draft !== null && (
          <EventForm initial={draft} locale={locale} onSave={onSave} timeZone={timeZone} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CalendarDot({ calendarId }: { readonly calendarId: string }) {
  const color = isDemoCalendarId(calendarId) ? getCalendarColor(calendarId) : undefined;
  return (
    <span
      aria-hidden
      data-color={color}
      {...stylex.props(styles.dot, color !== undefined && eventColorStyles[color])}
    />
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
  const actions = StylexDemoCalendar.useCalendarActions();
  const { draft, error, interval, saving, setDraft, submit, update } = useEventForm({
    actions,
    initial,
    onSave,
    timeZone,
  });

  return (
    <form noValidate onSubmit={submit} {...stylex.props(styles.form)}>
      <DialogHeader>
        <DialogTitle>{initial.id === undefined ? "New event" : "Edit event"}</DialogTitle>
      </DialogHeader>
      <Input
        aria-invalid={error !== undefined && draft.title.trim() === ""}
        aria-label="Title"
        autoFocus
        onChange={(event) => update({ title: event.target.value })}
        placeholder="Add title"
        value={draft.title}
        xstyle={styles.title}
      />
      <Label xstyle={styles.allDay}>
        <Checkbox
          checked={draft.allDay}
          // A task goes on a time slot, so it can go back to the unscheduled tasks.
          disabled={initial.newId !== undefined}
          onCheckedChange={(checked) => update({ allDay: checked === true })}
        />
        All day
      </Label>
      <fieldset {...stylex.props(styles.when)}>
        <legend {...stylex.props(visuallyHidden.text)}>When</legend>
        <Label htmlFor={`${id}-start`}>Starts</Label>
        <Input
          id={`${id}-start`}
          onChange={(event) => {
            const date = parseDate(event.target.value);
            if (date) setDraft((current) => moveDraftStart(current, date, current.startTime));
          }}
          type="date"
          value={draft.startDate.toString()}
          xstyle={draft.allDay && styles.span}
        />
        <Input
          aria-label="Start time"
          hidden={draft.allDay}
          onChange={(event) => {
            const time = parseTime(event.target.value);
            if (time) setDraft((current) => moveDraftStart(current, current.startDate, time));
          }}
          step={300}
          type="time"
          value={timeValue(draft.startTime)}
          xstyle={styles.time}
        />
        <Label htmlFor={`${id}-end`}>Ends</Label>
        <Input
          id={`${id}-end`}
          onChange={(event) => {
            const endDate = parseDate(event.target.value);
            if (endDate) update({ endDate });
          }}
          type="date"
          value={draft.endDate.toString()}
          xstyle={draft.allDay && styles.span}
        />
        <Input
          aria-label="End time"
          hidden={draft.allDay}
          onChange={(event) => {
            const endTime = parseTime(event.target.value);
            if (endTime) update({ endTime });
          }}
          step={300}
          type="time"
          value={timeValue(draft.endTime)}
          xstyle={styles.time}
        />
      </fieldset>
      <div {...stylex.props(styles.field)}>
        <Label htmlFor={`${id}-calendar`}>Calendar</Label>
        <Select
          items={demoCalendars.map(({ id: value, name }) => ({ label: name, value }))}
          onValueChange={(calendarId) => {
            if (isDemoCalendarId(calendarId)) update({ calendarId });
          }}
          value={draft.calendarId}
        >
          <SelectTrigger id={`${id}-calendar`} xstyle={styles.full}>
            <span {...stylex.props(styles.option)}>
              <CalendarDot calendarId={draft.calendarId} />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {demoCalendars.map((calendar) => (
                <SelectItem key={calendar.id} label={calendar.name} value={calendar.id}>
                  <span {...stylex.props(styles.option)}>
                    <CalendarDot calendarId={calendar.id} />
                    {calendar.name}
                  </span>
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
      <div {...stylex.props(styles.field)}>
        <Label htmlFor={`${id}-description`}>Description</Label>
        <Textarea
          id={`${id}-description`}
          onChange={(event) => update({ description: event.target.value })}
          value={draft.description}
          xstyle={styles.description}
        />
      </div>
      {error !== undefined && (
        <p role="alert" {...stylex.props(styles.error)}>
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

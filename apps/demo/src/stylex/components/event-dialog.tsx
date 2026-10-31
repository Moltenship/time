import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TimeInput } from "@astryxdesign/core/TimeInput";
import type { IsoDayOfWeek } from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef } from "react";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";

import { demoCalendars, isDemoCalendarId } from "../../calendars";
import { moveDraftStart, repeatsFrom, type EventDraft } from "../../event-draft";
import { parseDate, parseTime, useEventForm, type EventFormOptions } from "../../event-form";
import { seriesDate } from "../../repeat";
import { StylexDemoCalendar } from "../calendar";
import { isoDate, isoTime } from "./iso";
import { RepeatField } from "./repeat-field";
import { ResourcePicker } from "./resource-picker";
import { Swatch } from "./swatch";

const styles = stylex.create({
  error: {
    color: calendarVars["--destructive"],
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
  },
  // The form holds the dialog's header, content and footer without being a box of its own.
  form: {
    display: "contents",
  },
  option: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
  },
  when: {
    columnGap: "0.5rem",
    display: "grid",
    gridTemplateColumns: "1fr 8rem",
    minWidth: 0,
    rowGap: "0.75rem",
  },
  whenAllDay: {
    gridTemplateColumns: "1fr",
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
  readonly weekStartsOn: IsoDayOfWeek;
}

export function EventDialog({
  draft,
  locale,
  onOpenChange,
  onSave,
  returnFocus,
  timeZone,
  weekStartsOn,
}: EventDialogProps) {
  const open = draft !== null;
  // Astryx's dialog returns focus to what was focused as it opened, in its own effect, which runs
  // before this one: a place to return to wins over it.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open && returnFocus?.isConnected === true) returnFocus.focus();
    wasOpen.current = open;
  }, [open, returnFocus]);

  return (
    <Dialog
      // Bounded by the viewport so a long description scrolls instead of pushing Save off-screen.
      maxHeight="calc(100dvh - 2rem)"
      isOpen={open}
      onOpenChange={onOpenChange}
      purpose="form"
      width={480}
    >
      {draft !== null && (
        <EventForm
          initial={draft}
          locale={locale}
          onOpenChange={onOpenChange}
          onSave={onSave}
          timeZone={timeZone}
          weekStartsOn={weekStartsOn}
        />
      )}
    </Dialog>
  );
}

/** Whether a locale writes times on a 12-hour clock, as the native field the other UI has does. */
function hourFormat(locale: Intl.LocalesArgument): "12h" | "24h" {
  const { hour12 } = new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions();
  return hour12 === true ? "12h" : "24h";
}

function EventForm({
  initial,
  locale,
  onOpenChange,
  onSave,
  timeZone,
  weekStartsOn,
}: {
  readonly initial: EventDraft;
  readonly locale: Intl.LocalesArgument;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: EventDialogProps["onSave"];
  readonly timeZone: string;
  readonly weekStartsOn: IsoDayOfWeek;
}) {
  const actions = StylexDemoCalendar.useCalendarActions();
  const { draft, error, interval, saving, setDraft, submit, update } = useEventForm({
    actions,
    initial,
    onSave,
    timeZone,
  });
  // After Astryx's dialog header has focused its title, which it does each time its effect runs.
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  const clock = hourFormat(locale);
  const firstDay = weekStartsOn === 7 ? 0 : weekStartsOn;

  return (
    <form noValidate onSubmit={submit} {...stylex.props(styles.form)}>
      <Layout
        content={
          <LayoutContent>
            <VStack gap={4}>
              <TextInput
                ref={titleRef}
                hasAutoFocus
                isLabelHidden
                label="Title"
                onChange={(title) => update({ title })}
                placeholder="Add title"
                size="lg"
                status={
                  error !== undefined && draft.title.trim() === "" ? { type: "error" } : undefined
                }
                value={draft.title}
                width="100%"
              />
              <CheckboxInput
                // A task goes on a time slot, so it can go back to the unscheduled tasks.
                isDisabled={initial.newId !== undefined}
                label="All day"
                onChange={(allDay) => update({ allDay })}
                value={draft.allDay}
              />
              <fieldset
                aria-label="When"
                {...stylex.props(styles.when, draft.allDay && styles.whenAllDay)}
              >
                <DateInput
                  label="Starts"
                  onChange={(text) => {
                    const date = text === undefined ? undefined : parseDate(text);
                    if (date)
                      setDraft((current) => moveDraftStart(current, date, current.startTime));
                  }}
                  value={isoDate(draft.startDate)}
                  weekStartsOn={firstDay}
                  width="100%"
                />
                {!draft.allDay && (
                  <TimeInput
                    hourFormat={clock}
                    increment={5}
                    label="Start time"
                    onChange={(text) => {
                      const time = text === undefined ? undefined : parseTime(text);
                      if (time)
                        setDraft((current) => moveDraftStart(current, current.startDate, time));
                    }}
                    value={isoTime(draft.startTime)}
                    width="100%"
                  />
                )}
                <DateInput
                  label="Ends"
                  onChange={(text) => {
                    const endDate = text === undefined ? undefined : parseDate(text);
                    if (endDate) update({ endDate });
                  }}
                  value={isoDate(draft.endDate)}
                  weekStartsOn={firstDay}
                  width="100%"
                />
                {!draft.allDay && (
                  <TimeInput
                    hourFormat={clock}
                    increment={5}
                    label="End time"
                    onChange={(text) => {
                      const endTime = text === undefined ? undefined : parseTime(text);
                      if (endTime) update({ endTime });
                    }}
                    value={isoTime(draft.endTime)}
                    width="100%"
                  />
                )}
              </fieldset>
              <Selector
                label="Calendar"
                onChange={(calendarId) => {
                  if (isDemoCalendarId(calendarId)) update({ calendarId });
                }}
                options={demoCalendars.map(({ id, name }) => ({ label: name, value: id }))}
                renderOption={({ label, value }) => (
                  <span {...stylex.props(styles.option)}>
                    <Swatch color={demoCalendars.find(({ id }) => id === value)?.color} />
                    {label}
                  </span>
                )}
                renderValue={({ label, value }) => (
                  <span {...stylex.props(styles.option)}>
                    <Swatch color={demoCalendars.find(({ id }) => id === value)?.color} />
                    {label}
                  </span>
                )}
                value={draft.calendarId}
                width="100%"
              />
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
              <TextArea
                label="Description"
                onChange={(description) => update({ description })}
                value={draft.description}
                width="100%"
              />
              {error !== undefined && (
                <p role="alert" {...stylex.props(styles.error)}>
                  {error}
                </p>
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end">
              <Button isDisabled={saving} label="Save" type="submit" variant="primary" />
            </HStack>
          </LayoutFooter>
        }
        header={
          <DialogHeader
            onOpenChange={onOpenChange}
            title={initial.id === undefined ? "New event" : "Edit event"}
          />
        }
      />
    </form>
  );
}

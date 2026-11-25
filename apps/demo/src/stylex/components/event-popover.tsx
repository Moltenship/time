import * as stylex from "@stylexjs/stylex";
import { Popover, PopoverClose, PopoverContent } from "@ui-sdk/react/popover";
import {
  AlignLeftIcon,
  CalendarIcon,
  CalendarMinusIcon,
  PencilIcon,
  RepeatIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useId, useState } from "react";

import { popoverStyles } from "@registry/shared/stylex-calendar-ui/popover.styles";
import { eventColorStyles } from "@registry/stylex-calendar-theme/event-color-styles";
import { xprops } from "@registry/stylex-calendar-theme/xprops";
import { Button } from "@registry/stylex-calendar-ui/button";

import { demoCalendars } from "../../calendars";
import type { DemoOccurrence } from "../../demo-model";
import { formatEventWhen } from "../../event-format";
import { describeOccurrenceRecurrence } from "../../event-recurrence";
import { taskFromOccurrence, type DemoTaskList } from "../../tasks";
import { useUnschedule } from "../../unschedule";
import { StylexDemoCalendar } from "../calendar";

const styles = stylex.create({
  popup: {
    padding: "0.75rem",
    width: "20rem",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    marginRight: "-0.25rem",
    marginTop: "-0.25rem",
  },
  details: {
    columnGap: "0.75rem",
    display: "grid",
    gridTemplateColumns: "1rem 1fr",
    paddingBottom: "0.25rem",
    paddingInline: "0.25rem",
    rowGap: "0.75rem",
  },
  color: {
    backgroundColor: "var(--calendar-event-border)",
    borderRadius: 4,
    height: "0.875rem",
    marginTop: "0.375rem",
    width: "0.875rem",
  },
  title: {
    fontSize: "1.125rem",
    fontWeight: 500,
    lineHeight: 1.375,
  },
  muted: {
    color: "var(--muted-foreground)",
  },
  changed: {
    display: "block",
  },
  icon: {
    color: "var(--muted-foreground)",
    height: "1rem",
    marginTop: "0.125rem",
    width: "1rem",
  },
  description: {
    whiteSpace: "pre-wrap",
  },
});

export interface EventPopoverProps {
  /** The clicked event element the popover points at; kept after closing to restore focus. */
  readonly anchor: HTMLElement | null;
  readonly locale: Intl.LocalesArgument;
  /** The event or occurrence shown; the popover is open while it is set. */
  readonly occurrence: DemoOccurrence | undefined;
  readonly onClose: () => void;
  readonly onEdit: (occurrence: DemoOccurrence) => void;
  /** Hears an event the popover unscheduled, to say so and move focus to its task. */
  readonly onUnscheduled: (occurrence: DemoOccurrence) => void;
  /** The unscheduled tasks, which "Unschedule" moves a timed one-off event into. */
  readonly taskList: Pick<DemoTaskList, "addTask" | "removeTask" | "resets">;
  readonly timeZone: string;
}

export function EventPopover({
  anchor,
  locale,
  occurrence,
  onClose,
  onEdit,
  onUnscheduled,
  taskList,
  timeZone,
}: EventPopoverProps) {
  const actions = StylexDemoCalendar.useCalendarActions();
  const onUnschedule = useUnschedule(actions, taskList);
  const titleId = useId();
  // Set with the change that closes the popover, so it closes with focus left alone.
  const [handingOffFocus, setHandingOffFocus] = useState(false);
  const event = occurrence?.event;
  const calendar = demoCalendars.find(({ id }) => id === event?.calendarId);
  const repeats =
    occurrence === undefined
      ? undefined
      : describeOccurrenceRecurrence(occurrence, timeZone, locale);

  return (
    // ui-sdk's parts rather than the kit's PopoverContent, because it points at the clicked event
    // (`anchor`) instead of a trigger; the panel has the kit popover's look.
    <Popover
      // Tab cycles through the popover's actions instead of leaving focus on the page body, since
      // it has no trigger to continue from; Escape or Close returns to the event.
      modal="trap-focus"
      open={occurrence !== undefined && anchor !== null}
      onOpenChange={(open) => !open && onClose()}
      onOpenChangeComplete={(open) => !open && setHandingOffFocus(false)}
    >
      {occurrence !== undefined && event !== undefined && (
        <PopoverContent
          align="start"
          anchor={anchor}
          aria-labelledby={titleId}
          collisionPadding={8}
          // Opening the editor hands focus to its dialog, and unscheduling to the event's task; a
          // plain dismissal returns it to the event the popover was opened from.
          finalFocus={
            handingOffFocus ? "none" : () => (anchor?.isConnected === true ? anchor : undefined)
          }
          sideOffset={4}
          {...xprops({}, popoverStyles.content, styles.popup)}
        >
          <div {...stylex.props(styles.actions)}>
            {/* A live meeting is made fresh on each visit and can't be changed. */}
            {event.live !== true && (
              <Button
                aria-label="Edit event"
                onClick={() => {
                  setHandingOffFocus(true);
                  onEdit(occurrence);
                }}
                size="icon-sm"
                variant="ghost"
              >
                <PencilIcon aria-hidden />
              </Button>
            )}
            {taskFromOccurrence(occurrence) !== null && (
              <Button
                aria-label="Unschedule event"
                onClick={() => {
                  // The event goes once its delete saves, so focus moves to its task instead.
                  setHandingOffFocus(true);
                  onClose();
                  onUnschedule(occurrence);
                  onUnscheduled(occurrence);
                }}
                size="icon-sm"
                variant="ghost"
              >
                <CalendarMinusIcon aria-hidden />
              </Button>
            )}
            {event.live !== true && (
              <Button
                aria-label="Delete event"
                onClick={() => {
                  onClose();
                  // Goes through onEventChange, so a failed save brings the event back, and
                  // an occurrence of a series asks which occurrences to delete.
                  void actions.proposeEventChange({ cause: "delete", eventId: occurrence.id });
                }}
                size="icon-sm"
                variant="ghost"
              >
                <Trash2Icon aria-hidden />
              </Button>
            )}
            <PopoverClose render={<Button aria-label="Close" size="icon-sm" variant="ghost" />}>
              <XIcon aria-hidden />
            </PopoverClose>
          </div>
          <div {...stylex.props(styles.details)}>
            <span
              data-color={calendar?.color}
              {...stylex.props(
                styles.color,
                calendar !== undefined && eventColorStyles[calendar.color],
              )}
            />
            <div>
              <h2 id={titleId} {...stylex.props(styles.title)}>
                {event.title}
              </h2>
              <p {...stylex.props(styles.muted)}>
                {formatEventWhen(occurrence.interval, timeZone, locale)}
              </p>
            </div>
            {repeats !== undefined && (
              <>
                <RepeatIcon aria-hidden {...stylex.props(styles.icon)} />
                <p>
                  {repeats.rule}
                  {repeats.changed && (
                    <span {...stylex.props(styles.changed, styles.muted)}>
                      Changed for this date only
                    </span>
                  )}
                </p>
              </>
            )}
            <CalendarIcon aria-hidden {...stylex.props(styles.icon)} />
            <span>{calendar?.name}</span>
            {event.description !== undefined && (
              <>
                <AlignLeftIcon aria-hidden {...stylex.props(styles.icon)} />
                <p {...stylex.props(styles.description)}>{event.description}</p>
              </>
            )}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

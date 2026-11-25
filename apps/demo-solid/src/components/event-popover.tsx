import { Popover, PopoverClose, PopoverContent } from "@ui-sdk/solid/popover";
import { createEffect, createMemo, createSignal, createUniqueId, Show } from "solid-js";

import { Button } from "@registry/calendar-ui/button";
import { popoverContentClassName } from "@registry/shared/calendar-ui/popover.styles";
import { cn } from "cn";

import { demoCalendars } from "@demo/calendars";
import type { DemoOccurrence } from "@demo/demo-model";
import { formatEventWhen } from "@demo/event-format";
import { describeOccurrenceRecurrence } from "@demo/event-recurrence";
import { taskFromOccurrence, type DemoTaskList } from "@demo/tasks";
import { unschedule } from "@demo/unschedule";

import { Calendar } from "../calendar";
import {
  AlignLeftIcon,
  CalendarIcon,
  CalendarMinusIcon,
  PencilIcon,
  RepeatIcon,
  Trash2Icon,
  XIcon,
} from "../icons";

/**
 * The React demo's event popover (apps/demo/src/components/event-popover.tsx): what a clicked
 * event is, and Edit, Unschedule, Delete and Close. It points at the clicked event, `anchor`,
 * rather than at a trigger.
 */
export function EventPopover(props: {
  /** The clicked event's element; kept after closing to restore focus. */
  readonly anchor: HTMLElement | null;
  readonly locale: Intl.LocalesArgument;
  /** The event or occurrence shown; the popover is open while it is set. */
  readonly occurrence: DemoOccurrence | undefined;
  readonly onClose: () => void;
  readonly onEdit: (occurrence: DemoOccurrence) => void;
  /** Hears an event the popover unscheduled, to say so and move focus to its task. */
  readonly onUnscheduled: (occurrence: DemoOccurrence) => void;
  readonly taskList: Pick<DemoTaskList, "addTask" | "removeTask" | "resets">;
  readonly timeZone: string;
}) {
  const actions = Calendar.useCalendarActions();
  const titleId = createUniqueId();
  // Opening the editor hands focus to its dialog, and unscheduling to the event's task.
  const [handingOffFocus, setHandingOffFocus] = createSignal(false, { ownedWrite: true });
  // The last event shown stays while the popover fades out.
  let last: DemoOccurrence | undefined;
  const shown = createMemo(() => (last = props.occurrence ?? last));
  const open = () => props.occurrence !== undefined && props.anchor !== null;
  createEffect(open, (isOpen) => {
    if (isOpen) setHandingOffFocus(false);
  });

  return (
    <Popover
      // Tab cycles through the popover's actions, since it has no trigger to continue from;
      // Escape or Close returns to the event.
      modal="trap-focus"
      open={open()}
      onOpenChange={(next) => !next && props.onClose()}
    >
      <Show when={shown()}>
        {(occurrence) => {
          const event = () => occurrence().event;
          const calendar = () => demoCalendars.find(({ id }) => id === event().calendarId);
          const repeats = () =>
            describeOccurrenceRecurrence(occurrence(), props.timeZone, props.locale);
          return (
            <PopoverContent
              align="start"
              anchor={props.anchor}
              aria-labelledby={titleId}
              class={cn(popoverContentClassName, "w-80 p-3")}
              collisionPadding={8}
              // A plain dismissal returns focus to the event the popover was opened from.
              finalFocus={
                handingOffFocus()
                  ? "none"
                  : () => (props.anchor?.isConnected === true ? props.anchor : undefined)
              }
              sideOffset={4}
            >
              <div class="-mt-1 -mr-1 flex justify-end">
                {/* A live meeting is made fresh on each visit and can't be changed. */}
                <Show when={event().live !== true}>
                  <Button
                    aria-label="Edit event"
                    onClick={() => {
                      setHandingOffFocus(true);
                      props.onEdit(occurrence());
                    }}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <PencilIcon />
                  </Button>
                </Show>
                <Show when={taskFromOccurrence(occurrence()) !== null}>
                  <Button
                    aria-label="Unschedule event"
                    onClick={() => {
                      // The event goes once its delete saves, so focus moves to its task instead.
                      setHandingOffFocus(true);
                      const unscheduled = occurrence();
                      props.onClose();
                      unschedule(actions, props.taskList, unscheduled);
                      props.onUnscheduled(unscheduled);
                    }}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <CalendarMinusIcon />
                  </Button>
                </Show>
                <Show when={event().live !== true}>
                  <Button
                    aria-label="Delete event"
                    onClick={() => {
                      const eventId = occurrence().id;
                      props.onClose();
                      // Goes through onEventChange, so a failed save brings the event back, and
                      // an occurrence of a series asks which occurrences to delete.
                      void actions.proposeEventChange({ cause: "delete", eventId });
                    }}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Trash2Icon />
                  </Button>
                </Show>
                <PopoverClose
                  render={(close) => (
                    <Button {...close} aria-label="Close" size="icon-sm" variant="ghost" />
                  )}
                >
                  <XIcon />
                </PopoverClose>
              </div>
              <div class="grid grid-cols-[1rem_1fr] gap-x-3 gap-y-3 px-1 pb-1 text-sm">
                <span
                  data-color={calendar()?.color}
                  class="mt-1.5 size-3.5 rounded-[4px] bg-calendar-event-border"
                />
                <div>
                  <h2 id={titleId} class="text-lg leading-snug font-medium">
                    {event().title}
                  </h2>
                  <p class="text-muted-foreground">
                    {formatEventWhen(occurrence().interval, props.timeZone, props.locale)}
                  </p>
                </div>
                <Show when={repeats()}>
                  {(described) => (
                    <>
                      <RepeatIcon aria-hidden="true" class="mt-0.5 size-4 text-muted-foreground" />
                      <p>
                        {described().rule}
                        <Show when={described().changed}>
                          <span class="block text-muted-foreground">
                            Changed for this date only
                          </span>
                        </Show>
                      </p>
                    </>
                  )}
                </Show>
                <CalendarIcon class="mt-0.5 size-4 text-muted-foreground" />
                <span>{calendar()?.name}</span>
                <Show when={event().description !== undefined}>
                  <AlignLeftIcon class="mt-0.5 size-4 text-muted-foreground" />
                  <p class="whitespace-pre-wrap">{event().description}</p>
                </Show>
              </div>
            </PopoverContent>
          );
        }}
      </Show>
    </Popover>
  );
}

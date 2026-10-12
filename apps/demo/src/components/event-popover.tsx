import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  AlignLeftIcon,
  CalendarIcon,
  PencilIcon,
  RepeatIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useId, useRef } from "react";

import { Button } from "@registry/ui/button";

import { DemoCalendar, type DemoOccurrence } from "../calendar";
import { demoCalendars } from "../calendars";
import { formatEventWhen } from "../event-format";
import { describeOccurrenceRecurrence } from "../event-recurrence";

export interface EventPopoverProps {
  /** The clicked event element the popover points at; kept after closing to restore focus. */
  readonly anchor: HTMLElement | null;
  readonly locale: Intl.LocalesArgument;
  /** The event or occurrence shown; the popover is open while it is set. */
  readonly occurrence: DemoOccurrence | undefined;
  readonly onClose: () => void;
  readonly onEdit: (occurrence: DemoOccurrence) => void;
  readonly timeZone: string;
}

export function EventPopover({
  anchor,
  locale,
  occurrence,
  onClose,
  onEdit,
  timeZone,
}: EventPopoverProps) {
  const titleId = useId();
  const actions = DemoCalendar.useCalendarActions();
  const handingOffToEditor = useRef(false);
  const event = occurrence?.event;
  const calendar = demoCalendars.find(({ id }) => id === event?.calendarId);
  const repeats =
    occurrence === undefined
      ? undefined
      : describeOccurrenceRecurrence(occurrence, timeZone, locale);

  return (
    // Built from Base UI parts rather than the registry PopoverContent, because it points at the
    // clicked event (`anchor`) instead of a trigger; the popup classes match PopoverContent's.
    <PopoverPrimitive.Root
      // Tab cycles through the popover's actions instead of leaving focus on the page body, since
      // it has no trigger to continue from; Escape or Close returns to the event.
      modal="trap-focus"
      open={occurrence !== undefined && anchor !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {occurrence !== undefined && event !== undefined && (
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            align="start"
            anchor={anchor}
            className="isolate z-50"
            collisionPadding={8}
            sideOffset={4}
          >
            <PopoverPrimitive.Popup
              aria-labelledby={titleId}
              className="z-50 flex w-80 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
              // Opening the editor hands focus to its dialog; a plain dismissal returns it to the
              // event the popover was opened from.
              finalFocus={() => {
                if (!handingOffToEditor.current)
                  return anchor?.isConnected === true ? anchor : true;
                handingOffToEditor.current = false;
                return false;
              }}
            >
              <div className="-mt-1 -mr-1 flex justify-end">
                {/* A live meeting is made fresh on each visit and can't be changed. */}
                {event.live !== true && (
                  <Button
                    aria-label="Edit event"
                    onClick={() => {
                      handingOffToEditor.current = true;
                      onEdit(occurrence);
                    }}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <PencilIcon />
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
                    <Trash2Icon />
                  </Button>
                )}
                <PopoverPrimitive.Close
                  render={<Button aria-label="Close" size="icon-sm" variant="ghost" />}
                >
                  <XIcon />
                </PopoverPrimitive.Close>
              </div>
              <div className="grid grid-cols-[1rem_1fr] gap-x-3 gap-y-3 px-1 pb-1 text-sm">
                <span
                  data-color={calendar?.color}
                  className="mt-1.5 size-3.5 rounded-[4px] bg-calendar-event-border"
                />
                <div>
                  <h2 id={titleId} className="text-lg leading-snug font-medium">
                    {event.title}
                  </h2>
                  <p className="text-muted-foreground">
                    {formatEventWhen(occurrence.interval, timeZone, locale)}
                  </p>
                </div>
                {repeats !== undefined && (
                  <>
                    <RepeatIcon aria-hidden className="mt-0.5 size-4 text-muted-foreground" />
                    <p>
                      {repeats.rule}
                      {repeats.changed && (
                        <span className="block text-muted-foreground">
                          Changed for this date only
                        </span>
                      )}
                    </p>
                  </>
                )}
                <CalendarIcon className="mt-0.5 size-4 text-muted-foreground" />
                <span>{calendar?.name}</span>
                {event.description !== undefined && (
                  <>
                    <AlignLeftIcon className="mt-0.5 size-4 text-muted-foreground" />
                    <p className="whitespace-pre-wrap">{event.description}</p>
                  </>
                )}
              </div>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      )}
    </PopoverPrimitive.Root>
  );
}

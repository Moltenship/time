import { AlignLeftIcon, CalendarIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { useId, useRef } from "react";

import { Button } from "@registry/ui/button";
import { Popover, PopoverAnchor, PopoverClose, PopoverContent } from "@registry/ui/popover";

import { DemoCalendar, type DemoEvent } from "../calendar";
import { demoCalendars } from "../calendars";
import { formatEventWhen } from "../event-format";

export interface EventPopoverProps {
  /** The clicked event element the popover points at; kept after closing to restore focus. */
  readonly anchor: HTMLElement | null;
  /** The event shown; the popover is open while it is set. */
  readonly event: DemoEvent | undefined;
  readonly locale: Intl.LocalesArgument;
  readonly onClose: () => void;
  readonly onEdit: (event: DemoEvent) => void;
  readonly timeZone: string;
}

export function EventPopover({
  anchor,
  event,
  locale,
  onClose,
  onEdit,
  timeZone,
}: EventPopoverProps) {
  const titleId = useId();
  const actions = DemoCalendar.useCalendarActions();
  const handingOffToEditor = useRef(false);
  const calendar = demoCalendars.find(({ id }) => id === event?.calendarId);

  return (
    <Popover
      open={event !== undefined && anchor !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {anchor !== null && <PopoverAnchor virtualRef={{ current: anchor }} />}
      {event !== undefined && (
        <PopoverContent
          align="start"
          aria-labelledby={titleId}
          className="w-80 p-3"
          collisionPadding={8}
          onCloseAutoFocus={(focusEvent) => {
            // Opening the editor hands focus to its dialog; a plain dismissal returns it to the
            // event the popover was opened from.
            if (handingOffToEditor.current) {
              handingOffToEditor.current = false;
              focusEvent.preventDefault();
            } else if (anchor?.isConnected === true) {
              focusEvent.preventDefault();
              anchor.focus();
            }
          }}
        >
          <div className="-mt-1 -mr-1 flex justify-end">
            <Button
              aria-label="Edit event"
              onClick={() => {
                handingOffToEditor.current = true;
                onEdit(event);
              }}
              size="icon-sm"
              variant="ghost"
            >
              <PencilIcon />
            </Button>
            <Button
              aria-label="Delete event"
              onClick={() => {
                onClose();
                // Goes through onEventChange, so a failed save brings the event back.
                void actions.proposeEventChange({ cause: "delete", eventId: event.id });
              }}
              size="icon-sm"
              variant="ghost"
            >
              <Trash2Icon />
            </Button>
            <PopoverClose asChild>
              <Button aria-label="Close" size="icon-sm" variant="ghost">
                <XIcon />
              </Button>
            </PopoverClose>
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
              <p className="text-muted-foreground">{formatEventWhen(event, timeZone, locale)}</p>
            </div>
            <CalendarIcon className="mt-0.5 size-4 text-muted-foreground" />
            <span>{calendar?.name}</span>
            {event.description !== undefined && (
              <>
                <AlignLeftIcon className="mt-0.5 size-4 text-muted-foreground" />
                <p className="whitespace-pre-wrap">{event.description}</p>
              </>
            )}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

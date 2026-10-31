import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import * as stylex from "@stylexjs/stylex";
import {
  AlignLeftIcon,
  CalendarIcon,
  CalendarMinusIcon,
  PencilIcon,
  RepeatIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useId, useRef, type KeyboardEvent } from "react";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import { eventColorStyles } from "@registry/stylex-calendar-theme/event-color-styles";

import { demoCalendars } from "../../calendars";
import type { DemoOccurrence } from "../../demo-model";
import { formatEventWhen } from "../../event-format";
import { describeOccurrenceRecurrence } from "../../event-recurrence";
import { taskFromOccurrence, type DemoTaskList } from "../../tasks";
import { useUnschedule } from "../../unschedule";
import { StylexDemoCalendar } from "../calendar";

const popIn = stylex.keyframes({ from: { opacity: 0, transform: "scale3d(0.95, 0.95, 0.95)" } });
const popOut = stylex.keyframes({ to: { opacity: 0, transform: "scale3d(0.95, 0.95, 0.95)" } });

const styles = stylex.create({
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    marginInlineEnd: "-0.25rem",
    marginTop: "-0.25rem",
  },
  color: {
    backgroundColor: calendarVars["--calendar-event-border"],
    borderRadius: "4px",
    height: "0.875rem",
    marginTop: "0.25rem",
    width: "0.875rem",
  },
  description: {
    whiteSpace: "pre-wrap",
  },
  details: {
    columnGap: "0.75rem",
    display: "grid",
    gridTemplateColumns: "1rem 1fr",
    paddingBlockEnd: "0.25rem",
    paddingInline: "0.25rem",
    rowGap: "0.75rem",
  },
  icon: {
    color: calendarVars["--muted-foreground"],
    height: "1rem",
    marginTop: "0.125rem",
    width: "1rem",
  },
  popup: {
    animationDuration: { default: "100ms", "@media (prefers-reduced-motion: reduce)": "0s" },
    animationName: { default: null, "[data-closed]": popOut, "[data-open]": popIn },
    backgroundColor: calendarVars["--popover"],
    borderRadius: "var(--radius)",
    boxShadow: `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1), 0 0 0 1px color-mix(in oklch, ${calendarVars["--foreground"]} 10%, transparent)`,
    color: calendarVars["--popover-foreground"],
    display: "flex",
    flexDirection: "column",
    gap: "0.625rem",
    outlineStyle: "none",
    padding: "0.75rem",
    transformOrigin: "var(--transform-origin)",
    width: "20rem",
    zIndex: 50,
  },
  positioner: {
    isolation: "isolate",
    zIndex: 50,
  },
});

/** Keeps Tab among the popover's actions, since it has no trigger to continue from. */
function cycleTab(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const popup = event.currentTarget;
  const actions = popup.querySelectorAll<HTMLElement>("button:not(:disabled)");
  const first = actions[0];
  const last = actions[actions.length - 1];
  const active = document.activeElement;
  if (event.shiftKey ? active === first || active === popup : active === last) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }
}

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
  const handingOffFocus = useRef(false);
  const event = occurrence?.event;
  const calendar = demoCalendars.find(({ id }) => id === event?.calendarId);
  const repeats =
    occurrence === undefined
      ? undefined
      : describeOccurrenceRecurrence(occurrence, timeZone, locale);

  return (
    // Built from Base UI parts rather than Astryx's Popover, because it points at the clicked event
    // (`anchor`) instead of a trigger, and follows it as views re-render it.
    // Not `modal="trap-focus"`, as the Tailwind popover is: that hides everything but live regions
    // from assistive tech, and each Astryx button holds one, which would keep the button and hide
    // its label. So `cycleTab` keeps Tab inside instead; Escape or Close returns to the event.
    <PopoverPrimitive.Root
      open={occurrence !== undefined && anchor !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {occurrence !== undefined && event !== undefined && (
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            align="start"
            anchor={anchor}
            collisionPadding={8}
            sideOffset={4}
            {...stylex.props(styles.positioner)}
          >
            <PopoverPrimitive.Popup
              aria-labelledby={titleId}
              // Opening the editor hands focus to its dialog, and unscheduling to the event's task; a
              // plain dismissal returns it to the event the popover was opened from.
              finalFocus={() => {
                if (!handingOffFocus.current) return anchor?.isConnected === true ? anchor : true;
                handingOffFocus.current = false;
                return false;
              }}
              onKeyDown={cycleTab}
              {...stylex.props(styles.popup)}
            >
              <div {...stylex.props(styles.actions)}>
                {/* A live meeting is made fresh on each visit and can't be changed. */}
                {event.live !== true && (
                  <IconButton
                    icon={<Icon icon={PencilIcon} />}
                    label="Edit event"
                    onClick={() => {
                      handingOffFocus.current = true;
                      onEdit(occurrence);
                    }}
                    size="sm"
                    variant="ghost"
                  />
                )}
                {taskFromOccurrence(occurrence) !== null && (
                  <IconButton
                    icon={<Icon icon={CalendarMinusIcon} />}
                    label="Unschedule event"
                    onClick={() => {
                      // The event goes once its delete saves, so focus moves to its task instead.
                      handingOffFocus.current = true;
                      onClose();
                      onUnschedule(occurrence);
                      onUnscheduled(occurrence);
                    }}
                    size="sm"
                    variant="ghost"
                  />
                )}
                {event.live !== true && (
                  <IconButton
                    icon={<Icon icon={Trash2Icon} />}
                    label="Delete event"
                    onClick={() => {
                      onClose();
                      // Goes through onEventChange, so a failed save brings the event back, and
                      // an occurrence of a series asks which occurrences to delete.
                      void actions.proposeEventChange({ cause: "delete", eventId: occurrence.id });
                    }}
                    size="sm"
                    variant="ghost"
                  />
                )}
                <PopoverPrimitive.Close
                  render={
                    <IconButton
                      icon={<Icon icon={XIcon} />}
                      label="Close"
                      size="sm"
                      variant="ghost"
                    />
                  }
                />
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
                  <Heading id={titleId} level={2}>
                    {event.title}
                  </Heading>
                  <Text as="p" color="secondary">
                    {formatEventWhen(occurrence.interval, timeZone, locale)}
                  </Text>
                </div>
                {repeats !== undefined && (
                  <>
                    <RepeatIcon aria-hidden {...stylex.props(styles.icon)} />
                    <p>
                      <Text display="block">{repeats.rule}</Text>
                      {repeats.changed && (
                        <Text color="secondary" display="block">
                          Changed for this date only
                        </Text>
                      )}
                    </p>
                  </>
                )}
                <CalendarIcon aria-hidden {...stylex.props(styles.icon)} />
                <Text>{calendar?.name}</Text>
                {event.description !== undefined && (
                  <>
                    <AlignLeftIcon aria-hidden {...stylex.props(styles.icon)} />
                    <Text as="p" xstyle={styles.description}>
                      {event.description}
                    </Text>
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

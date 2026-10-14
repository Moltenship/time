"use client";

import { Popover } from "@base-ui/react/popover";
import {
  eventIdOf,
  monitorCalendarDrags,
  type CalendarEventChange,
  type CalendarRect,
} from "@moltenship/calendar";
import { animateView } from "motion";
import { motion, useMotionValue, useSpring, useTransform, useVelocity } from "motion/react";
import { useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { createPortal, flushSync } from "react-dom";

import { calendarAnnouncements } from "@/components/calendar/announcements";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { Button } from "@/components/ui/button";

import { Calendar, meetings as initialMeetings, weekRules, type Meeting } from "./quick-start";

// #region morph
// Settles in about half a second.
const spring = { bounce: 0.1, type: "spring", visualDuration: 0.3 } as const;
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const chipTitle = '[data-slot="calendar-event-title"]';
const card = '[data-slot="meeting-card"]';
const cardTitle = '[data-slot="meeting-card-title"]';

/** An element on the page now, and what it becomes: an element, or a selector found after. */
type Pair = readonly [from: Element | null, to: Element | string | null];

/**
 * Runs `update` in a view transition that morphs a box into another, on a spring, and a title
 * into another. What's inside the box swaps at `swapAt` seconds, while it's small, so neither
 * side's contents stretch. Under reduced motion, or in a browser without view transitions, it
 * only runs `update`.
 */
function morph(update: () => void, [box, title]: readonly [Pair, Pair], swapAt: number) {
  if (reducedMotion()) return update();
  const view = animateView(
    async () => {
      flushSync(update);
      // Base UI places a popover a task after it mounts.
      await new Promise((resolve) => setTimeout(resolve));
    },
    // A new morph, such as opening again right after Escape, cuts the last one short. Start one
    // per event: Motion runs morphs started in the same task as one, without the wait above.
    { interrupt: "immediate" },
  );
  const swap = { delay: swapAt, duration: 0.15 };
  if (box[0] !== null && box[1] !== null) {
    view
      .add(box[0], box[1])
      .layout(spring)
      .old({ opacity: [1, 0] }, swap)
      .new({ opacity: [0, 1] }, swap);
  }
  if (title[0] !== null && title[1] !== null) {
    // Uncropped, with `.morph-text` in your CSS, so each side of the text keeps its size.
    view.add(title[0], title[1]).crop(false).class("morph-text").layout(spring);
  }
}

/** The meeting's chip grows into the card, and its title into the card's heading. */
function grow(chip: Element, update: () => void) {
  morph(
    update,
    [
      [chip, card],
      [chip.querySelector(chipTitle), cardTitle],
    ],
    0,
  );
}

/** The card shrinks back into the chip, and swaps back once it's small. */
function shrink(chip: Element, update: () => void) {
  const popup = document.querySelector(card);
  morph(
    update,
    [
      [popup, chip],
      [popup?.querySelector(cardTitle) ?? null, chip.querySelector(chipTitle)],
    ],
    0.2,
  );
}
// #endregion morph

// #region details
interface Opened {
  readonly anchor: HTMLElement;
  readonly meeting: Meeting;
}

function MeetingCard({ onClose, opened }: { opened: Opened | null; onClose: () => void }) {
  const close = () => {
    if (opened !== null) shrink(opened.anchor, onClose);
  };

  return (
    <Popover.Root open={opened !== null} onOpenChange={(open) => !open && close()}>
      {opened !== null && (
        <Popover.Portal>
          <Popover.Positioner anchor={opened.anchor} align="start" sideOffset={6}>
            <Popover.Popup
              // Escape or a click outside returns focus to the meeting it opened from.
              finalFocus={() => opened.anchor}
              data-slot="meeting-card"
              data-color={opened.meeting.color}
              className="flex w-72 flex-col gap-1 rounded-xl border-s-4 border-calendar-event-border bg-calendar-event p-4 text-calendar-event-foreground shadow-xl outline-none"
            >
              <Popover.Title data-slot="meeting-card-title" className="text-lg font-semibold">
                {opened.meeting.title}
              </Popover.Title>
              <p className="text-sm opacity-80">{formatWhen(opened.meeting)}</p>
              <Button className="mt-2 self-end" onClick={close} size="sm" variant="secondary">
                Close
              </Button>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      )}
    </Popover.Root>
  );
}
// #endregion details

// #region drag
interface Held {
  readonly color: string | undefined;
  readonly height: number;
  readonly title: string;
  readonly width: number;
}

const follow = { damping: 30, stiffness: 400 } as const;

/**
 * A copy of each meeting moved in `within` that trails the pointer on a spring and tilts with its
 * speed, over the calendar's own preview, which marks the slot. It lands where the drop is, or
 * flies back.
 */
function DragCard({ within }: { readonly within: RefObject<HTMLElement | null> }) {
  const [held, setHeld] = useState<Held | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [landed, setLanded] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, follow);
  const springY = useSpring(y, follow);
  const rotate = useTransform(useVelocity(springX), [-1500, 0, 1500], [-8, 0, 8], {
    clamp: true,
  });

  useEffect(
    () =>
      monitorCalendarDrags(({ element, event, origin }) => {
        // Drags in other calendars on the page are theirs. Under reduced motion the calendar's
        // preview alone follows the pointer.
        if (within.current?.contains(element) !== true || reducedMotion()) return;
        const box = element.getBoundingClientRect();
        const grab = { x: origin.x - box.x, y: origin.y - box.y };
        const moveTo = ({ x: left, y: top }: Pick<CalendarRect, "x" | "y">) => {
          x.set(left);
          y.set(top);
        };
        for (const [value, at] of [
          [x, box.x],
          [springX, box.x],
          [y, box.y],
          [springY, box.y],
        ] as const) {
          value.jump(at);
        }
        setLanded(false);
        setTime(null);
        setHeld({
          color: element.dataset.color,
          height: box.height,
          title: event.title,
          width: box.width,
        });
        // No `claims`: this follower only watches, and the drag goes on as before.
        return {
          move: (point) => moveTo({ x: point.x - grab.x, y: point.y - grab.y }),
          preview: (preview) => setTime(preview?.label ?? null),
          end: (_dropped, landing) => {
            // Into the slot it was dropped in, or back to where it started.
            const slot = landing?.validity === "invalid" ? undefined : landing?.rects[0];
            moveTo(slot ?? element.getBoundingClientRect());
            setLanded(true);
          },
        };
      }),
    [springX, springY, within, x, y],
  );

  if (held === null) return null;
  return createPortal(
    <motion.div
      aria-hidden
      data-color={held.color}
      className="pointer-events-none fixed top-0 left-0 z-50 flex flex-col overflow-hidden rounded-md border-s-3 border-calendar-event-border bg-calendar-event px-2 py-1 text-xs leading-tight font-medium text-calendar-event-foreground"
      style={{ height: held.height, rotate, width: held.width, x: springX, y: springY }}
      animate={
        landed
          ? { boxShadow: "0 0 0 rgb(0 0 0 / 0)", opacity: 0, scale: 1 }
          : { boxShadow: "0 16px 32px rgb(0 0 0 / 0.25)", opacity: 1, scale: 1.05 }
      }
      transition={spring}
      // Gone once it has landed, unless another drag picked it up again.
      onAnimationComplete={() => {
        if (landed) setHeld((current) => (current === held ? null : current));
      }}
    >
      <span className="line-clamp-2">{held.title}</span>
      {time !== null && <span className="truncate font-normal opacity-80">{time}</span>}
    </motion.div>,
    document.body,
  );
}
// #endregion drag

// #region root
type MeetingChange = CalendarEventChange<Meeting, string, never>;

function moveMeeting(meetings: readonly Meeting[], change: MeetingChange): readonly Meeting[] {
  if (change.cause === "create" || change.cause === "delete") return meetings;
  if (change.proposed.kind !== "timed") return meetings;
  const { end, start } = change.proposed;
  return meetings.map((meeting) =>
    meeting.id === change.eventId ? { ...meeting, end, start } : meeting,
  );
}

export function MotionCalendar() {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [opened, setOpened] = useState<Opened | null>(null);
  const viewport = useRef<HTMLDivElement>(null);

  // Views render each meeting as a `[data-event-id]` button, so one listener opens any of them.
  const openClicked = (click: MouseEvent) => {
    const anchor =
      click.target instanceof Element ? click.target.closest<HTMLElement>("[data-event-id]") : null;
    const meeting = meetings.find(({ id }) => anchor !== null && id === eventIdOf(anchor));
    if (anchor === null || meeting === undefined) return;
    grow(anchor, () => setOpened({ anchor, meeting }));
  };

  return (
    <Calendar.Root
      events={meetings}
      onEventChange={(change) => setMeetings((current) => moveMeeting(current, change))}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame className="flex h-full flex-col">
        <CalendarToolbar calendar={Calendar} />
        <Calendar.Viewport
          // The calendar's preview stays as the slot the card lands in: faint, without a shadow.
          className="min-h-0 flex-1 [&_[data-calendar-ghost=event]]:[--calendar-ghost-opacity:0.35] [&_[data-calendar-ghost=event]]:[--calendar-ghost-shadow:none]"
          onClick={openClicked}
          ref={viewport}
        >
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
      <MeetingCard opened={opened} onClose={() => setOpened(null)} />
      <DragCard within={viewport} />
      <Calendar.Announcer messages={calendarAnnouncements} />
    </Calendar.Root>
  );
}
// #endregion root

const whenFormat = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
  weekday: "long",
});

function formatWhen({ end, start }: Meeting): string {
  return whenFormat.formatRange(start, end);
}

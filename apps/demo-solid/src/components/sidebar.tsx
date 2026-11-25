import type { JSX } from "@solidjs/web";

import { MiniMonth } from "@registry/calendar/mini-month";
import { Button } from "@registry/calendar-ui/button";

import type { DemoCalendarId } from "@demo/calendars";

import { Calendar } from "../calendar";
import { PlusIcon } from "../icons";
import { CalendarList } from "./calendar-list";

export function Sidebar(props: {
  /** Extra sections below the calendar list. */
  readonly children?: JSX.Element;
  readonly hiddenCalendars: ReadonlySet<DemoCalendarId>;
  readonly onCreate: () => void;
  /** Called after a date is picked, so the phone's sheet can close. */
  readonly onNavigate?: () => void;
  readonly onToggleCalendar: (calendarId: DemoCalendarId) => void;
  readonly today: Temporal.PlainDate;
}) {
  const anchorDate = Calendar.useCalendarSelector((state) => state.anchorDate);
  const visibleRange = Calendar.useVisibleRange();
  const actions = Calendar.useCalendarActions();
  const meta = Calendar.useCalendarMeta();
  return (
    <div class="flex flex-col gap-6 px-3 pt-2 pb-6">
      <Button
        class="h-12 w-fit rounded-2xl pr-6 pl-4 text-sm shadow-md"
        onClick={() => props.onCreate()}
        variant="outline"
      >
        <PlusIcon class="size-5" />
        Create
      </Button>
      <MiniMonth
        locale={meta().environment.locale}
        onSelectDate={(date) => {
          actions.setAnchorDate(date);
          props.onNavigate?.();
        }}
        selectedDate={anchorDate()}
        today={props.today}
        visibleRange={visibleRange() ?? undefined}
        weekStartsOn={meta().environment.weekRules.firstDay}
      />
      <CalendarList hidden={props.hiddenCalendars} onToggle={props.onToggleCalendar} />
      {props.children}
    </div>
  );
}

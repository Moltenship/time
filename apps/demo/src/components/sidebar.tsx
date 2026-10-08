import { PlusIcon } from "lucide-react";

import { MiniMonth } from "@registry/calendar/mini-month";
import { Button } from "@registry/ui/button";

import { DemoCalendar } from "../calendar";
import type { DemoCalendarId } from "../calendars";
import { CalendarList } from "./calendar-list";

const selectAnchorDate = (state: { readonly anchorDate: Temporal.PlainDate }) => state.anchorDate;

export interface SidebarProps {
  readonly hiddenCalendars: ReadonlySet<DemoCalendarId>;
  /** Called after a date is picked, so the mobile sheet can close. */
  readonly onNavigate?: () => void;
  readonly onToggleCalendar: (calendarId: DemoCalendarId) => void;
  readonly today: Temporal.PlainDate;
}

export function Sidebar({ hiddenCalendars, onNavigate, onToggleCalendar, today }: SidebarProps) {
  const anchorDate = DemoCalendar.useCalendarSelector(selectAnchorDate);
  const visibleRange = DemoCalendar.useVisibleRange();
  const { setAnchorDate } = DemoCalendar.useCalendarActions();
  const { environment } = DemoCalendar.useCalendarMeta();

  return (
    <div className="flex flex-col gap-6 px-3 pt-2 pb-6">
      <Button
        className="h-12 w-fit rounded-2xl pr-6 pl-4 text-sm shadow-md"
        disabled
        title="Event editing arrives with the interaction layer"
        variant="outline"
      >
        <PlusIcon className="size-5" />
        Create
      </Button>
      <MiniMonth
        locale={environment.locale}
        onSelectDate={(date) => {
          setAnchorDate(date);
          onNavigate?.();
        }}
        selectedDate={anchorDate}
        today={today}
        visibleRange={visibleRange ?? undefined}
        weekStartsOn={environment.weekRules.firstDay}
      />
      <CalendarList hidden={hiddenCalendars} onToggle={onToggleCalendar} />
    </div>
  );
}

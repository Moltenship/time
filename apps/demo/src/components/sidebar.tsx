import { PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { MiniMonth } from "@registry/calendar/mini-month";
import { Button } from "@registry/ui/button";

import { DemoCalendar } from "../calendar";
import type { DemoCalendarId } from "../calendars";
import { CalendarList } from "./calendar-list";

const selectAnchorDate = (state: { readonly anchorDate: Temporal.PlainDate }) => state.anchorDate;

export interface SidebarProps {
  /** Extra sections below the calendar list. */
  readonly children?: ReactNode;
  readonly hiddenCalendars: ReadonlySet<DemoCalendarId>;
  readonly onCreate: () => void;
  /** Called after a date is picked, so the mobile sheet can close. */
  readonly onNavigate?: () => void;
  readonly onToggleCalendar: (calendarId: DemoCalendarId) => void;
  readonly today: Temporal.PlainDate;
}

export function Sidebar({
  children,
  hiddenCalendars,
  onCreate,
  onNavigate,
  onToggleCalendar,
  today,
}: SidebarProps) {
  const anchorDate = DemoCalendar.useCalendarSelector(selectAnchorDate);
  const visibleRange = DemoCalendar.useVisibleRange();
  const { setAnchorDate } = DemoCalendar.useCalendarActions();
  const { environment } = DemoCalendar.useCalendarMeta();

  return (
    <div className="flex flex-col gap-6 px-3 pt-2 pb-6">
      <Button
        className="h-12 w-fit rounded-2xl pr-6 pl-4 text-sm shadow-md"
        onClick={onCreate}
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
      {children}
    </div>
  );
}

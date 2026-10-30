import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { VStack } from "@astryxdesign/core/Stack";
import { PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { MiniMonth } from "@registry/stylex-calendar/mini-month";

import type { DemoCalendarId } from "../../calendars";
import { StylexDemoCalendar } from "../calendar";
import { CalendarList } from "./calendar-list";

const selectAnchorDate = (state: { readonly anchorDate: Temporal.PlainDate }) => state.anchorDate;

export interface SidebarProps {
  /** Extra sections below the calendar list. */
  readonly children?: ReactNode;
  readonly hiddenCalendars: ReadonlySet<DemoCalendarId>;
  readonly onCreate: () => void;
  /** Called after a date is picked, so the mobile drawer can close. */
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
  const anchorDate = StylexDemoCalendar.useCalendarSelector(selectAnchorDate);
  const visibleRange = StylexDemoCalendar.useVisibleRange();
  const { setAnchorDate } = StylexDemoCalendar.useCalendarActions();
  const { environment } = StylexDemoCalendar.useCalendarMeta();

  return (
    <VStack gap={6} paddingBlockEnd={6} paddingBlockStart={2} paddingInline={3}>
      <div>
        <Button
          elevation="low"
          icon={<Icon icon={PlusIcon} />}
          label="Create"
          onClick={onCreate}
          size="lg"
        />
      </div>
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
    </VStack>
  );
}

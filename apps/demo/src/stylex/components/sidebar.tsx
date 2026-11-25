import * as stylex from "@stylexjs/stylex";
import { PlusIcon } from "lucide-react";
import type { ReactNode } from "react";

import { MiniMonth } from "@registry/stylex-calendar/mini-month";
import { Button } from "@registry/stylex-calendar-ui/button";

import type { DemoCalendarId } from "../../calendars";
import { StylexDemoCalendar } from "../calendar";
import { CalendarList } from "./calendar-list";

const styles = stylex.create({
  create: {
    borderRadius: "calc(var(--radius) * 1.8)",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    fontSize: "0.875rem",
    height: "3rem",
    lineHeight: "calc(1.25 / 0.875)",
    paddingInlineEnd: "1.5rem",
    paddingInlineStart: "1rem",
    width: "fit-content",
  },
  createIcon: {
    height: "1.25rem",
    width: "1.25rem",
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
    paddingBottom: "1.5rem",
    paddingInline: "0.75rem",
    paddingTop: "0.5rem",
  },
});

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
  const anchorDate = StylexDemoCalendar.useCalendarSelector(selectAnchorDate);
  const visibleRange = StylexDemoCalendar.useVisibleRange();
  const { setAnchorDate } = StylexDemoCalendar.useCalendarActions();
  const { environment } = StylexDemoCalendar.useCalendarMeta();

  return (
    <div {...stylex.props(styles.sidebar)}>
      <Button onClick={onCreate} variant="outline" xstyle={styles.create}>
        <PlusIcon aria-hidden {...stylex.props(styles.createIcon)} />
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

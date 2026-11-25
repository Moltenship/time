import type { CalendarFactory, CalendarTriggerProps } from "@moltenship/calendar";
import { CalendarCheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { cn } from "cn";
import { Button } from "@registry/calendar-ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@registry/calendar-ui/tooltip";
import {
  calendarActionsClass,
  calendarStepClass,
  calendarStepIconClass,
  calendarStepsClass,
  calendarTitleClass,
  calendarTodayClass,
  calendarTodayIconClass,
  calendarTodayTextClass,
  calendarToolbarClass,
} from "@registry/shared/calendar/calendar-toolbar.styles";
import { calendarToolbarLabels } from "@registry/shared/calendar/navigation-labels";

/** The headless parts the toolbar styles. Every `createCalendar` factory provides them. */
export type CalendarToolbarParts = Pick<
  CalendarFactory<unknown, unknown>,
  "NextTrigger" | "PreviousTrigger" | "Title" | "TodayTrigger" | "Toolbar"
>;

export interface CalendarToolbarProps {
  readonly calendar: CalendarToolbarParts;
  /** Trailing actions, such as the view switcher. */
  readonly children?: ReactNode;
  readonly className?: string;
  /** Leading content, such as a sidebar toggle or product mark. */
  readonly start?: ReactNode;
}

function StepTrigger({
  children,
  label,
  Trigger,
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly Trigger: ComponentType<CalendarTriggerProps>;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className={calendarStepClass}
            render={<Trigger aria-label={label} />}
            size="icon"
            variant="ghost"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function CalendarToolbar({ calendar, children, className, start }: CalendarToolbarProps) {
  const { NextTrigger, PreviousTrigger, Title, TodayTrigger, Toolbar } = calendar;

  return (
    <Toolbar className={cn(calendarToolbarClass, className)}>
      {start}
      <Button
        className={calendarTodayClass}
        render={<TodayTrigger aria-label={calendarToolbarLabels.today} />}
        variant="outline"
      >
        <span className={calendarTodayIconClass}>
          <CalendarCheckIcon />
        </span>
        <span className={calendarTodayTextClass}>{calendarToolbarLabels.today}</span>
      </Button>
      <div className={calendarStepsClass}>
        <StepTrigger label={calendarToolbarLabels.previous} Trigger={PreviousTrigger}>
          <ChevronLeftIcon className={calendarStepIconClass} />
        </StepTrigger>
        <StepTrigger label={calendarToolbarLabels.next} Trigger={NextTrigger}>
          <ChevronRightIcon className={calendarStepIconClass} />
        </StepTrigger>
      </div>
      <Title className={calendarTitleClass} />
      <div className={calendarActionsClass}>{children}</div>
    </Toolbar>
  );
}

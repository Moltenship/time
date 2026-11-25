import type { CalendarFactory, CalendarTriggerProps } from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { untrack, type Component } from "solid-js";

import { Button } from "@registry/calendar-ui/button";
import { CalendarCheckIcon, ChevronLeftIcon, ChevronRightIcon } from "@registry/calendar-ui/icons";
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
import { cn } from "cn";

/** The headless parts the toolbar styles. Every `createCalendar` factory provides them. */
export type CalendarToolbarParts = Pick<
  CalendarFactory<unknown, unknown>,
  "NextTrigger" | "PreviousTrigger" | "Title" | "TodayTrigger" | "Toolbar"
>;

export interface CalendarToolbarProps {
  /** The factory's parts, read once. */
  readonly calendar: CalendarToolbarParts;
  /** Trailing actions, such as the view switcher. */
  readonly children?: JSX.Element;
  readonly class?: string;
  /** Leading content, such as a sidebar toggle or product mark. */
  readonly start?: JSX.Element;
}

function StepTrigger(props: {
  readonly children: JSX.Element;
  readonly label: string;
  readonly Trigger: Component<CalendarTriggerProps>;
}) {
  const Trigger = untrack(() => props.Trigger);
  return (
    <Tooltip>
      <TooltipTrigger
        render={(trigger) => (
          <Button
            {...trigger}
            class={calendarStepClass}
            render={(button) => <Trigger {...button} aria-label={props.label} />}
            size="icon"
            variant="ghost"
          />
        )}
      >
        {props.children}
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  );
}

export function CalendarToolbar(props: CalendarToolbarProps) {
  const { NextTrigger, PreviousTrigger, Title, TodayTrigger, Toolbar } = untrack(
    () => props.calendar,
  );

  return (
    <Toolbar class={cn(calendarToolbarClass, props.class)}>
      {props.start}
      <Button
        class={calendarTodayClass}
        render={(button) => <TodayTrigger {...button} aria-label={calendarToolbarLabels.today} />}
        variant="outline"
      >
        <span class={calendarTodayIconClass}>
          <CalendarCheckIcon aria-hidden="true" />
        </span>
        <span class={calendarTodayTextClass}>{calendarToolbarLabels.today}</span>
      </Button>
      <div class={calendarStepsClass}>
        <StepTrigger label={calendarToolbarLabels.previous} Trigger={PreviousTrigger}>
          <ChevronLeftIcon aria-hidden="true" class={calendarStepIconClass} />
        </StepTrigger>
        <StepTrigger label={calendarToolbarLabels.next} Trigger={NextTrigger}>
          <ChevronRightIcon aria-hidden="true" class={calendarStepIconClass} />
        </StepTrigger>
      </div>
      <Title class={calendarTitleClass} />
      <div class={calendarActionsClass}>{props.children}</div>
    </Toolbar>
  );
}

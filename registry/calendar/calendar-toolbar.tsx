import type { CalendarFactory, CalendarTriggerProps } from "@moltenship/calendar";
import { CalendarCheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { cn } from "cn";
import { buttonVariants } from "@registry/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@registry/ui/tooltip";

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
          <Trigger
            aria-label={label}
            className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "rounded-full")}
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
    <Toolbar
      className={cn("flex h-14 shrink-0 items-center gap-0.5 px-2 sm:gap-2 sm:px-4", className)}
    >
      {start}
      <TodayTrigger
        aria-label="Today"
        // `cn` resolves the variant's border colour against the base one, as the Button component does.
        className={cn(
          buttonVariants({ variant: "outline" }),
          "rounded-full max-sm:w-8 max-sm:px-0 sm:px-4",
        )}
      >
        <span className="sm:hidden">
          <CalendarCheckIcon />
        </span>
        <span className="max-sm:hidden">Today</span>
      </TodayTrigger>
      <div className="flex items-center">
        <StepTrigger label="Previous period" Trigger={PreviousTrigger}>
          <ChevronLeftIcon />
        </StepTrigger>
        <StepTrigger label="Next period" Trigger={NextTrigger}>
          <ChevronRightIcon />
        </StepTrigger>
      </div>
      <Title className="min-w-0 truncate text-base sm:text-xl" />
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">{children}</div>
    </Toolbar>
  );
}

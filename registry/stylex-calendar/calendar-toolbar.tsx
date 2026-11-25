import type { CalendarFactory, CalendarTriggerProps } from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { CalendarCheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";
import { calendarToolbarLabels } from "@registry/shared/calendar/navigation-labels";
import { Button } from "@registry/stylex-calendar-ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@registry/stylex-calendar-ui/tooltip";

const styles = stylex.create({
  actions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: { default: "0.25rem", "@media (min-width: 640px)": "0.5rem" },
    marginInlineStart: "auto",
  },
  round: {
    borderRadius: "9999px",
  },
  steps: {
    alignItems: "center",
    display: "flex",
  },
  icon: {
    flexShrink: 0,
    height: "1rem",
    pointerEvents: "none",
    width: "1rem",
  },
  iconFlipped: {
    rotate: { default: null, ":dir(rtl)": "180deg" },
  },
  title: {
    WebkitBoxOrient: { default: null, "@media (max-width: 1023.98px)": "vertical" },
    WebkitLineClamp: { default: null, "@media (max-width: 1023.98px)": 2 },
    display: { default: null, "@media (max-width: 1023.98px)": "-webkit-box" },
    fontSize: { default: "1rem", "@media (min-width: 640px)": "1.25rem" },
    lineHeight: { default: 1.25, "@media (min-width: 1024px)": "1.75rem" },
    minWidth: 0,
    overflow: "hidden",
    textOverflow: { default: null, "@media (min-width: 1024px)": "ellipsis" },
    textWrap: { default: null, "@media (max-width: 1023.98px)": "balance" },
    whiteSpace: { default: null, "@media (min-width: 1024px)": "nowrap" },
  },
  today: {
    paddingInline: { default: "1rem", "@media (max-width: 639.98px)": 0 },
    width: { default: null, "@media (max-width: 639.98px)": "2rem" },
  },
  todayIcon: {
    display: { default: null, "@media (min-width: 640px)": "none" },
  },
  todayLabel: {
    display: { default: null, "@media (max-width: 639.98px)": "none" },
  },
  toolbar: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: { default: "0.125rem", "@media (min-width: 640px)": "0.5rem" },
    height: "3.5rem",
    paddingInline: { default: "0.5rem", "@media (min-width: 640px)": "1rem" },
  },
});

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
  /** Styles the app adds, after the toolbar's own. */
  readonly xstyle?: XStyle;
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
            render={<Trigger aria-label={label} />}
            size="icon"
            variant="ghost"
            xstyle={styles.round}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function CalendarToolbar({
  calendar,
  children,
  className,
  start,
  xstyle,
}: CalendarToolbarProps) {
  const { NextTrigger, PreviousTrigger, Title, TodayTrigger, Toolbar } = calendar;

  return (
    <Toolbar {...xprops({ className }, styles.toolbar, xstyle)}>
      {start}
      <Button
        render={<TodayTrigger aria-label={calendarToolbarLabels.today} />}
        variant="outline"
        xstyle={[styles.round, styles.today]}
      >
        <span {...stylex.props(styles.todayIcon)}>
          <CalendarCheckIcon {...stylex.props(styles.icon)} />
        </span>
        <span {...stylex.props(styles.todayLabel)}>{calendarToolbarLabels.today}</span>
      </Button>
      <div {...stylex.props(styles.steps)}>
        <StepTrigger label={calendarToolbarLabels.previous} Trigger={PreviousTrigger}>
          <ChevronLeftIcon {...stylex.props(styles.icon, styles.iconFlipped)} />
        </StepTrigger>
        <StepTrigger label={calendarToolbarLabels.next} Trigger={NextTrigger}>
          <ChevronRightIcon {...stylex.props(styles.icon, styles.iconFlipped)} />
        </StepTrigger>
      </div>
      {/*
        On a phone or a small tablet, upright or turned, a long title such as a week across two
        years wraps onto a second line.
      */}
      <Title {...stylex.props(styles.title)} />
      <div {...stylex.props(styles.actions)}>{children}</div>
    </Toolbar>
  );
}

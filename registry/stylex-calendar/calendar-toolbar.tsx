import { Tooltip } from "@astryxdesign/core/Tooltip";
import type { CalendarFactory, CalendarTriggerProps } from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { CalendarCheckIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

const styles = stylex.create({
  actions: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: { default: "0.25rem", "@media (min-width: 640px)": "0.5rem" },
    marginInlineStart: "auto",
  },
  // The headless triggers render their own `<button>`, so they take the look of the theme's button.
  button: {
    alignItems: "center",
    appearance: "none",
    backgroundClip: "padding-box",
    borderRadius: "9999px",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: {
      default: null,
      ":focus-visible": `0 0 0 3px color-mix(in oklch, ${calendarVars["--ring"]} 50%, transparent)`,
    },
    color: { default: "inherit", ":hover": calendarVars["--foreground"] },
    cursor: "pointer",
    display: "inline-flex",
    flexShrink: 0,
    fontFamily: "inherit",
    fontSize: "0.875rem",
    fontWeight: 500,
    height: "2rem",
    justifyContent: "center",
    lineHeight: "1.25rem",
    opacity: { default: null, ":disabled": 0.5 },
    outlineStyle: "none",
    pointerEvents: { default: null, ":disabled": "none" },
    transitionDuration: "150ms",
    transitionProperty: "all",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    translate: { default: null, ":active:not([aria-haspopup])": "0 1px" },
    userSelect: "none",
    whiteSpace: "nowrap",
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
  step: {
    backgroundColor: {
      default: "transparent",
      ":hover": `light-dark(${calendarVars["--muted"]}, color-mix(in oklch, ${calendarVars["--muted"]} 50%, transparent))`,
    },
    borderColor: { default: "transparent", ":focus-visible": calendarVars["--ring"] },
    paddingBlock: 0,
    paddingInline: 0,
    width: "2rem",
  },
  steps: {
    alignItems: "center",
    display: "flex",
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
    backgroundColor: {
      default: `light-dark(${calendarVars["--background"]}, color-mix(in oklch, ${calendarVars["--input"]} 30%, transparent))`,
      ":hover": `light-dark(${calendarVars["--muted"]}, color-mix(in oklch, ${calendarVars["--input"]} 50%, transparent))`,
    },
    borderColor: {
      default: `light-dark(${calendarVars["--border"]}, ${calendarVars["--input"]})`,
      ":focus-visible": calendarVars["--ring"],
    },
    gap: "0.375rem",
    paddingBlock: 0,
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
    <Tooltip content={label}>
      <Trigger aria-label={label} {...stylex.props(styles.button, styles.step)}>
        {children}
      </Trigger>
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
      <TodayTrigger aria-label="Today" {...stylex.props(styles.button, styles.today)}>
        <span {...stylex.props(styles.todayIcon)}>
          <CalendarCheckIcon {...stylex.props(styles.icon)} />
        </span>
        <span {...stylex.props(styles.todayLabel)}>Today</span>
      </TodayTrigger>
      <div {...stylex.props(styles.steps)}>
        <StepTrigger label="Previous period" Trigger={PreviousTrigger}>
          <ChevronLeftIcon {...stylex.props(styles.icon, styles.iconFlipped)} />
        </StepTrigger>
        <StepTrigger label="Next period" Trigger={NextTrigger}>
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

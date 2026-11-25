"use client";

import * as stylex from "@stylexjs/stylex";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import type { XStyle } from "@registry/stylex-calendar-theme/xprops";
import { viewSwitcherLabel } from "@registry/shared/calendar/navigation-labels";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@registry/stylex-calendar-ui/select";

const styles = stylex.create({
  shortcut: {
    color: calendarVars["--muted-foreground"],
    fontFamily: "inherit",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginInlineStart: "auto",
  },
  trigger: {
    borderRadius: "9999px",
    width: { default: null, "@media (min-width: 640px)": "6.5rem" },
  },
});

export interface ViewSwitcherOption<TView extends string> {
  readonly label: string;
  /** Keyboard shortcut shown next to the label in the list. */
  readonly shortcut?: string;
  readonly value: TView;
}

export interface ViewSwitcherProps<TView extends string> {
  readonly className?: string;
  readonly onValueChange: (view: TView) => void;
  readonly options: readonly ViewSwitcherOption<TView>[];
  readonly value: TView;
  /** Styles the app adds, after the control's own. */
  readonly xstyle?: XStyle;
}

export function ViewSwitcher<TView extends string>({
  className,
  onValueChange,
  options,
  value,
  xstyle,
}: ViewSwitcherProps<TView>) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option !== undefined) onValueChange(option.value);
      }}
    >
      <SelectTrigger
        aria-label={viewSwitcherLabel}
        className={className}
        xstyle={[styles.trigger, xstyle]}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} label={option.label} value={option.value}>
              {option.label}
              {/* The trigger and typing read `label`, so the shortcut only appears in the list. */}
              {option.shortcut !== undefined && (
                <kbd {...stylex.props(styles.shortcut)}>{option.shortcut}</kbd>
              )}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

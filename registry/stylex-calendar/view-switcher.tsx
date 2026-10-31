"use client";

import { Selector } from "@astryxdesign/core/Selector";
import * as stylex from "@stylexjs/stylex";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import type { XStyle } from "@registry/stylex-calendar-theme/xprops";

const styles = stylex.create({
  control: {
    borderRadius: "9999px",
  },
  field: {
    width: { default: null, "@media (min-width: 640px)": "7.5rem" },
  },
  option: {
    display: "flex",
    flexGrow: 1,
    gap: "0.5rem",
    whiteSpace: "nowrap",
  },
  shortcut: {
    color: calendarVars["--muted-foreground"],
    fontFamily: "inherit",
    fontSize: "0.75rem",
    lineHeight: "1rem",
    marginInlineStart: "auto",
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
    <Selector
      containerXstyle={styles.field}
      controlClassName={className}
      // Astryx types `xstyle` narrower than what `stylex.props` takes.
      controlXstyle={[styles.control, xstyle] as stylex.StyleXStyles}
      isLabelHidden
      label="View"
      options={options.map(({ label, value: optionValue }) => ({ label, value: optionValue }))}
      placement="below"
      value={value}
      onChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option !== undefined) onValueChange(option.value);
      }}
      renderOption={({ label, value: optionValue }) => {
        const shortcut = options.find((candidate) => candidate.value === optionValue)?.shortcut;
        return (
          <span {...stylex.props(styles.option)}>
            {label}
            {/* The trigger shows the option's label, so the shortcut only appears in the list. */}
            {shortcut !== undefined && <kbd {...stylex.props(styles.shortcut)}>{shortcut}</kbd>}
          </span>
        );
      }}
    />
  );
}

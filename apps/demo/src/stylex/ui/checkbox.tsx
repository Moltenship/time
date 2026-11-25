import * as stylex from "@stylexjs/stylex";
import { Checkbox as CheckboxPart, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import { CheckIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

const focusRing = "0 0 0 3px color-mix(in oklch, var(--ring) 50%, transparent)";
const unchecked = "light-dark(transparent, color-mix(in oklch, var(--input) 30%, transparent))";

/** shadcn's checkbox, the main demo's, in StyleX. */
const styles = stylex.create({
  checkbox: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: { default: unchecked, "[data-checked]": "var(--primary)" },
    borderColor: {
      default: "var(--input)",
      ":focus-visible": "var(--ring)",
      "[data-checked]": "var(--primary)",
    },
    borderRadius: 4,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: { default: null, ":focus-visible": focusRing },
    color: { default: null, "[data-checked]": "var(--primary-foreground)" },
    // shadcn's checkbox is a span: it takes its row's cursor and alignment, not a button's.
    cursor: { default: "inherit", "[data-disabled]": "not-allowed" },
    display: "flex",
    flexShrink: 0,
    height: "1rem",
    justifyContent: "center",
    opacity: { default: null, "[data-disabled]": 0.5 },
    outlineStyle: "none",
    padding: 0,
    position: "relative",
    textAlign: "inherit",
    transitionDuration: "150ms",
    transitionProperty:
      "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    width: "1rem",
  },
  // A larger hit area, as shadcn's `after:-inset-x-3 after:-inset-y-2`.
  hitArea: {
    "::after": {
      content: '""',
      insetBlock: "-0.5rem",
      insetInline: "-0.75rem",
      position: "absolute",
    },
  },
  indicator: {
    color: "currentcolor",
    display: "grid",
    placeContent: "center",
  },
  icon: {
    height: "0.875rem",
    width: "0.875rem",
  },
  // A calendar's or an activity's colour, from the event tokens `eventColorStyles` sets.
  colored: {
    backgroundColor: { default: unchecked, "[data-checked]": "var(--calendar-event-border)" },
    borderColor: "var(--calendar-event-border)",
    borderWidth: 2,
    color: { default: null, "[data-checked]": "var(--background)" },
  },
});

export interface CheckboxProps extends Omit<
  ComponentProps<typeof CheckboxPart>,
  "children" | "className" | "style"
> {
  /** In a calendar's colour, set with `eventColorStyles` in `xstyle`. */
  readonly colored?: boolean;
  readonly xstyle?: XStyle;
}

export function Checkbox({ colored = false, xstyle, ...props }: CheckboxProps) {
  return (
    <CheckboxPart
      {...props}
      {...xprops({}, styles.checkbox, styles.hitArea, colored && styles.colored, xstyle)}
    >
      <CheckboxIndicator {...xprops({}, styles.indicator)}>
        <CheckIcon aria-hidden {...xprops({}, styles.icon)} />
      </CheckboxIndicator>
    </CheckboxPart>
  );
}

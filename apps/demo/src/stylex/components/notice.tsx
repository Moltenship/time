import * as stylex from "@stylexjs/stylex";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";

const rise = stylex.keyframes({ from: { opacity: 0, translate: "0 0.5rem" } });

const styles = stylex.create({
  message: {
    animationDuration: { default: "150ms", "@media (prefers-reduced-motion: reduce)": "0s" },
    animationName: rise,
    backgroundColor: calendarVars["--foreground"],
    borderRadius: "var(--radius)",
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    color: calendarVars["--background"],
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    paddingBlock: "0.625rem",
    paddingInline: "1rem",
  },
  region: {
    bottom: { default: "10rem", "@media (min-width: 1024px)": "5rem" },
    display: "flex",
    insetInline: 0,
    justifyContent: "center",
    paddingInline: "1rem",
    pointerEvents: "none",
    position: "fixed",
    zIndex: 50,
  },
});

/**
 * A polite live region, mounted up front so screen readers announce each message. It sits above
 * the undo toast, so both can show. Astryx's Toast adds its live region with each toast, which
 * screen readers can miss, and sits in a corner of its own.
 */
export function Notice({ text }: { readonly text: string | null }) {
  return (
    <div aria-live="polite" role="status" {...stylex.props(styles.region)}>
      {text !== null && <p {...stylex.props(styles.message)}>{text}</p>}
    </div>
  );
}

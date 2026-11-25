import * as stylex from "@stylexjs/stylex";

const motionSafe = "@media (prefers-reduced-motion: no-preference)";
const small = "@media (min-width: 640px)";

export const dialogStyles = stylex.create({
  /** The dimmed page behind a dialog, which fades in and out with it. */
  backdrop: {
    WebkitBackdropFilter: "blur(4px)",
    backdropFilter: "blur(4px)",
    backgroundColor: "rgb(0 0 0 / 0.1)",
    inset: 0,
    opacity: { default: null, "[data-ending-style]": 0, "[data-starting-style]": 0 },
    position: "fixed",
    transitionDuration: "100ms",
    transitionProperty: "opacity",
    transitionTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
    zIndex: 50,
  },
  /**
   * The dialog, centred in the browser's top layer, where it needs no `z-index`. It clears the
   * browser's own popover border and padding, and fades and grows in, without the growth when
   * motion is reduced.
   */
  content: {
    backgroundColor: "var(--popover)",
    borderRadius: "calc(var(--radius) * 1.4)",
    borderWidth: 0,
    boxShadow: "0 0 0 1px color-mix(in oklch, var(--foreground) 10%, transparent)",
    boxSizing: "border-box",
    color: "var(--popover-foreground)",
    display: "grid",
    fontSize: "0.875rem",
    gap: "1rem",
    height: "fit-content",
    inset: 0,
    lineHeight: "calc(1.25 / 0.875)",
    margin: "auto",
    maxHeight: "calc(100dvh - 2rem)",
    maxWidth: { default: "calc(100% - 2rem)", [small]: "24rem" },
    opacity: { default: null, "[data-ending-style]": 0, "[data-starting-style]": 0 },
    outlineStyle: "none",
    overflowY: "auto",
    padding: "1rem",
    position: "fixed",
    scale: {
      default: null,
      [motionSafe]: { default: null, "[data-ending-style]": 0.95, "[data-starting-style]": 0.95 },
    },
    transitionDuration: "100ms",
    transitionProperty: "opacity, scale",
    transitionTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
    width: "100%",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  /** The dialog's buttons, in a band along its bottom. */
  footer: {
    backgroundColor: "color-mix(in oklch, var(--muted) 50%, transparent)",
    borderBottomLeftRadius: "calc(var(--radius) * 1.4)",
    borderBottomRightRadius: "calc(var(--radius) * 1.4)",
    borderTopColor: "var(--border)",
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "flex",
    flexDirection: { default: "column-reverse", [small]: "row" },
    gap: "0.5rem",
    justifyContent: { default: null, [small]: "flex-end" },
    marginBottom: "-1rem",
    marginInline: "-1rem",
    padding: "1rem",
  },
  title: {
    fontFamily: "inherit",
    fontSize: "1rem",
    fontWeight: 500,
    lineHeight: 1,
    marginBlock: 0,
    marginInline: 0,
  },
  description: {
    color: "var(--muted-foreground)",
    fontSize: "0.875rem",
    lineHeight: "calc(1.25 / 0.875)",
    marginBlock: 0,
    marginInline: 0,
  },
});

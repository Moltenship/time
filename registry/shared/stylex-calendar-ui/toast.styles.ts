import * as stylex from "@stylexjs/stylex";

const motionSafe = "@media (prefers-reduced-motion: no-preference)";
const onToast = "color-mix(in oklch, var(--background) 15%, transparent)";
const focusOnToast = "0 0 0 2px color-mix(in oklch, var(--background) 60%, transparent)";

export const toastStyles = stylex.create({
  /**
   * The region, at the bottom centre of the screen. It shows in the browser's top layer and clears
   * the browser's own popover border, padding and background. ui-sdk centres it with `left: 50%`
   * and a `-50%` translate; the margins centre it here, so the translate goes. The theme's global
   * CSS takes the indent off the list ui-sdk renders in it.
   */
  region: {
    backgroundColor: "transparent",
    borderRadius: "calc(var(--radius) * 1.4)",
    borderWidth: 0,
    bottom: "1.5rem",
    boxShadow: { default: null, ":focus-visible": "0 0 0 2px var(--ring)" },
    height: "fit-content",
    insetInline: 0,
    marginBlock: 0,
    marginInline: "auto",
    maxWidth: "calc(100vw - 2rem)",
    outlineStyle: "none",
    overflow: "visible",
    padding: 0,
    position: "fixed",
    top: "auto",
    translate: "none",
    width: "fit-content",
  },
  /** A toast, in the page's foreground colour. It fades in and out, and rises unless motion is reduced. */
  toast: {
    alignItems: "center",
    backgroundColor: "var(--foreground)",
    borderRadius: "var(--radius)",
    boxShadow: {
      default: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      ":focus-visible":
        "0 0 0 2px var(--ring), 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    },
    color: "var(--background)",
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.25rem",
    lineHeight: "calc(1.25 / 0.875)",
    opacity: { default: null, "[data-ending-style]": 0, "[data-starting-style]": 0 },
    outlineStyle: "none",
    paddingBlock: "0.375rem",
    paddingInlineEnd: "0.375rem",
    paddingInlineStart: "1rem",
    transitionDuration: "200ms",
    transitionProperty: "opacity, translate",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    translate: {
      default: null,
      [motionSafe]: {
        default: null,
        "[data-ending-style]": "0 0.5rem",
        "[data-starting-style]": "0 0.5rem",
      },
    },
  },
  title: {
    marginInlineEnd: "0.5rem",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  description: {
    color: "color-mix(in oklch, var(--background) 80%, transparent)",
  },
  action: {
    appearance: "none",
    backgroundColor: { default: "transparent", ":hover": onToast },
    borderRadius: "calc(var(--radius) * 0.8)",
    borderWidth: 0,
    boxShadow: { default: null, ":focus-visible": focusOnToast },
    color: "inherit",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: 600,
    height: "2rem",
    lineHeight: "inherit",
    marginBlock: 0,
    marginInline: 0,
    outlineStyle: "none",
    paddingBlock: 0,
    paddingInline: "0.75rem",
  },
  close: {
    appearance: "none",
    backgroundColor: { default: "transparent", ":hover": onToast },
    borderRadius: "calc(var(--radius) * 0.8)",
    borderWidth: 0,
    boxShadow: { default: null, ":focus-visible": focusOnToast },
    color: {
      default: "color-mix(in oklch, var(--background) 70%, transparent)",
      ":hover": "var(--background)",
    },
    cursor: "pointer",
    display: "grid",
    height: "2rem",
    marginBlock: 0,
    marginInline: 0,
    outlineStyle: "none",
    padding: 0,
    placeItems: "center",
    width: "2rem",
  },
});

import * as stylex from "@stylexjs/stylex";

/** How long the pointer rests on a trigger before its tooltip opens, and the gap to the trigger. */
export const tooltipDefaults = { delay: 400, sideOffset: 4 } as const;

const motionSafe = "@media (prefers-reduced-motion: no-preference)";
const arrowOffset = "calc(var(--arrow-offset) - 0.3125rem)";

export const tooltipStyles = stylex.create({
  /**
   * The bubble. It fades and grows out of its trigger, without the growth when motion is reduced,
   * and opens at once when it follows another tooltip (`data-instant`).
   */
  content: {
    alignItems: "center",
    backgroundColor: "var(--foreground)",
    borderRadius: "calc(var(--radius) * 0.8)",
    borderWidth: 0,
    boxSizing: "border-box",
    color: "var(--background)",
    display: "inline-flex",
    fontSize: "0.75rem",
    gap: "0.375rem",
    lineHeight: "calc(1 / 0.75)",
    marginBlock: 0,
    marginInline: 0,
    maxWidth: "20rem",
    opacity: { default: null, "[data-ending-style]": 0, "[data-starting-style]": 0 },
    overflow: "visible",
    paddingBlock: "0.375rem",
    paddingInline: "0.75rem",
    scale: {
      default: null,
      [motionSafe]: { default: null, "[data-ending-style]": 0.95, "[data-starting-style]": 0.95 },
    },
    transformOrigin: "var(--transform-origin)",
    transitionDuration: "150ms",
    transitionProperty: { default: "opacity, scale, translate", "[data-instant]": "none" },
    transitionTimingFunction: "cubic-bezier(0, 0, 0.2, 1)",
    translate: {
      default: null,
      [motionSafe]: {
        default: null,
        "[data-side=bottom][data-starting-style]": "0 -0.5rem",
        "[data-side=left][data-starting-style]": "0.5rem 0",
        "[data-side=right][data-starting-style]": "-0.5rem 0",
        "[data-side=top][data-starting-style]": "0 0.5rem",
      },
    },
    width: "fit-content",
  },
  /** The arrow, a turned square half under the bubble on the side facing the trigger. */
  arrow: {
    backgroundColor: "var(--foreground)",
    borderRadius: 2,
    bottom: { default: null, "[data-side=top]": "-0.25rem" },
    height: "0.625rem",
    left: {
      default: null,
      "[data-side=bottom]": arrowOffset,
      "[data-side=right]": "-0.25rem",
      "[data-side=top]": arrowOffset,
    },
    position: "absolute",
    right: { default: null, "[data-side=left]": "-0.25rem" },
    rotate: "45deg",
    top: {
      default: null,
      "[data-side=bottom]": "-0.25rem",
      "[data-side=left]": arrowOffset,
      "[data-side=right]": arrowOffset,
    },
    width: "0.625rem",
  },
});

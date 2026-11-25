import * as stylex from "@stylexjs/stylex";

/** The gap between a popover and its trigger. */
export const popoverDefaults = { sideOffset: 4 } as const;

const motionSafe = "@media (prefers-reduced-motion: no-preference)";

export const popoverStyles = stylex.create({
  /**
   * The panel. It shows in the browser's top layer, so it needs no `z-index`, and it clears the
   * browser's own popover border, padding and background. It fades and grows out of its trigger,
   * without the growth when motion is reduced, and is never taller than the room beside its trigger.
   */
  content: {
    backgroundColor: "var(--popover)",
    borderRadius: "var(--radius)",
    borderWidth: 0,
    boxShadow:
      "0 0 0 1px color-mix(in oklch, var(--foreground) 10%, transparent), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    boxSizing: "border-box",
    color: "var(--popover-foreground)",
    display: "flex",
    flexDirection: "column",
    fontSize: "0.875rem",
    gap: "0.625rem",
    lineHeight: "calc(1.25 / 0.875)",
    marginBlock: 0,
    marginInline: 0,
    maxHeight: "var(--available-height)",
    opacity: { default: null, "[data-ending-style]": 0, "[data-starting-style]": 0 },
    // Tailwind's `outline-hidden`: none, but a transparent outline that forced colours draw.
    outlineColor: { default: null, "@media (forced-colors: active)": "transparent" },
    outlineOffset: { default: null, "@media (forced-colors: active)": 2 },
    outlineStyle: { default: "none", "@media (forced-colors: active)": "solid" },
    outlineWidth: { default: null, "@media (forced-colors: active)": 2 },
    padding: "0.625rem",
    scale: {
      default: null,
      [motionSafe]: { default: null, "[data-ending-style]": 0.95, "[data-starting-style]": 0.95 },
    },
    transformOrigin: "var(--transform-origin)",
    transitionDuration: "100ms",
    transitionProperty: "opacity, scale, translate",
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
    width: "18rem",
  },
  title: {
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "calc(1.25 / 0.875)",
    marginBlock: 0,
    marginInline: 0,
  },
});

import * as stylex from "@stylexjs/stylex";

const motionSafe = "@media (prefers-reduced-motion: no-preference)";

export const selectStyles = stylex.create({
  /** The button that opens the list. */
  trigger: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: "light-dark(transparent, color-mix(in oklch, var(--input) 30%, transparent))",
      ":hover": "light-dark(transparent, color-mix(in oklch, var(--input) 50%, transparent))",
    },
    borderColor: { default: "var(--input)", ":focus-visible": "var(--ring)" },
    borderRadius: "var(--radius)",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: {
      default: null,
      ":focus-visible": "0 0 0 3px color-mix(in oklch, var(--ring) 50%, transparent)",
    },
    boxSizing: "border-box",
    color: { default: "inherit", "[data-placeholder]": "var(--muted-foreground)" },
    cursor: { default: "pointer", ":disabled": "not-allowed", "[data-disabled]": "not-allowed" },
    display: "flex",
    fontFamily: "inherit",
    fontSize: "0.875rem",
    gap: "0.375rem",
    justifyContent: "space-between",
    lineHeight: "calc(1.25 / 0.875)",
    marginBlock: 0,
    marginInline: 0,
    opacity: { default: null, ":disabled": 0.5, "[data-disabled]": 0.5 },
    outlineStyle: "none",
    paddingBlock: "0.5rem",
    paddingInlineEnd: "0.5rem",
    paddingInlineStart: "0.625rem",
    transitionDuration: "150ms",
    transitionProperty: "color, background-color, border-color",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    userSelect: "none",
    whiteSpace: "nowrap",
    width: "fit-content",
  },
  triggerDefault: { height: "2rem" },
  triggerSm: { borderRadius: "min(calc(var(--radius) * 0.8), 10px)", height: "1.75rem" },
  /** The chosen option's label, on one line. */
  value: {
    alignItems: "center",
    display: "flex",
    flexGrow: 1,
    gap: "0.375rem",
    overflow: "hidden",
    textAlign: "start",
  },
  /** The chevron after the value. */
  icon: {
    color: "var(--muted-foreground)",
    flexShrink: 0,
    height: "1rem",
    pointerEvents: "none",
    width: "1rem",
  },
  /**
   * The list. It shows in the browser's top layer, so it needs no `z-index`, and it clears the
   * browser's own popover border, padding and background. It fades and grows in, without the
   * growth when motion is reduced or when it opens over the trigger.
   */
  content: {
    backgroundColor: "var(--popover)",
    borderRadius: "var(--radius)",
    borderWidth: 0,
    boxShadow:
      "0 0 0 1px color-mix(in oklch, var(--foreground) 10%, transparent), 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    boxSizing: "border-box",
    color: "var(--popover-foreground)",
    marginBlock: 0,
    marginInline: 0,
    maxHeight: "var(--available-height)",
    minWidth: "9rem",
    opacity: { default: null, "[data-ending-style]": 0, "[data-starting-style]": 0 },
    overflowX: "hidden",
    overflowY: "auto",
    padding: 0,
    scale: {
      default: null,
      [motionSafe]: {
        default: null,
        ":not([data-align-trigger=true])[data-ending-style]": 0.95,
        ":not([data-align-trigger=true])[data-starting-style]": 0.95,
      },
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
        "[data-side=top][data-starting-style]": "0 0.5rem",
      },
    },
    width: "var(--anchor-width)",
  },
  group: {
    padding: "0.25rem",
    scrollMarginBlock: "0.25rem",
  },
  groupLabel: {
    color: "var(--muted-foreground)",
    fontSize: "0.75rem",
    lineHeight: "calc(1 / 0.75)",
    paddingBlock: "0.25rem",
    paddingInline: "0.375rem",
  },
  /** An option. `data-highlighted` marks the one the keyboard or the pointer is on. */
  item: {
    alignItems: "center",
    backgroundColor: { default: null, "[data-highlighted]": "var(--accent)" },
    borderRadius: "calc(var(--radius) * 0.8)",
    boxSizing: "border-box",
    color: { default: null, "[data-highlighted]": "var(--accent-foreground)" },
    cursor: "default",
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.375rem",
    lineHeight: "calc(1.25 / 0.875)",
    opacity: { default: null, "[data-disabled]": 0.5 },
    // Tailwind's `outline-hidden`: none, but a transparent outline that forced colours draw.
    outlineColor: { default: null, "@media (forced-colors: active)": "transparent" },
    outlineOffset: { default: null, "@media (forced-colors: active)": 2 },
    outlineStyle: { default: "none", "@media (forced-colors: active)": "solid" },
    outlineWidth: { default: null, "@media (forced-colors: active)": 2 },
    paddingBlock: "0.25rem",
    paddingInlineEnd: "2rem",
    paddingInlineStart: "0.375rem",
    pointerEvents: { default: null, "[data-disabled]": "none" },
    position: "relative",
    userSelect: "none",
    width: "100%",
  },
  itemText: {
    display: "flex",
    flexGrow: 1,
    flexShrink: 0,
    gap: "0.5rem",
    whiteSpace: "nowrap",
  },
  itemIndicator: {
    alignItems: "center",
    display: "flex",
    height: "1rem",
    insetInlineEnd: "0.5rem",
    justifyContent: "center",
    pointerEvents: "none",
    position: "absolute",
    width: "1rem",
  },
  itemIndicatorIcon: {
    flexShrink: 0,
    height: "1rem",
    pointerEvents: "none",
    width: "1rem",
  },
  separator: {
    backgroundColor: "var(--border)",
    height: 1,
    marginBlock: "0.25rem",
    marginInline: "-0.25rem",
    pointerEvents: "none",
  },
});

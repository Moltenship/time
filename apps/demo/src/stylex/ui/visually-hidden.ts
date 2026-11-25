import * as stylex from "@stylexjs/stylex";

/** Tailwind's `sr-only`: read by screen readers, not shown. */
export const visuallyHidden = stylex.create({
  text: {
    borderWidth: 0,
    clip: "rect(0, 0, 0, 0)",
    height: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
});

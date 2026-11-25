import * as stylex from "@stylexjs/stylex";

/**
 * Hides text from sight and keeps it for screen readers and agents, as Tailwind's `sr-only`
 * does: a one-pixel box that clips what's in it.
 */
export const visuallyHiddenStyles = stylex.create({
  hidden: {
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

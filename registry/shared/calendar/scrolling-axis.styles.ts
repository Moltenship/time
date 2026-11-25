import { cn } from "cn";

/** The scrolling axis's snap points, one place for every framework's markup. */

export const scrollSnapPointsClass = "pointer-events-none absolute inset-0";

/**
 * A snap point. Each spans the other axis, so it stays in view however far that axis scrolls:
 * browsers skip snap points out of view, which let a fling pass days in a day view scrolled down
 * to the evening.
 */
export function scrollSnapPointClass(axis: "block" | "inline"): string {
  return cn(
    "absolute snap-start snap-always",
    axis === "inline" ? "inset-y-0 w-px" : "inset-x-0 h-px",
  );
}

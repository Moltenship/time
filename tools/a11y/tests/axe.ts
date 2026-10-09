import axe from "axe-core";

export type Theme = "light" | "dark";
export const themes: readonly Theme[] = ["light", "dark"];

/** Switches the page the way the demo does: a `.dark` class on the root element. */
export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

/**
 * Violations the keyboard and ARIA work in #97 fixes. Remove each rule once that work merges:
 * https://github.com/Moltenship/time/issues/97
 */
const knownViolations: ReadonlySet<string> = new Set([
  // The time grid's day headers are `columnheader`s outside any row.
  "aria-required-parent",
  // The month's "+N more" popover has no name.
  "aria-dialog-name",
  // A month's first date shows "Oct 1" but is named "Thursday, October 1, 2026".
  "label-content-name-mismatch",
]);

/** Elements a rule flags by design, with the reason. */
const exemptions: Readonly<Record<string, (element: Element) => boolean>> = {
  // Base UI's focus guards are hidden, tabbable spans that pass focus straight on.
  "aria-hidden-focus": (element) => element.matches("[data-base-ui-focus-guard]"),
  // WCAG 2.5.8 exempts targets whose size is essential: in the month and time grids an event's
  // box is its time span, and "+N more" fills the event lane it summarises.
  "target-size": (element) =>
    element.closest('[data-slot="month-view"], [data-slot="time-grid"]') !== null,
};

/** Serious and critical WCAG 2.2 A/AA and best-practice violations, one line per element. */
export async function seriousViolations(context: axe.ElementContext = document) {
  // Popups fade in; a half-transparent frame would fail contrast.
  await Promise.allSettled(document.getAnimations().map(({ finished }) => finished));
  const { violations } = await axe.run(context, {
    elementRef: true,
    resultTypes: ["violations"],
    runOnly: {
      type: "tag",
      values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
    },
  });
  return violations
    .filter(
      ({ id, impact }) =>
        (impact === "serious" || impact === "critical") && !knownViolations.has(id),
    )
    .flatMap(({ help, id, nodes }) =>
      nodes
        .filter(({ element }) => element === undefined || exemptions[id]?.(element) !== true)
        .map(
          ({ failureSummary, target }) =>
            `${id}: ${help} at ${target.join(" ")}\n${failureSummary}`,
        ),
    );
}

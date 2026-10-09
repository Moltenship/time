import axe from "axe-core";

export type Theme = "light" | "dark";
export const themes: readonly Theme[] = ["light", "dark"];

/** Switches the page the way the demo does: a `.dark` class on the root element. */
export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

/** The popup a month's "+N more" trigger opens. */
function isMonthOverflowPopup(element: Element | null): boolean {
  return (
    element !== null &&
    document.querySelector(
      `[aria-controls="${CSS.escape(element.id)}"][aria-label*=" more events on "]`,
    ) !== null
  );
}

type ElementFilter = Readonly<Record<string, (element: Element) => boolean>>;

/**
 * Elements the keyboard and ARIA work in #97 fixes. Remove each entry once that work merges:
 * https://github.com/Moltenship/time/issues/97
 */
const knownViolations: ElementFilter = {
  // The month's "+N more" popover has no name.
  "aria-dialog-name": isMonthOverflowPopup,
  // Event names lead with the title and add the date ("Standup, Thursday, October 8, 9:30 –
  // 10:00 AM"), so a chip's visible "9:30 AM Standup" isn't part of them; and a month's first date
  // shows "Oct 1" but is named "Thursday, October 1, 2026".
  "label-content-name-mismatch": (element) =>
    element.matches('[data-slot="calendar-event"]') ||
    element.closest('[data-slot="month-view"] [role="gridcell"]') !== null ||
    isMonthOverflowPopup(element.closest('[role="dialog"]')),
};

/** Elements a rule flags by design, with the reason. */
const exemptions: ElementFilter = {
  // Base UI's focus guards are hidden, tabbable spans that pass focus straight on.
  "aria-hidden-focus": (element) => element.matches("[data-base-ui-focus-guard]"),
  // WCAG 2.5.8 exempts targets whose size is essential: in the month and time grids an event's
  // box is its time span, and "+N more" fills the event lane it summarises.
  "target-size": (element) =>
    element.closest('[data-slot="month-view"], [data-slot="time-grid"]') !== null,
};

const excused = (rule: string, element: Element | undefined) =>
  element !== undefined &&
  (knownViolations[rule]?.(element) === true || exemptions[rule]?.(element) === true);

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
    .filter(({ impact }) => impact === "serious" || impact === "critical")
    .flatMap(({ help, id, nodes }) =>
      nodes
        .filter(({ element }) => !excused(id, element))
        .map(
          ({ failureSummary, target }) =>
            `${id}: ${help} at ${target.join(" ")}\n${failureSummary}`,
        ),
    );
}

import axe from "axe-core";

export type Theme = "light" | "dark";
export const themes: readonly Theme[] = ["light", "dark"];

/** Switches the page the way the demo does: a `.dark` class on the root element. */
export function setTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

type ElementFilter = Readonly<Record<string, (element: Element) => boolean>>;

/** Elements a rule flags by design, with the reason. */
const exemptions: ElementFilter = {
  // Base UI's focus guards are hidden, tabbable spans that pass focus straight on.
  "aria-hidden-focus": (element) => element.matches("[data-base-ui-focus-guard]"),
  // In WebKit on macOS, Base UI makes them unnamed buttons instead, so VoiceOver's cursor, which
  // only focuses buttons there, can't leave a popup past them.
  "aria-command-name": (element) => element.matches("[data-base-ui-focus-guard]"),
  // Event names carry the title, the full date and time, the calendar and the saving state
  // (#97), while each view's chip shows a shorter subset in its own order ("9:30 AM Standup").
  // Names lead with the title, so speech input still matches it. A day cell's visible text
  // includes its events, but it is named by date and event count: its events are focused apart.
  "label-content-name-mismatch": (element) =>
    element.matches('[data-slot="calendar-event"]') ||
    element.matches(
      '[data-slot="month-view"] [role="gridcell"], [data-slot="time-grid"] [role="gridcell"], [data-slot="resource-timeline"] [role="gridcell"], [data-slot="scrolling-month"] [role="gridcell"], [data-slot="scrolling-time-grid"] [role="gridcell"]',
    ),
  // WCAG 2.5.8 exempts targets whose size is essential: in the month and time grids an event's
  // box is its time span, and "+N more" fills the event lane it summarises.
  "target-size": (element) =>
    element.closest(
      '[data-slot="month-view"], [data-slot="time-grid"], [data-slot="scrolling-month"], [data-slot="scrolling-time-grid"]',
    ) !== null,
};

const excused = (rule: string, element: Element | undefined) =>
  element !== undefined && exemptions[rule]?.(element) === true;

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

import { describe, expect, test } from "vite-plus/test";

import { RegistryScreen } from "./registry-screen";
import { render } from "./render";

function box(selector: string, within: ParentNode = document): DOMRect {
  const element = within.querySelector(selector);
  if (element === null) throw new Error(`missing ${selector}`);
  return element.getBoundingClientRect();
}

/**
 * A distance to the nearest pixel. Firefox lays out in fractions of a pixel, so a distance a hair
 * under zero rounds to -0, which `toBe(0)` tells apart from 0.
 */
const px = (value: number) => Math.round(value) + 0;

describe.each(["ltr", "rtl"] as const)("%s layout", (dir) => {
  /** Inline distance from the end of `first` to the start of `second`, in reading order. */
  const gap = (first: DOMRect, second: DOMRect) =>
    px(dir === "ltr" ? second.left - first.right : first.left - second.right);
  /** How far `inner` sits from the inline-start and inline-end edges of `outer`. */
  const insets = ({ left, right }: DOMRect, outer: DOMRect) =>
    dir === "ltr"
      ? { end: px(outer.right - right), start: px(left - outer.left) }
      : { end: px(left - outer.left), start: px(outer.right - right) };

  test("month view: days, bars and their continuations follow the reading order", async () => {
    await render(<RegistryScreen dir={dir} view="month" />);
    const cell = (date: string) =>
      document
        .querySelector(`[data-slot="month-view"] [data-date="${date}"]`)!
        .closest('[role="gridcell"]')!
        .getBoundingClientRect();

    expect(gap(cell("2026-10-12"), cell("2026-10-13"))).toBe(0);
    // The offsite continues from last week: its bar meets the week's inline start, squared off.
    const continuation = document.querySelectorAll('[data-event-id="Offsite"]')[1]!;
    expect(insets(continuation.getBoundingClientRect(), cell("2026-10-12")).start).toBe(0);
    expect(getComputedStyle(continuation.querySelector("svg")!).rotate).toBe(
      dir === "rtl" ? "180deg" : "none",
    );
  });

  test("time grid: hour gutter, day columns and event blocks follow the reading order", async () => {
    await render(<RegistryScreen dir={dir} view="week" />);
    const column = (date: string) => box(`[data-slot="time-grid-body"] [data-date="${date}"]`);
    const hourLabel = [...document.querySelectorAll('[data-slot="time-grid-body"] span')].find(
      (label) => label.textContent === "9 AM",
    )!;

    expect(gap(hourLabel.getBoundingClientRect(), column("2026-10-05"))).toBe(8);
    expect(gap(column("2026-10-05"), column("2026-10-06"))).toBe(0);
    // Past the column's 1px divider and the 18px annotation rail at the inline start, with a
    // strip left free at the inline end for creating.
    expect(insets(box('[data-event-id="blue meeting"]'), column("2026-10-08"))).toEqual({
      end: 8,
      start: 19,
    });
    const rail = box('[data-date="2026-10-08"] [data-slot="annotation-rail"]');
    expect(insets(rail, column("2026-10-08")).start).toBe(1);
    const event = getComputedStyle(document.querySelector('[data-event-id="blue meeting"]')!);
    expect(dir === "rtl" ? event.borderRightWidth : event.borderLeftWidth).toBe("3px");
  });

  test.each(["week", "day"] as const)(
    "%s view: annotation data never moves or narrows an event",
    async (view) => {
      const body = () => document.querySelector('[data-slot="time-grid-body"]')!;
      const events = () =>
        [...body().querySelectorAll("[data-event-id]")].map((event) => {
          const { height, left, top, width } = event.getBoundingClientRect();
          return [event.getAttribute("data-event-id"), left, top, width, height];
        });
      await render(<RegistryScreen dir={dir} view={view} />);
      const annotated = { events: events(), scrollHeight: body().scrollHeight };
      // Including the dot at 23:59, which draws up from midnight rather than past it.
      expect(document.querySelector('[data-annotation-id="late"]')).not.toBeNull();
      await render(<RegistryScreen annotations={[]} dir={dir} view={view} />);

      expect(document.querySelectorAll('[data-slot="annotation-mark"]')).toHaveLength(0);
      expect({ events: events(), scrollHeight: body().scrollHeight }).toEqual(annotated);
      expect(annotated.events.length).toBeGreaterThan(0);
    },
  );

  test("resource columns: gutter, columns and their headers follow the reading order", async () => {
    await render(<RegistryScreen dir={dir} view="resources" />);
    const column = (id: string) =>
      box(`[data-slot="resource-columns-body"] [data-resource-id="${id}"]`);
    const header = (title: string) =>
      [...document.querySelectorAll('[role="columnheader"]')]
        .find((cell) => cell.querySelector(`[title="${title}"]`) !== null)!
        .getBoundingClientRect();

    expect(gap(box('[data-slot="resource-columns"] [role="rowheader"]'), column("team"))).toBe(0);
    expect(gap(column("team"), column("ada"))).toBe(0);
    expect(gap(column("ada"), column("grace"))).toBe(0);
    expect(px(header("Ada").left)).toBe(px(column("ada").left));
    expect(px(header("Ada").right)).toBe(px(column("ada").right));
    // Mirrored in RTL, the open group's chevron turns the other way to point down.
    const toggle = getComputedStyle(document.querySelector('[aria-label="Collapse Team"] svg')!);
    expect([toggle.rotate, toggle.scale]).toEqual(
      dir === "rtl" ? ["-90deg", "-1 1"] : ["90deg", "none"],
    );
  });

  test("agenda: each day's date precedes its events", async () => {
    await render(<RegistryScreen dir={dir} view="agenda" />);
    const day = document.querySelector('[data-slot="agenda-view"] [data-date="2026-10-08"]')!;

    expect(
      gap(box('button[aria-current="date"]', day), box("[data-event-id]", day)),
    ).toBeGreaterThan(0);
  });

  test("toolbar: the previous-period arrow points to the inline start", async () => {
    await render(<RegistryScreen dir={dir} view="week" />);
    const arrow = document.querySelector('[aria-label="Previous period"] svg')!;

    expect(getComputedStyle(arrow).rotate).toBe(dir === "rtl" ? "180deg" : "none");
  });
});

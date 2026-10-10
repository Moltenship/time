import { act, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { seriousViolations, setTheme, themes } from "./axe";
import { press, render } from "./render";
import { axis, reported, screen, ScrollingScreen as Screen, title } from "./scrolling-screen";

afterEach(() => {
  reported.anchors = [];
  reported.changes = [];
  reported.ranges = [];
});

const settled = { interval: 50, timeout: 3000 };

describe.each(["ltr", "rtl"] as const)("scrolling week, %s", (dir) => {
  test("a scroll that stops between days comes to rest on the nearest and moves the range", async () => {
    await render(<Screen dir={dir} view="scrolling-week" />);
    const { position, scrollBy } = axis("scrolling-week");
    const start = position();
    expect(title()).toBe("Oct 7 – 13, 2026");

    await scrollBy(2.4, dir);

    await vi.waitFor(() => expect(title()).toBe("Oct 9 – 15, 2026"), settled);
    expect(reported.anchors.at(-1)?.toString()).toBe("2026-10-09");
    await vi.waitFor(() => expect(Math.abs(position() - start - 2)).toBeLessThan(0.1), settled);
  });

  test("a long swipe keeps the days around the view rendered as it passes them", async () => {
    await render(<Screen dir={dir} view="scrolling-week" />);
    const { scrollBy, viewport } = axis("scrolling-week");

    for (let step = 0; step < 5; step += 1) await scrollBy(4, dir);

    await vi.waitFor(() => expect(title()).toBe("Oct 27 – Nov 2, 2026"), settled);
    const columns = [...viewport.querySelectorAll('[role="gridcell"][data-date]')];
    expect(columns.map((column) => column.getAttribute("data-date"))).toContain("2026-11-02");
    // Only the visible days reach assistive technology.
    expect(columns.filter((column) => !column.hasAttribute("aria-hidden"))).toHaveLength(7);
    expect(reported.ranges.at(-1)?.loadRange.start.toString()).toBe("2026-10-20");
  });
});

test("flipping the direction keeps the week in view", async () => {
  let flip: () => void = () => {};
  function Flippable() {
    const [dir, setDir] = useState<"ltr" | "rtl">("ltr");
    flip = () => setDir((current) => (current === "ltr" ? "rtl" : "ltr"));
    return <Screen dir={dir} view="scrolling-week" />;
  }
  await render(<Flippable />);
  const { position } = axis("scrolling-week");
  const start = position();

  for (let turn = 0; turn < 2; turn += 1) {
    await act(async () => flip());
    // Give a reset scroll position time to report itself and settle.
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(title()).toBe("Oct 7 – 13, 2026");
    expect(Math.abs(position() - start)).toBeLessThan(0.1);
  }
  expect(reported.anchors).toEqual([]);
});

describe("scrolling views", () => {
  test("Next and Today scroll to their range", async () => {
    await render(<Screen view="scrolling-week" />);
    const { position } = axis("scrolling-week");
    const start = position();

    await act(async () =>
      document.querySelector<HTMLElement>('[aria-label="Next period"]')!.click(),
    );
    expect(title()).toBe("Oct 14 – 20, 2026");
    await vi.waitFor(() => expect(Math.abs(position() - start - 7)).toBeLessThan(0.1), settled);

    await act(async () => document.querySelector<HTMLElement>('[aria-label="Today"]')!.click());
    expect(title()).toBe("Oct 8 – 14, 2026");
    await vi.waitFor(() => expect(Math.abs(position() - start - 1)).toBeLessThan(0.1), settled);
  });

  test("Next undone before its scroll moves leaves the view where it was", async () => {
    await render(<Screen view="scrolling-week" />);
    const { position } = axis("scrolling-week");
    const start = position();

    await act(async () => {
      document.querySelector<HTMLElement>('[aria-label="Next period"]')!.click();
    });
    await act(async () => screen.actions!.setAnchorDate(Temporal.PlainDate.from("2026-10-07")));
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(title()).toBe("Oct 7 – 13, 2026");
    expect(Math.abs(position() - start)).toBeLessThan(0.1);
    expect(reported.anchors.map(String)).toEqual(["2026-10-14", "2026-10-07"]);
  });

  test("a viewport a pixel narrower keeps the leading day at the start", async () => {
    await render(<Screen view="scrolling-week" />);
    const { scrollBy, viewport } = axis("scrolling-week");
    await scrollBy(4);
    await vi.waitFor(() => expect(title()).toBe("Oct 11 – 17, 2026"), settled);
    const leading = () =>
      viewport.querySelector('[role="gridcell"][data-date="2026-10-11"]')!.getBoundingClientRect()
        .left;
    const before = leading();

    // Each day narrows by a seventh of a pixel, a thousand days from the canvas start.
    await act(async () => {
      viewport.style.width = `${viewport.getBoundingClientRect().width - 1}px`;
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(Math.abs(leading() - before)).toBeLessThan(1);
    expect(title()).toBe("Oct 11 – 17, 2026");
  });

  test("switching between the scrolling week and day keeps the day in view", async () => {
    await render(<Screen view="scrolling-week" />);
    const start = axis("scrolling-week").position();

    await act(async () => screen.actions!.setView("scrolling-day"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(title()).toBe("October 7, 2026");
    expect(Math.abs(axis("scrolling-day").position() - start)).toBeLessThan(0.1);

    await act(async () => screen.actions!.setView("scrolling-week"));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(title()).toBe("Oct 7 – 13, 2026");
    expect(Math.abs(axis("scrolling-week").position() - start)).toBeLessThan(0.1);
    expect(reported.anchors).toEqual([]);
  });

  test("Today brings back the anchor an app kept while the view was scrolled ahead", async () => {
    // Today is October 8, and the app keeps it as the anchor through any scroll.
    await render(
      <Screen heldAnchor={Temporal.PlainDate.from("2026-10-08")} view="scrolling-week" />,
    );
    const { position, scrollBy } = axis("scrolling-week");
    const start = position();

    await scrollBy(1);
    await vi.waitFor(() => expect(reported.anchors.map(String)).toEqual(["2026-10-09"]), settled);
    expect(title()).toBe("Oct 8 – 14, 2026");
    await vi.waitFor(() => expect(Math.abs(position() - start - 1)).toBeLessThan(0.1), settled);

    await act(async () => document.querySelector<HTMLElement>('[aria-label="Today"]')!.click());

    await vi.waitFor(() => expect(Math.abs(position() - start)).toBeLessThan(0.1), settled);
    // The app hears Today too, so it can drop the date it was offered.
    expect(reported.anchors.map(String)).toEqual(["2026-10-09", "2026-10-08"]);
  });

  test("keys move through the visible days and scroll a page past them", async () => {
    await render(<Screen view="scrolling-week" />);
    const { position } = axis("scrolling-week");
    const start = position();
    await act(async () =>
      document
        .querySelector<HTMLElement>('[data-slot="scrolling-time-grid"] [tabindex="0"]')!
        .focus(),
    );

    await press("End");
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Tuesday, October 13/);
    await press("ArrowRight");

    expect(title()).toBe("Oct 14 – 20, 2026");
    expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Wednesday, October 14/);
    // From the keyboard, the view jumps rather than animating past the focus.
    expect(Math.abs(position() - start - 7)).toBeLessThan(0.1);
  });

  test("dragging an event against the edge carries it past the days rendered at first", async () => {
    await render(<Screen view="scrolling-week" />);
    const { viewport } = axis("scrolling-week");
    viewport.scrollTop = 400;
    const event = viewport.querySelector<HTMLElement>('[data-event-id="planning"]')!;
    const box = event.getBoundingClientRect();
    // Deep in the auto-scroll band, clear of the scrollbar.
    const edge = viewport.getBoundingClientRect().right - 20;
    const at = (x: number) => ({
      bubbles: true,
      button: 0,
      clientX: x,
      clientY: box.top + 10,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    });

    await act(async () => {
      event.dispatchEvent(new PointerEvent("pointerdown", at(box.left + 10)));
      event.dispatchEvent(new PointerEvent("pointermove", at(box.left + 30)));
      event.dispatchEvent(new PointerEvent("pointermove", at(edge)));
    });
    // Held at the edge, the drag scrolls on until the days at the edge were never rendered when
    // it began: the week from October 7 rendered October 1 to 20.
    await vi.waitFor(
      () => {
        const last = reported.anchors.at(-1);
        expect(last !== undefined && last.since("2026-10-16").sign >= 0).toBe(true);
      },
      { interval: 50, timeout: 10_000 },
    );
    // The event's own element has scrolled out of the rendered days by now: the pointer is over
    // whatever is at the edge, as a real one would be.
    await act(async () =>
      document
        .elementFromPoint(edge, box.top + 10)!
        .dispatchEvent(new PointerEvent("pointerup", at(edge))),
    );

    const [change] = reported.changes;
    expect(change?.cause).toBe("move");
    const start = change?.proposed?.start;
    expect(start instanceof Temporal.Instant).toBe(true);
    // A timed move, landing past October 20, the last day rendered when the drag began.
    const day = (start as Temporal.Instant).toZonedDateTimeISO("UTC").toPlainDate();
    expect(Temporal.PlainDate.compare(day, Temporal.PlainDate.from("2026-10-20"))).toBe(1);
  });

  test("asking for the anchor mid-drag doesn't stall the drag's scroll", async () => {
    await render(<Screen view="scrolling-week" />);
    const { viewport } = axis("scrolling-week");
    viewport.scrollTop = 400;
    // A create from an empty slot, with focus outside the grid.
    const column = viewport.querySelector<HTMLElement>(
      '[role="gridcell"][data-date="2026-10-09"]',
    )!;
    const box = column.getBoundingClientRect();
    const edge = viewport.getBoundingClientRect().right - 20;
    const at = (x: number) => ({
      bubbles: true,
      button: 0,
      clientX: x,
      clientY: box.top + 500,
      isPrimary: true,
      pointerId: 1,
      pointerType: "mouse",
    });
    (document.activeElement as HTMLElement | null)?.blur();

    await act(async () => {
      column.dispatchEvent(new PointerEvent("pointerdown", at(box.left + 10)));
      column.dispatchEvent(new PointerEvent("pointermove", at(box.left + 30)));
      column.dispatchEvent(new PointerEvent("pointermove", at(edge)));
    });
    await act(async () => screen.actions!.setAnchorDate(Temporal.PlainDate.from("2026-10-07")));

    // The drag keeps scrolling and moving the range past the next half page.
    await vi.waitFor(() => expect(reported.anchors.length).toBeGreaterThan(0), {
      interval: 50,
      timeout: 5000,
    });
    await act(async () =>
      document
        .elementFromPoint(edge, box.top + 500)!
        .dispatchEvent(new PointerEvent("pointerup", at(edge))),
    );
  });

  test("a day view's scroll settles on a whole day", async () => {
    await render(<Screen view="scrolling-day" />);
    const { position, scrollBy } = axis("scrolling-day");
    const start = position();

    await scrollBy(0.7);

    await vi.waitFor(() => expect(title()).toBe("October 8, 2026"), settled);
    await vi.waitFor(() => expect(Math.abs(position() - start - 1)).toBeLessThan(0.02), settled);
  });

  test("the month scrolls by weeks and names the month of its third row", async () => {
    await render(<Screen view="scrolling-month" />);
    const { position, scrollBy } = axis("scrolling-month");
    const start = position();
    expect(title()).toBe("October 2026");

    await scrollBy(4.4);

    await vi.waitFor(() => expect(title()).toBe("November 2026"), settled);
    // The anchor is the start of the third visible week.
    expect(reported.anchors.at(-1)?.toString()).toBe("2026-11-02");
    await vi.waitFor(() => expect(Math.abs(position() - start - 4)).toBeLessThan(0.1), settled);
  });
});

describe.each(themes)("scrolling views, %s theme", (theme) => {
  test.each(["scrolling-week", "scrolling-day", "scrolling-month"] as const)("%s", async (view) => {
    setTheme(theme);
    await render(<Screen view={view} />);

    expect(await seriousViolations()).toEqual([]);
  });
});

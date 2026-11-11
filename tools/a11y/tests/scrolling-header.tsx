import { act } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { atRest, nextFrame, press, render, until } from "./render";
import { axis, reported, ScrollingScreen as Screen, title } from "./scrolling-screen";

/** Each day header's offset from its day's column: none while they line up. */
export function headerDrift() {
  const header = document.querySelector('[data-slot="scrolling-time-grid-header"]')!;
  // The first column header names the gutter.
  const headers = [...header.querySelectorAll('[role="columnheader"]')].slice(1);
  const columns = [
    ...document.querySelectorAll('[data-slot="scrolling-time-grid-days"] [role="gridcell"]'),
  ];
  expect(headers).toHaveLength(columns.length);
  return Math.max(
    ...headers.map((cell, index) =>
      Math.abs(cell.getBoundingClientRect().left - columns[index]!.getBoundingClientRect().left),
    ),
  );
}

/**
 * The header's tests for one way of following the days: Chromium and WebKit here have scroll
 * timelines; Firefox, and Safari before 26, follow scroll events instead. Each way has a test file
 * of its own, so the two run side by side instead of one after the other.
 */
export function describeHeaderFollowing(way: string, fallback: boolean) {
  describe(`the header following ${way}`, () => {
    afterEach(() => {
      reported.anchors = [];
      reported.changes = [];
      reported.ranges = [];
    });
    beforeEach(() => {
      if (fallback) vi.stubGlobal("ScrollTimeline", undefined);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    test("the header's days follow a scroll timeline where the browser has them", async () => {
      await render(<Screen view="scrolling-3-day" />);
      const header = document.querySelector('[data-slot="scrolling-time-grid-header"]')!;
      const animated = (selector: string) =>
        [...header.querySelectorAll(selector)].flatMap((element) =>
          element.getAnimations().map(({ timeline }) => timeline?.constructor.name),
        );
      const timelines = !fallback && typeof ScrollTimeline === "function";

      // The day names and the all-day row, and the title of the trip, whose start can scroll away.
      expect(animated('[role="row"] > .overflow-clip > *')).toEqual(
        timelines ? ["ScrollTimeline", "ScrollTimeline"] : [],
      );
      expect(animated('[data-event-id="trip"] [data-slot="calendar-event-title"]')).toEqual(
        timelines ? ["ScrollTimeline"] : [],
      );
    });

    test("keys moving focus from the header to the next page keep the header on the days", async () => {
      await render(<Screen view="scrolling-3-day" />);
      const { scroller } = axis("scrolling-3-day");
      await atRest(scroller);
      const header = document.querySelector('[data-slot="scrolling-time-grid-header"]')!;
      // The all-day cell of the last day shown.
      const cell = header
        .querySelector('[data-date="2026-10-09"]')!
        .closest<HTMLElement>('[role="gridcell"]')!;
      await act(async () => cell.focus());

      await press("ArrowRight");
      await atRest(scroller);

      expect(title()).toBe("Oct 10 – 12, 2026");
      expect(header.contains(document.activeElement)).toBe(true);
      expect(headerDrift()).toBeLessThan(1);
    });

    describe.each(["ltr", "rtl"] as const)("%s", (dir) => {
      test("an all-day bar's title stays on screen as its start scrolls away", async () => {
        await render(<Screen dir={dir} view="scrolling-3-day" />);
        const { scroller } = axis("scrolling-3-day");
        await atRest(scroller);
        // The trip runs from Monday the 12th to Thursday the 15th.
        const trip = () =>
          document.querySelector<HTMLElement>(
            '[data-slot="scrolling-time-grid-header"] [data-event-id="trip"]',
          )!;
        const label = () =>
          trip().querySelector('[data-slot="calendar-event-title"]')!.getBoundingClientRect();
        /** How far the title is in from the start of the days on screen, along the inline axis. */
        const inFromStart = () => {
          const days = scroller.getBoundingClientRect();
          return dir === "rtl" ? days.right - label().right : label().left - days.left;
        };
        const next = () =>
          act(async () =>
            document.querySelector<HTMLElement>('[aria-label="Next period"]')!.click(),
          );

        // October 10 to 12: the bar starts on the third day, and its title with it.
        await next();
        await atRest(scroller);
        const start = trip().getBoundingClientRect();
        expect(
          Math.abs(
            (dir === "rtl" ? start.right : start.left) -
              (dir === "rtl" ? label().right : label().left),
          ),
        ).toBeLessThan(20);

        // On to October 13: the bar's start scrolls away, and the title stays on screen every frame.
        await next();
        let frames = 0;
        while (title() !== "Oct 13 – 15, 2026" || frames < 30) {
          await nextFrame();
          expect(inFromStart()).toBeGreaterThan(-1);
          frames += 1;
          if (frames > 600) throw new Error("the page never came to rest");
        }
        await atRest(scroller);
        // Half a rem in from the start of the days.
        expect(Math.abs(inFromStart() - 8)).toBeLessThan(1.5);

        // Back past halfway to October 10: the range moves mid-scroll, and the view renders again
        // while the title is pinned. It stays on screen.
        await axis("scrolling-3-day").dragBy(-1.7, dir);
        frames = 0;
        while (title() !== "Oct 10 – 12, 2026" || frames < 30) {
          await nextFrame();
          expect(inFromStart()).toBeGreaterThan(-1);
          frames += 1;
          if (frames > 600) throw new Error("the page never came to rest");
        }
        await atRest(scroller);
      });

      test("a pinned bar dragged into the hours keeps its title at its copy's start", async () => {
        await render(<Screen dir={dir} view="scrolling-3-day" />);
        const { hours, scroller } = axis("scrolling-3-day");
        const next = () =>
          act(async () =>
            document.querySelector<HTMLElement>('[aria-label="Next period"]')!.click(),
          );
        // October 13 to 15: the trip started on the 12th, so its title is pinned.
        await next();
        await atRest(scroller);
        await next();
        await atRest(scroller);
        const bar = document.querySelector<HTMLElement>(
          '[data-slot="scrolling-time-grid-header"] [data-event-id="trip"]',
        )!;
        const from = bar.getBoundingClientRect();
        // The title has moved along its bar, away from the bar's start out of view.
        const pinned = getComputedStyle(bar.querySelector('[data-slot="calendar-event-title"]')!);
        expect(pinned.transform === "none" ? 0 : new DOMMatrix(pinned.transform).m41).not.toBe(0);
        const column = scroller
          .querySelector('[role="gridcell"][data-date="2026-10-14"]')!
          .getBoundingClientRect();
        const at = (x: number, y: number) => ({
          bubbles: true,
          button: 0,
          clientX: x,
          clientY: y,
          isPrimary: true,
          // Not the page's own mouse, whose moves WebKit sends as layout changes under it.
          pointerId: 11,
          pointerType: "mouse",
        });
        const middle = column.left + column.width / 2;
        // Over the hours on screen, well below the header.
        const below = hours!.getBoundingClientRect().bottom - 150;

        await act(async () => {
          bar.dispatchEvent(
            new PointerEvent("pointerdown", at(from.left + from.width / 2, from.top + 5)),
          );
          bar.dispatchEvent(new PointerEvent("pointermove", at(middle, from.top + 30)));
          bar.dispatchEvent(new PointerEvent("pointermove", at(middle, below)));
        });
        try {
          const copied = () => [
            ...document.querySelectorAll<HTMLElement>(
              '[data-calendar-ghost] [data-slot="calendar-event-title"]',
            ),
          ];
          await until(() => expect(copied().length).toBeGreaterThan(0));
          const copies = copied();
          for (const copy of copies) {
            expect(getComputedStyle(copy).transform).toBe("none");
            const box = copy.parentElement!.getBoundingClientRect();
            const text = copy.getBoundingClientRect();
            // At the copy's start, inside its padding, not shifted along it.
            expect(dir === "rtl" ? box.right - text.right : text.left - box.left).toBeLessThan(20);
          }
        } finally {
          await act(async () =>
            window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" })),
          );
        }
      });

      test("the header stays on the days as they scroll a page", async () => {
        await render(<Screen dir={dir} view="scrolling-3-day" />);
        const { position, scroller } = axis("scrolling-3-day");
        // The header's animations start on the frame after the view mounts.
        await atRest(scroller);
        const start = position();
        expect(headerDrift()).toBeLessThan(1);

        // Next scrolls smoothly; the header keeps up every frame of the way. A timeline moves it
        // with the scroll itself; scroll events can arrive a frame late, as on CI's Linux runners,
        // so there it may trail by as far as the days moved since the last frame.
        await act(async () =>
          document.querySelector<HTMLElement>('[aria-label="Next period"]')!.click(),
        );
        const offset = () => Math.abs(scroller.scrollLeft);
        let last = offset();
        let frames = 0;
        while (Math.abs(position() - start - 3) >= 0.05) {
          await nextFrame();
          const moved = Math.abs(offset() - last);
          last = offset();
          expect(headerDrift()).toBeLessThan(fallback ? moved + 1 : 1);
          frames += 1;
          if (frames > 600) throw new Error("the page never came to rest");
        }
        await atRest(scroller);
        expect(title()).toBe("Oct 10 – 12, 2026");
        expect(headerDrift()).toBeLessThan(1);

        // A scroll that stops between pages, before it settles back.
        await axis("scrolling-3-day").dragBy(0.4, dir);
        await nextFrame();
        expect(headerDrift()).toBeLessThan(1);
        await atRest(scroller);
        expect(headerDrift()).toBeLessThan(1);
      });
    });
  });
}

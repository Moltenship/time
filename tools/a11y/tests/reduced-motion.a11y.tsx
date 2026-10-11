import { act } from "react";
import { describe, expect, test, vi } from "vite-plus/test";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@registry/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@registry/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@registry/ui/sheet";

import { click, render } from "./render";
import { axis, ScrollingScreen, title } from "./scrolling-screen";

function position(element: Element) {
  const { opacity, scale, transform, translate } = getComputedStyle(element);
  const matrix = new DOMMatrix(transform).toFloat64Array().join();
  return { opacity, position: `${matrix} ${scale} ${translate}` };
}

/** Whether a popup that just opened moves on its way in, and its opacity as it begins. */
async function entry(selector: string) {
  const element = document.querySelector(selector);
  if (element === null) throw new Error("popup-missing");
  // Rewind the entry animations; transitions start later, from `data-starting-style`.
  const animations = element.getAnimations();
  for (const animation of animations) {
    animation.pause();
    animation.currentTime = 0;
  }
  const first = position(element);
  for (const animation of animations) animation.play();
  await vi.waitFor(() => {
    expect(element.hasAttribute("data-starting-style")).toBe(false);
    expect(element.getAnimations()).toEqual([]);
  });
  return { moves: first.position !== position(element).position, opacity: first.opacity };
}

const fadesInPlace = { moves: false, opacity: "0" };

async function open(trigger: string) {
  await click(
    [...document.querySelectorAll<HTMLElement>("button")].find(
      (button) => button.textContent === trigger,
    ),
  );
}

// Runs in the `reduced-motion` browser instance, whose page prefers reduced motion.
describe("prefers-reduced-motion: reduce", () => {
  test("the browser reports the preference", () => {
    expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
  });

  test("popovers fade in without zooming or sliding", async () => {
    await render(
      <Popover>
        <PopoverTrigger>More</PopoverTrigger>
        <PopoverContent>Details</PopoverContent>
      </Popover>,
    );
    await open("More");

    expect(await entry('[data-slot="popover-content"]')).toEqual(fadesInPlace);
  });

  test("dialogs fade in without zooming", async () => {
    await render(
      <Dialog>
        <DialogTrigger>Edit</DialogTrigger>
        <DialogContent>
          <DialogTitle>Edit event</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    await open("Edit");

    expect(await entry('[data-slot="dialog-content"]')).toEqual(fadesInPlace);
  });

  test("sheets fade in without sliding", async () => {
    await render(
      <Sheet>
        <SheetTrigger>Calendars</SheetTrigger>
        <SheetContent side="left">
          <SheetTitle>Calendars</SheetTitle>
        </SheetContent>
      </Sheet>,
    );
    await open("Calendars");

    expect(await entry('[data-slot="sheet-content"]')).toEqual(fadesInPlace);
  });

  test("drag previews don't glide between slots", async () => {
    await render(<div data-calendar-ghost="event" className="transition-transform" />);

    expect(
      getComputedStyle(document.querySelector("[data-calendar-ghost]")!).transitionProperty,
    ).toBe("none");
  });

  test("view transitions crossfade in place", async () => {
    const transition = document.startViewTransition(() => {});
    await transition.ready;
    const group = getComputedStyle(document.documentElement, "::view-transition-group(root)");

    expect(group.animationName).toBe("none");
    await act(() => transition.finished);
  });

  test("a scrolling view jumps to its next range instead of scrolling there", async () => {
    await render(<ScrollingScreen view="scrolling-week" />);
    const { position } = axis("scrolling-week");
    const start = position();

    await act(async () =>
      document.querySelector<HTMLElement>('[aria-label="Next period"]')!.click(),
    );

    expect(title()).toBe("Oct 12 – 18, 2026");
    expect(Math.abs(position() - start - 7)).toBeLessThan(0.1);
  });
});

import { act, useState } from "react";
import { describe, expect, test } from "vite-plus/test";

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

import {
  Dialog as KitDialog,
  DialogContent as KitDialogContent,
  DialogTitle as KitDialogTitle,
} from "@registry/calendar-ui/dialog";
import {
  Popover as KitPopover,
  PopoverContent as KitPopoverContent,
  PopoverTrigger as KitPopoverTrigger,
} from "@registry/calendar-ui/popover";
import { createToastManager, Toast, ToastTitle, ToastViewport } from "@registry/calendar-ui/toast";

import { click, render, until } from "./render";
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
  await until(() => {
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

  test("the calendar's popovers fade in without zooming or sliding", async () => {
    await render(
      <KitPopover>
        <KitPopoverTrigger>More</KitPopoverTrigger>
        <KitPopoverContent aria-label="Details">Details</KitPopoverContent>
      </KitPopover>,
    );
    await open("More");

    expect(await entry('[data-slot="popover-content"]')).toEqual(fadesInPlace);
  });

  test("the calendar's dialogs fade in without zooming", async () => {
    function Question() {
      const [shown, setShown] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setShown(true)}>
            Edit
          </button>
          <KitDialog open={shown} onOpenChange={setShown}>
            <KitDialogContent>
              <KitDialogTitle>Edit recurring event</KitDialogTitle>
            </KitDialogContent>
          </KitDialog>
        </>
      );
    }
    await render(<Question />);
    await open("Edit");

    expect(await entry('[data-slot="dialog-content"]')).toEqual(fadesInPlace);
  });

  test("the calendar's toasts fade in without rising", async () => {
    const manager = createToastManager();
    await render(
      <>
        <button type="button" onClick={() => manager.add({ title: "Event deleted" })}>
          Delete
        </button>
        <ToastViewport aria-label="Notifications" manager={manager}>
          <Toast>
            <ToastTitle />
          </Toast>
        </ToastViewport>
      </>,
    );
    await open("Delete");
    await until(() => expect(document.querySelector('[data-slot="toast"]')).not.toBeNull());

    expect(await entry('[data-slot="toast"]')).toEqual(fadesInPlace);
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

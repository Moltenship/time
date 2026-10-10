// @vitest-environment jsdom

import { act, useState } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { useScrollingAxis } from "../calendar/scrolling-axis";
import { render } from "./render";

/** One item, such as a day, is 100px long; the track is `count` of them. */
const ITEM = 100;
const PAGE = 7;

let scrolls: { left: number; behavior: ScrollBehavior | undefined }[] = [];
let cleanup: (() => Promise<void>) | undefined;

beforeEach(() => {
  scrolls = [];
  // jsdom lays nothing out: give the track a length and let `scrollTo` move the element.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const count = Number(this.dataset.count ?? 0);
    return DOMRect.fromRect({ height: 10, width: count * ITEM });
  });
  HTMLElement.prototype.scrollTo = function (
    this: HTMLElement,
    options?: ScrollToOptions | number,
  ) {
    const { behavior, left = 0 } = options as ScrollToOptions;
    scrolls.push({ behavior, left });
    // A smooth scroll is still on its way until the test finishes it.
    if (behavior !== "smooth") this.scrollLeft = left;
  } as HTMLElement["scrollTo"];
});

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

let setFirst: (first: number) => void = () => {};
let setRtl: (rtl: boolean) => void = () => {};
let rerender: () => void = () => {};
const onScroll = vi.fn<(first: number) => void>();

/** A view on the axis whose range only moves when the test says so, as a controlled anchor. */
function Axis({ interacting = false }: { readonly interacting?: boolean }) {
  const [first, setState] = useState(5000);
  const [rtl, setRtlState] = useState(false);
  const [, setTick] = useState(0);
  setFirst = setState;
  setRtl = setRtlState;
  rerender = () => setTick((tick) => tick + 1);
  const axis = useScrollingAxis({ axis: "inline", first, onScroll, page: PAGE, rtl });
  return (
    <div data-interaction={interacting ? "move" : undefined}>
      <div ref={axis.scrollRef} data-testid="viewport">
        <div ref={axis.trackRef} data-count={axis.count} data-base={axis.base} />
      </div>
    </div>
  );
}

async function show(element = <Axis />) {
  onScroll.mockClear();
  const screen = await render(element);
  cleanup = screen.unmount;
  const viewport = screen.container.querySelector<HTMLElement>('[data-testid="viewport"]')!;
  const base = () =>
    Number(screen.container.querySelector<HTMLElement>("[data-base]")!.dataset.base);
  /** The user scrolls so `item` leads the view. */
  const userScrollsTo = async (item: number, end = true) => {
    await act(async () => {
      viewport.dispatchEvent(new Event("wheel"));
      viewport.scrollLeft = (item - base()) * ITEM;
      viewport.dispatchEvent(new Event("scroll"));
      if (end) viewport.dispatchEvent(new Event("scrollend"));
    });
  };
  const shownItem = () => base() + Math.abs(viewport.scrollLeft) / ITEM;
  /** The browser's smooth scroll arrives and comes to rest. */
  const finishScroll = async () => {
    await act(async () => {
      viewport.scrollLeft = scrolls.at(-1)!.left;
      viewport.dispatchEvent(new Event("scroll"));
      viewport.dispatchEvent(new Event("scrollend"));
    });
  };
  /** The browser reports a scroll coming to rest where the view is. */
  const rest = async () => {
    await act(async () => {
      viewport.dispatchEvent(new Event("scroll"));
      viewport.dispatchEvent(new Event("scrollend"));
    });
  };
  return { finishScroll, rest, shownItem, userScrollsTo, viewport };
}

test("opens on the range, with room to scroll either way", async () => {
  const { shownItem } = await show();

  expect(shownItem()).toBe(5000);
  expect(scrolls.at(-1)?.behavior).toBe("instant");
});

test("a range that commits late does not pull the view back, even past other renders", async () => {
  const { finishScroll, shownItem, userScrollsTo } = await show();

  await userScrollsTo(5004);
  expect(onScroll).toHaveBeenLastCalledWith(5004);
  // The app hasn't moved its anchor yet, and something else renders the view.
  scrolls = [];
  await act(async () => rerender());
  expect(scrolls).toEqual([]);
  // The user scrolls on, and then the first proposal commits.
  await userScrollsTo(5009);
  await act(async () => setFirst(5004));
  expect(scrolls).toEqual([]);
  expect(shownItem()).toBe(5009);
  await act(async () => setFirst(5009));
  expect(scrolls).toEqual([]);

  // A range the user didn't scroll to is shown.
  await act(async () => setFirst(5012));
  await finishScroll();
  expect(shownItem()).toBe(5012);
});

test("the user taking over a scroll to the next page moves the range as they go", async () => {
  const { userScrollsTo } = await show();
  await act(async () => setFirst(5007));
  expect(scrolls.at(-1)).toEqual({ behavior: "smooth", left: expect.any(Number) });
  onScroll.mockClear();

  // Mid-way, the user scrolls far on before the smooth scroll settles.
  await userScrollsTo(5020, false);

  expect(onScroll).toHaveBeenCalledWith(5020);
});

test("a drag that scrolls the view still moves the range, without snapping it", async () => {
  const { userScrollsTo, viewport } = await show(<Axis interacting />);
  scrolls = [];

  await act(async () => {
    viewport.scrollLeft += 4.5 * ITEM;
    viewport.dispatchEvent(new Event("scroll"));
  });
  expect(onScroll).toHaveBeenLastCalledWith(5005);

  await userScrollsTo(5009.5);
  // At rest, the view waits for the gesture to end before coming to rest on a day.
  expect(scrolls).toEqual([]);
});

test("a range that replaces one still being scrolled to wins", async () => {
  const { rest, shownItem } = await show();
  await act(async () => setFirst(5007));
  expect(scrolls.at(-1)?.behavior).toBe("smooth");

  // A date far away, picked before the scroll to the next page arrives.
  await act(async () => setFirst(5100));
  expect(scrolls.at(-1)?.behavior).toBe("instant");
  await rest();

  expect(shownItem()).toBe(5100);
  expect(onScroll).not.toHaveBeenCalled();
});

test("flipping the direction keeps the same day in view", async () => {
  const { rest, shownItem, userScrollsTo, viewport } = await show();
  await userScrollsTo(5004);
  onScroll.mockClear();

  for (const rtl of [true, false]) {
    // Browsers reset `scrollLeft` when an element's direction flips.
    viewport.scrollLeft = 0;
    await act(async () => setRtl(rtl));
    await rest();

    expect(Math.sign(viewport.scrollLeft)).toBe(rtl ? -1 : 1);
    expect(shownItem()).toBe(5004);
    expect(onScroll).not.toHaveBeenCalled();
  }
});

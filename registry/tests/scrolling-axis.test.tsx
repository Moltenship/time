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
    this.scrollLeft = left;
  } as HTMLElement["scrollTo"];
});

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

let setFirst: (first: number) => void = () => {};
let rerender: () => void = () => {};
const onScroll = vi.fn<(first: number) => void>();

/** A view on the axis whose range only moves when the test says so, as a controlled anchor. */
function Axis({ interacting = false }: { readonly interacting?: boolean }) {
  const [first, setState] = useState(5000);
  const [, setTick] = useState(0);
  setFirst = setState;
  rerender = () => setTick((tick) => tick + 1);
  const axis = useScrollingAxis({ axis: "inline", first, onScroll, page: PAGE, rtl: false });
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
  const shownItem = () => base() + viewport.scrollLeft / ITEM;
  return { shownItem, userScrollsTo, viewport };
}

test("opens on the range, with room to scroll either way", async () => {
  const { shownItem } = await show();

  expect(shownItem()).toBe(5000);
  expect(scrolls.at(-1)?.behavior).toBe("instant");
});

test("a range that commits late does not pull the view back, even past other renders", async () => {
  const { shownItem, userScrollsTo } = await show();

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

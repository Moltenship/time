// @vitest-environment jsdom

import type { JSX } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import {
  epochDay,
  fromEpochDay,
  ScrollSnapPoints,
  useScrollingAxis,
} from "@registry/calendar/scrolling-axis";

import { render, settled } from "./render";

// The React axis's tests (registry/tests/scrolling-axis.test.tsx), in Solid: both bind the same
// controller, `scrolling-axis-controller.ts`, so they scroll the same way.

/** The viewport fits a page of items: seven 100px days, or one 700px day. */
const ITEM = 100;
let viewportWidth = 700;

let scrolls: { left: number; behavior: ScrollBehavior | undefined }[] = [];
/** What the ResizeObservers watch, which `rerender` tells about a new layout. */
let observers: (() => void)[] = [];

beforeEach(() => {
  scrolls = [];
  observers = [];
  viewportWidth = 700;
  // jsdom lays nothing out: give the track a length and let `scrollTo` move the element.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const count = Number(this.dataset["count"] ?? 0);
    const item = Number(this.dataset["item"] ?? ITEM);
    return DOMRect.fromRect({ height: count * item, width: count * item });
  });
  HTMLElement.prototype.scrollTo = function (
    this: HTMLElement,
    options?: ScrollToOptions | number,
  ) {
    // `left` records the position along either axis.
    const { behavior, left, top } = options as ScrollToOptions;
    const position = left ?? top ?? 0;
    scrolls.push({ behavior, left: position });
    // A smooth scroll is still on its way until the test finishes it.
    if (behavior === "smooth") return;
    if (top === undefined) this.scrollLeft = position;
    else this.scrollTop = position;
  } as HTMLElement["scrollTo"];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      readonly callback: () => void;
      constructor(callback: () => void) {
        this.callback = callback;
      }
      observe() {
        if (!observers.includes(this.callback)) observers.push(this.callback);
      }
      unobserve() {}
      disconnect() {
        observers = observers.filter((callback) => callback !== this.callback);
      }
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

let setFirst: (first: number) => void = () => {};
let request: (first: number) => void = () => {};
let setPage: (page: number) => void = () => {};
let setRtl: (rtl: boolean) => void = () => {};
/** The layout changes: the track takes the new item size, and the observers see it. */
let rerender: () => void = () => {};
const onScroll = vi.fn<(first: number) => void>();

/** A view on the axis whose range only moves when the test says so, as a controlled anchor. */
function Axis(props: {
  /** Weeks down the block axis, as the month scrolls, rather than days across. */
  readonly block?: boolean;
  readonly interacting?: boolean;
}) {
  const [first, setFirstState] = createSignal(5000);
  const [rtl, setRtlState] = createSignal(false);
  const [page, setPageState] = createSignal(7);
  const [tick, setTick] = createSignal(0);
  setFirst = (value) => setFirstState(value);
  setPage = (value) => setPageState(value);
  setRtl = (value) => setRtlState(value);
  rerender = () => {
    setTick((count) => count + 1);
    queueMicrotask(() => {
      for (const callback of observers) callback();
    });
  };
  const axis = useScrollingAxis(() => ({
    axis: props.block === true ? "block" : "inline",
    first: first(),
    onScroll,
    page: page(),
    rtl: rtl(),
    // Whole pages from the range, as the time grid's.
    snapTo: (item) => first() + Math.round((item - first()) / page()) * page(),
  }));
  request = axis.request;
  return (
    <div data-interaction={props.interacting === true ? "move" : undefined}>
      <div
        ref={axis.scrollRef}
        data-axis={props.block === true ? "block" : "inline"}
        data-testid="viewport"
      >
        <div
          ref={axis.trackRef}
          data-base={axis.base()}
          data-count={axis.count()}
          data-item={(tick(), viewportWidth / page())}
        />
      </div>
    </div>
  );
}

/** Runs `change`, then lets the writes it made render. */
async function act(change: () => unknown) {
  change();
  await settled();
  await settled();
}

async function show(element: () => JSX.Element = () => <Axis />) {
  onScroll.mockClear();
  const screen = await render(element);
  await settled();
  const viewport = screen.container.querySelector<HTMLElement>('[data-testid="viewport"]')!;
  const track = () => screen.container.querySelector<HTMLElement>("[data-base]")!;
  const base = () => Number(track().dataset["base"]);
  const item = () => Number(track().dataset["item"]);
  const along = viewport.dataset["axis"] === "block" ? "scrollTop" : "scrollLeft";
  /** The user scrolls so `item` leads the view. */
  const userScrollsTo = async (to: number, end = true) => {
    await act(() => {
      viewport.dispatchEvent(new Event("wheel"));
      viewport[along] = (to - base()) * item();
      viewport.dispatchEvent(new Event("scroll"));
      if (end) viewport.dispatchEvent(new Event("scrollend"));
    });
  };
  const shownItem = () => base() + Math.abs(viewport[along]) / item();
  /** The browser's smooth scroll arrives and comes to rest. */
  const finishScroll = async () => {
    await act(() => {
      viewport[along] = scrolls.at(-1)!.left;
      viewport.dispatchEvent(new Event("scroll"));
      viewport.dispatchEvent(new Event("scrollend"));
    });
  };
  /** The browser reports a scroll coming to rest where the view is. */
  const rest = async () => {
    await act(() => {
      viewport.dispatchEvent(new Event("scroll"));
      viewport.dispatchEvent(new Event("scrollend"));
    });
  };
  return { finishScroll, rest, shownItem, userScrollsTo, viewport };
}

test("numbers days from 1970 for the scrolling axis", () => {
  expect(epochDay(Temporal.PlainDate.from("1970-01-02"))).toBe(1);
  expect(fromEpochDay(epochDay(Temporal.PlainDate.from("2026-10-07"))).toString()).toBe(
    "2026-10-07",
  );
});

test("opens on the range, with room to scroll either way", async () => {
  const { shownItem } = await show();

  expect(shownItem()).toBe(5000);
  expect(scrolls.at(-1)?.behavior).toBe("instant");
});

test("a range that commits the latest scroll late does not pull the view back", async () => {
  const { finishScroll, shownItem, userScrollsTo } = await show();

  await userScrollsTo(5007);
  expect(onScroll).toHaveBeenLastCalledWith(5007);
  // The app hasn't moved its anchor yet, and something else changes the layout.
  scrolls = [];
  await act(() => rerender());
  expect(scrolls).toEqual([]);
  // The user scrolls on, and the app then takes the latest date.
  await userScrollsTo(5014);
  await act(() => setFirst(5014));
  expect(scrolls).toEqual([]);
  expect(shownItem()).toBe(5014);

  // A range the user didn't scroll to is shown.
  await act(() => setFirst(5012));
  await finishScroll();
  expect(shownItem()).toBe(5012);
});

test("any range but the latest scroll moves the view, as a date picked after rejected scrolls", async () => {
  const { finishScroll, shownItem, userScrollsTo } = await show();

  // The app keeps its anchor through many scrolls, back and forth.
  for (let step = 0; step < 50; step += 1) await userScrollsTo(step % 2 === 0 ? 5007 : 5014);
  await act(() => setFirst(5007));
  await finishScroll();

  expect(shownItem()).toBe(5007);
});

test("the user taking over a scroll to the next page moves the range as they go", async () => {
  const { userScrollsTo } = await show();
  await act(() => setFirst(5007));
  expect(scrolls.at(-1)).toEqual({ behavior: "smooth", left: expect.any(Number) });
  onScroll.mockClear();

  // Mid-way, the user scrolls two pages on before the smooth scroll settles.
  await userScrollsTo(5021, false);

  expect(onScroll).toHaveBeenCalledWith(5021);
});

test("a drag that scrolls the view still moves the range, without snapping it", async () => {
  const { userScrollsTo, viewport } = await show(() => <Axis interacting />);
  scrolls = [];

  await act(() => {
    viewport.scrollLeft += 4.5 * ITEM;
    viewport.dispatchEvent(new Event("scroll"));
  });
  // Past half a page: the next page.
  expect(onScroll).toHaveBeenLastCalledWith(5007);

  await userScrollsTo(5009.5);
  // At rest, the view waits for the gesture to end before coming to rest on a page.
  expect(scrolls).toEqual([]);
});

test("a finger that pauses mid-swipe holds the view until it lifts", async () => {
  const { finishScroll, shownItem, viewport } = await show();
  const touch = (type: string, target: Element = viewport) =>
    act(() => {
      target.dispatchEvent(new Event(type, { bubbles: true }));
    });
  // The finger lands on a day, which leaves the document as the canvas recentres.
  const day = viewport.querySelector("[data-base]")!.appendChild(document.createElement("div"));
  scrolls = [];
  await touch("touchstart", day);
  await act(() => {
    viewport.scrollLeft += 2.6 * ITEM;
    viewport.dispatchEvent(new Event("scroll"));
  });
  day.remove();

  // Still, past the time a scroll takes to settle: the view stays under the finger.
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(scrolls).toEqual([]);

  // It lifts short of halfway, and the view comes back to its page.
  await touch("touchend", day);
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(scrolls).toEqual([{ behavior: "smooth", left: expect.any(Number) }]);
  await finishScroll();
  expect(shownItem()).toBe(5000);
});

test("two fingers hold the view until both lift, the last to land lifting first", async () => {
  const { finishScroll, shownItem, viewport } = await show();
  const track = viewport.querySelector("[data-base]")!;
  const [first, second] = [0, 1].map(() => track.appendChild(document.createElement("div")));
  /** A touch event on `target` for `finger`, with `down` the fingers on the screen after it. */
  const touch = (type: string, target: Element, finger: number, down: readonly number[]) =>
    act(() => {
      const event = Object.assign(new Event(type, { bubbles: true }), {
        changedTouches: [{ identifier: finger }],
        touches: down.map((identifier) => ({ identifier })),
      });
      target.dispatchEvent(event);
    });
  scrolls = [];
  await touch("touchstart", first!, 1, [1]);
  await touch("touchstart", second!, 2, [1, 2]);
  await act(() => {
    viewport.scrollLeft += 2.6 * ITEM;
    viewport.dispatchEvent(new Event("scroll"));
  });

  // The finger that landed last lifts first: the other still holds the view.
  await touch("touchend", second!, 2, [1]);
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(scrolls).toEqual([]);

  await touch("touchend", first!, 1, []);
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(scrolls).toEqual([{ behavior: "smooth", left: expect.any(Number) }]);
  await finishScroll();
  expect(shownItem()).toBe(5000);
});

test.each([
  ["on to the next page past halfway", 5004.4, 5007],
  ["back short of halfway", 5002.6, 5000],
  ["on to the page before past halfway", 4995.2, 4993],
])("a snapping view left between pages comes to rest %s", async (_, to, page) => {
  const { finishScroll, shownItem, userScrollsTo } = await show();
  scrolls = [];

  await userScrollsTo(to);
  expect(scrolls).toEqual([{ behavior: "smooth", left: expect.any(Number) }]);
  await finishScroll();

  expect(shownItem()).toBe(page);
  if (page === 5000) expect(onScroll).not.toHaveBeenCalled();
  else expect(onScroll).toHaveBeenLastCalledWith(page);
});

test("a snapping view's pages keep the range's alignment", async () => {
  const { finishScroll, shownItem, userScrollsTo } = await show();
  // Today, say, puts a Wednesday first.
  await act(() => setFirst(5003));
  await finishScroll();

  await userScrollsTo(5008);
  await finishScroll();

  expect(shownItem()).toBe(5010);
  expect(onScroll).toHaveBeenLastCalledWith(5010);
});

test("a resize before an instant navigation's scroll reports keeps the view where it went", async () => {
  const { shownItem, userScrollsTo } = await show(() => <Axis block />);
  await userScrollsTo(5007);
  await act(() => setFirst(5007));
  // A date far away jumps there, and the window grows before the jump's scroll event.
  await act(() => setFirst(5100));

  viewportWidth = 800;
  await act(() => rerender());

  expect(shownItem()).toBeCloseTo(5100);
});

test("items resizing with nothing observed doesn't stop scrolls moving the range", async () => {
  const { userScrollsTo, viewport } = await show();
  // Wider days, as when the gutter narrows, with no render and no observer to say so.
  const track = viewport.querySelector<HTMLElement>("[data-base]")!;
  track.dataset["item"] = "120";

  // The first scroll lays the new size out; scrolls from then on move the range.
  await userScrollsTo(5007);
  await userScrollsTo(5007);

  expect(onScroll).toHaveBeenLastCalledWith(5007);
});

test("a range that replaces one still being scrolled to wins", async () => {
  const { rest, shownItem } = await show();
  await act(() => setFirst(5007));
  expect(scrolls.at(-1)?.behavior).toBe("smooth");

  // A date far away, picked before the scroll to the next page arrives.
  await act(() => setFirst(5100));
  expect(scrolls.at(-1)?.behavior).toBe("instant");
  await rest();

  expect(shownItem()).toBe(5100);
  expect(onScroll).not.toHaveBeenCalled();
});

test("flipping the direction keeps the same day in view", async () => {
  const { rest, shownItem, userScrollsTo, viewport } = await show();
  await userScrollsTo(5007);
  onScroll.mockClear();

  for (const rtl of [true, false]) {
    // Browsers reset `scrollLeft` when an element's direction flips.
    viewport.scrollLeft = 0;
    await act(() => setRtl(rtl));
    await rest();

    expect(Math.sign(viewport.scrollLeft)).toBe(rtl ? -1 : 1);
    expect(shownItem()).toBe(5007);
    expect(onScroll).not.toHaveBeenCalled();
  }
});

test("undoing a range before its scroll moves stops that scroll", async () => {
  const { rest, shownItem, viewport } = await show();
  await act(() => setFirst(5007));
  expect(scrolls.at(-1)?.behavior).toBe("smooth");

  await act(() => setFirst(5000));

  // An instant scroll to where the view is cancels the smooth one.
  expect(scrolls.at(-1)).toEqual({ behavior: "instant", left: viewport.scrollLeft });
  await rest();
  expect(shownItem()).toBe(5000);
  expect(onScroll).not.toHaveBeenCalled();
});

test("switching between a week and a day keeps the shown day", async () => {
  const { rest, shownItem, userScrollsTo } = await show();
  await userScrollsTo(5007);
  onScroll.mockClear();

  for (const page of [1, 7]) {
    // The same view component renders both, so only the day's width changes.
    await act(() => setPage(page));
    await rest();

    expect(shownItem()).toBe(5007);
    expect(onScroll).not.toHaveBeenCalled();
  }
});

test("a resize of a pixel, a fraction of one per day, keeps the shown day in place", async () => {
  const { rest, shownItem, userScrollsTo } = await show();
  await userScrollsTo(5007);
  onScroll.mockClear();

  // Each day grows by a seventh of a pixel; a thousand days from the canvas start, that's 143px.
  viewportWidth = 701;
  await act(() => rerender());
  await rest();

  expect(shownItem()).toBeCloseTo(5007, 6);
  expect(onScroll).not.toHaveBeenCalled();
});

test("a controlled anchor that takes the last of many scrolls leaves the view in place", async () => {
  const { shownItem, userScrollsTo } = await show();

  // Twenty scrolls, a page at a time, before the app takes the last one.
  for (let step = 1; step <= 20; step += 1) await userScrollsTo(5000 + 7 * step);
  scrolls = [];
  await act(() => setFirst(5140));

  expect(scrolls).toEqual([]);
  expect(shownItem()).toBe(5140);
});

test("a request for the range the calendar has shows it again over a scroll it declined", async () => {
  const { finishScroll, shownItem, userScrollsTo } = await show();
  // The view's own scroll comes back as a request, which changes nothing.
  onScroll.mockImplementation((item) => request(item));
  await userScrollsTo(5007);
  expect(shownItem()).toBe(5007);

  // The app keeps 5000, and Today asks for it: the range doesn't change, so no render follows.
  scrolls = [];
  await act(() => request(5000));
  expect(scrolls).toHaveLength(1);
  await finishScroll();

  expect(shownItem()).toBe(5000);
  onScroll.mockReset();
});

test("a request for another range waits for the range to arrive", async () => {
  const { finishScroll, shownItem, userScrollsTo } = await show();
  await userScrollsTo(5007);
  scrolls = [];

  await act(() => request(5014));
  expect(scrolls).toEqual([]);
  await act(() => setFirst(5014));
  await finishScroll();

  expect(shownItem()).toBe(5014);
});

test.each([
  ["days across", false],
  ["weeks down", true],
])(
  "a request for the range the calendar has stops a short scroll before it settles (%s)",
  async (_, block) => {
    const { finishScroll, rest, shownItem, userScrollsTo } = await show(() => (
      <Axis block={block} />
    ));

    // A day's scroll, short of the half page that would report it, still on its way.
    await userScrollsTo(5001, false);
    scrolls = [];
    await act(() => request(5000));
    // Any scroll the request started arrives; either way the user's scroll then comes to rest.
    if (scrolls.length > 0) await finishScroll();
    else await rest();

    expect(shownItem()).toBe(5000);
    expect(onScroll).not.toHaveBeenCalled();
  },
);

test("a request during a drag jumps, and the drag's scroll goes on moving the range", async () => {
  const { userScrollsTo, viewport } = await show(() => <Axis interacting />);
  // The drag's auto-scroll has moved a day, short of reporting anything.
  await userScrollsTo(5001, false);
  scrolls = [];

  await act(() => request(5000));
  expect(scrolls.map(({ behavior }) => behavior)).toEqual(["instant"]);

  // Auto-scroll carries on past half a page, which moves the range to the next one.
  await act(() => {
    viewport.scrollLeft += 4 * ITEM;
    viewport.dispatchEvent(new Event("scroll"));
  });
  expect(onScroll).toHaveBeenLastCalledWith(5007);
});

test("snap points sit where each page starts, across the other axis", async () => {
  const { container } = await render(() => (
    <div>
      <ScrollSnapPoints axis="block" base={4000} points={[5000, 5007]} size="40px" />
      <ScrollSnapPoints axis="inline" base={4000} points={[5003]} size="10px" />
    </div>
  ));
  const [block, inline] = [...container.querySelectorAll('[aria-hidden="true"]')];
  // As the browser writes the offsets back.
  const css = (property: string, value: string) => {
    const element = document.createElement("div");
    element.style.setProperty(property, value);
    return element.style.getPropertyValue(property);
  };

  expect(
    [...block!.children].map((point) => (point as HTMLElement).style.getPropertyValue("top")),
  ).toEqual([css("top", "calc(1000 * 40px)"), css("top", "calc(1007 * 40px)")]);
  expect((inline!.children[0] as HTMLElement).style.getPropertyValue("inset-inline-start")).toBe(
    css("inset-inline-start", "calc(1003 * 10px)"),
  );
});

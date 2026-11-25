import type { BrowserCommand } from "vite-plus/test/node";

type Page = import("playwright").Page;
type Session = import("playwright").CDPSession;

/** A finger's swipe, at points in the test page's viewport. */
export interface SwipeSteps {
  readonly from: readonly [number, number];
  /** How far the finger moves along each axis. */
  readonly by: readonly [number, number];
  /** Moves, one a frame; each must pass the browser's touch slop, so the swipe scrolls at once. */
  readonly steps: number;
}

const sessions = new WeakMap<Page, Promise<Session>>();
const frameMs = 1000 / 60;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A finger's swipe on Chromium's touch screen, sent from here rather than from the page. A page
 * sending its own touches sends them late on a loaded machine, when its main thread is busy: the
 * first move could come after the long-press's 450 ms and start a drag, and a burst of late moves
 * read as a flick of any speed. A touch screen samples the finger whatever the page is doing, and
 * so does this, a move a frame, each stamped with the time the finger was there.
 */
export const swipe: BrowserCommand<[steps: SwipeSteps]> = async (context, swipe) => {
  if (context.provider.name !== "playwright") throw new Error("swipe needs Playwright");
  const { page } = context as typeof context & { page: Page };
  let session = sessions.get(page);
  if (session === undefined) {
    session = page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  const cdp = await session;
  // The test page runs in an iframe, shifted and scaled on the runner's page, as for `mouse`.
  const frame = await (
    context as typeof context & { frame(): Promise<import("playwright").Frame> }
  ).frame();
  const box = (await (await frame.frameElement()).boundingBox()) ?? { width: 0, x: 0, y: 0 };
  const width = await frame.evaluate(() => innerWidth);
  const scale = box.width > 0 && width > 0 ? box.width / width : 1;
  const point = (t: number) => ({
    id: 1,
    x: box.x + (swipe.from[0] + swipe.by[0] * t) * scale,
    y: box.y + (swipe.from[1] + swipe.by[1] * t) * scale,
  });

  const start = Date.now();
  /** The time `step` frames in, in seconds since the epoch, once it has come. */
  const at = async (step: number) => {
    const time = start + step * frameMs;
    const early = time - Date.now();
    if (early > 0) await wait(early);
    return time / 1000;
  };
  const touch = (type: "touchEnd" | "touchMove" | "touchStart", timestamp: number, t?: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      timestamp,
      touchPoints: t === undefined ? [] : [point(t)],
      type,
    });

  await touch("touchStart", start / 1000, 0);
  try {
    for (let step = 1; step <= swipe.steps; step++) {
      await touch("touchMove", await at(step), step / swipe.steps);
    }
  } finally {
    await touch("touchEnd", await at(swipe.steps + 1));
  }
};

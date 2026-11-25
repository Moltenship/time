import type { BrowserCommand } from "vite-plus/test/node";

type Page = import("playwright").Page;
type Session = import("playwright").CDPSession;

const sessions = new WeakMap<Page, Promise<Session>>();

/**
 * Sets how fast the animations and transitions of the page and the frames it has now run, through
 * Chromium's DevTools protocol: 0.05 runs a 100 ms transition for 2 s, so a test can catch it
 * before it ends. The rate lasts until a test sets it back to 1 when it's done; a frame opened
 * after the call runs at its own rate, so a test opens its frame first.
 *
 * It leaves the protocol's `Animation` domain off, which the rate doesn't need. On, it keeps every
 * animation the page has run, and with it the frame that ran it: the parity tests open hundreds
 * of frames in one page, which stayed in memory until the page's heap neared 1.6 GB and Chromium
 * dropped the page's connections, Vitest's among them ("Browser connection was closed").
 */
export const animationRate: BrowserCommand<[rate: number]> = async (context, rate) => {
  if (context.provider.name !== "playwright") throw new Error("animationRate needs Playwright");
  const { page } = context as typeof context & { page: Page };
  let session = sessions.get(page);
  if (session === undefined) {
    session = page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  await (await session).send("Animation.setPlaybackRate", { playbackRate: rate });
};

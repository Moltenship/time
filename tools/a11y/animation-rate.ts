import type { BrowserCommand } from "vite-plus/test/node";

type Page = import("playwright").Page;
type Session = import("playwright").CDPSession;

const sessions = new WeakMap<Page, Promise<Session>>();

/**
 * Sets how fast the page's animations and transitions run, through Chromium's DevTools protocol:
 * 0.05 runs a 100 ms transition for 2 s, so a test can catch it before it ends. The rate lasts
 * while the page does, so a test sets it back to 1 when it's done.
 */
export const animationRate: BrowserCommand<[rate: number]> = async (context, rate) => {
  if (context.provider.name !== "playwright") throw new Error("animationRate needs Playwright");
  const { page } = context as typeof context & { page: Page };
  let session = sessions.get(page);
  if (session === undefined) {
    session = page
      .context()
      .newCDPSession(page)
      .then(async (created) => {
        await created.send("Animation.enable");
        return created;
      });
    sessions.set(page, session);
  }
  await (await session).send("Animation.setPlaybackRate", { playbackRate: rate });
};

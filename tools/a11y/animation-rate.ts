import type { BrowserCommand } from "vite-plus/test/node";

type Page = import("playwright").Page;
type Session = import("playwright").CDPSession;

const sessions = new WeakMap<Page, Promise<Session>>();

/**
 * Sets how fast animations and transitions run in the page and every frame in it, through
 * Chromium's DevTools protocol: 0.05 runs a 100 ms transition for 2 s, so a test can catch it
 * before it ends. Frames opened after the call run at the rate too, until a test sets it back to 1
 * when it's done. Below 1, the command checks that every frame's clock slowed, and throws if one
 * didn't, so a rate that stops applying fails the test instead of letting transitions end unseen.
 *
 * It leaves the protocol's `Animation` domain off, which the rate doesn't need. Once on, the domain
 * stays on for the page and keeps every animation the page runs, and with it the frame that ran
 * it: the parity tests open a frame per case, and every frame later files in the same page opened
 * stayed in memory too. The page's heap grew to about 1.6 GB before Chromium dropped the page's
 * connections, Vitest's among them ("Browser connection was closed").
 */
export const animationRate: BrowserCommand<[rate: number]> = async (context, rate) => {
  if (context.provider.name !== "playwright") throw new Error("animationRate needs Playwright");
  const { page } = context as typeof context & { page: Page };
  let session = sessions.get(page);
  if (session === undefined) {
    session = page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  try {
    await (await session).send("Animation.setPlaybackRate", { playbackRate: rate });
  } catch (error) {
    sessions.delete(page);
    throw error;
  }
  if (rate < 1) await expectSlowed(page, rate);
};

/** Throws unless each frame's document timeline runs at no more than twice `rate`. */
async function expectSlowed(page: Page, rate: number): Promise<void> {
  const frames = await Promise.all(
    page.frames().map(async (frame) => {
      try {
        return {
          url: frame.url(),
          rate: await frame.evaluate(async () => {
            const frameTick = () => new Promise((resolve) => requestAnimationFrame(resolve));
            await frameTick();
            const [timeline, wall] = [Number(document.timeline.currentTime), performance.now()];
            await frameTick();
            await frameTick();
            return (Number(document.timeline.currentTime) - timeline) / (performance.now() - wall);
          }),
        };
      } catch (error) {
        // A frame that went away mid-check has no animations left to slow.
        if (frame.isDetached()) return undefined;
        throw error;
      }
    }),
  );
  const fast = frames.filter((frame) => frame !== undefined && frame.rate > rate * 2);
  if (fast.length > 0) {
    const list = fast.map((frame) => `${frame!.url} at ${frame!.rate.toFixed(2)}`).join(", ");
    throw new Error(`animationRate(${rate}) didn't slow ${list}`);
  }
}

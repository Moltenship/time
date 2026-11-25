import type { BrowserCommand } from "vite-plus/test/node";

type Page = import("playwright").Page;
type Session = import("playwright").CDPSession;

const sessions = new WeakMap<Page, Promise<Session>>();

/**
 * Collects the page's garbage once its JavaScript heap holds more than `aboveMB`, through
 * Chromium's DevTools protocol. Below that it only reads the heap's size, which takes a moment.
 *
 * The parity tests open a frame for each case, each a whole app of a few hundred modules, and drop
 * it at the next. A dropped frame is garbage, but only a full collection frees it. On a busy
 * 4-core CI runner the page's collector fell so far behind that the heap held a gigabyte, most of it
 * dropped frames: a forced collection there brought 150 documents back to 15 and the heap to
 * 170 MB. At about a gigabyte, Chromium dropped all the page's connections, Vitest's among them
 * ("Browser connection was closed"). Collected after each test, it stays a few hundred MB.
 */
export const collectGarbage: BrowserCommand<[aboveMB: number]> = async (context, aboveMB) => {
  if (context.provider.name !== "playwright") throw new Error("collectGarbage needs Playwright");
  const { page } = context as typeof context & { page: Page };
  let session = sessions.get(page);
  if (session === undefined) {
    session = page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  try {
    const cdp = await session;
    const { usedSize } = await cdp.send("Runtime.getHeapUsage");
    if (usedSize > aboveMB * 1024 * 1024) await cdp.send("HeapProfiler.collectGarbage");
  } catch (error) {
    sessions.delete(page);
    throw error;
  }
};

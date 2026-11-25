import type { BrowserCommand } from "vite-plus/test/node";

type Page = import("playwright").Page;
type Session = import("playwright").CDPSession;

const sessions = new WeakMap<Page, Promise<Session>>();
const warned = new WeakSet<Page>();

/**
 * Collects the page's garbage once its JavaScript heap holds more than `aboveMB`, through
 * Chromium's DevTools protocol. Below that it only reads the heap's size, which takes a moment.
 *
 * The parity tests open a frame for each case, each a whole app of a few hundred modules, and drop
 * it at the next. A dropped frame is garbage, but only a full collection frees it. On a busy
 * 4-core CI runner the page's collector fell behind: the React page's heap reached 0.6–1 GB, most
 * of it dropped frames, and a forced collection brought 150 documents back to 15 and the heap to
 * about 170 MB. With that much uncollected, the page lost all its connections at once, Vitest's
 * among them ("Browser connection was closed"). Why isn't known: it wasn't a crash, which Vitest
 * reports as one. Collecting the garbage after each test stopped it in every run since.
 *
 * If the heap is still above `aboveMB` after a collection, the suite keeps that much alive, and
 * every later test pays for a full collection: it warns once, so the threshold can move.
 */
export const collectGarbage: BrowserCommand<[aboveMB: number]> = async (context, aboveMB) => {
  if (context.provider.name !== "playwright") throw new Error("collectGarbage needs Playwright");
  const { page } = context as typeof context & { page: Page };
  let session = sessions.get(page);
  if (session === undefined) {
    session = page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  const limit = aboveMB * 1024 * 1024;
  try {
    const cdp = await session;
    if ((await cdp.send("Runtime.getHeapUsage")).usedSize <= limit) return;
    await cdp.send("HeapProfiler.collectGarbage");
    const { usedSize } = await cdp.send("Runtime.getHeapUsage");
    if (usedSize > limit && !warned.has(page)) {
      warned.add(page);
      const mb = Math.round(usedSize / 1024 / 1024);
      console.warn(
        `collectGarbage: ${mb} MB live after a full collection, above ${aboveMB} MB, so every test from here on collects`,
      );
    }
  } catch (error) {
    sessions.delete(page);
    throw error;
  }
};

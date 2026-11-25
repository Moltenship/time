import { TestRunner } from "vite-plus/test";

// The waits the React and Solid suites share: they watch the page, and leave settling the
// framework's own work to the caller.

/** Resolves on the next animation frame. */
export const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * The running test's signal. Vitest aborts it when the test times out, before the `afterEach`
 * hooks clean the page up, so a wait still pending then can say what it was waiting for, and stop
 * instead of acting on the next test's page. A signal already aborted, as a retry inherits, is
 * left alone, so a retry's waits run unwatched. `done` ends the watch when the wait ends.
 */
export function timedOut(what: () => unknown): {
  readonly aborted: boolean;
  readonly done: () => void;
} {
  const found = TestRunner.getCurrentTest()?.context.signal;
  const signal = found?.aborted ? undefined : found;
  const onAbort = () => {
    // `undefined` once there's nothing left to say.
    const waiting = what();
    if (waiting !== undefined) console.error("Still waiting for:", waiting);
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  return {
    get aborted() {
      return signal?.aborted ?? false;
    },
    done: () => signal?.removeEventListener("abort", onAbort),
  };
}

/** Up to `length` characters of `text`, with an ellipsis only where it was cut. */
export const clip = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length)}…` : text;

/** A wait the test has left behind: it never resolves, so nothing after it runs. */
export const abandoned = () => new Promise<never>(() => {});

/**
 * Waits until `check` passes, trying once a frame. It sets no deadline of its own: how long a step
 * takes depends on the machine, so the test's timeout bounds it, and the watchdog a stuck page.
 */
export async function until(check: () => void): Promise<void> {
  let last: unknown = "the check to pass";
  const test = timedOut(() => last);
  try {
    for (;;) {
      if (test.aborted) return abandoned();
      let result: unknown;
      try {
        result = check();
      } catch (error) {
        last = error;
        await nextFrame();
        continue;
      }
      last = undefined;
      if (typeof (result as { then?: unknown } | undefined)?.then === "function") {
        throw new TypeError("until() takes a check that passes or throws, not a promise");
      }
      return;
    }
  } finally {
    test.done();
  }
}

/**
 * Resolves once `element` has come to rest: its last scroll has ended, and it hasn't moved for
 * `frames` frames in a row, so a snap or a correction the view starts at the end has run too.
 * Frames, not milliseconds, so a slow machine waits longer instead of looking too early. It also
 * compares the scroll position each frame, which catches movement that comes without a scroll
 * event.
 */
export async function cameToRest(
  element: HTMLElement,
  frames: number,
  settle: () => Promise<void>,
): Promise<void> {
  let resting = false;
  const test = timedOut(() =>
    resting ? undefined : `${element.dataset.slot ?? element.tagName} to come to rest`,
  );
  let quiet = 0;
  // A scroll that hasn't reported its end. Without `scrollend`, 30 still frames end it.
  let moving = false;
  const onScroll = () => {
    quiet = 0;
    moving = true;
  };
  const onEnd = () => {
    quiet = 0;
    moving = false;
  };
  element.addEventListener("scroll", onScroll, { passive: true });
  element.addEventListener("scrollend", onEnd);
  try {
    let position = `${element.scrollLeft},${element.scrollTop}`;
    while (quiet < frames || (moving && quiet < 30)) {
      await nextFrame();
      if (test.aborted) return abandoned();
      const now = `${element.scrollLeft},${element.scrollTop}`;
      quiet = now === position ? quiet + 1 : 0;
      position = now;
    }
    await settle();
    if (test.aborted) return abandoned();
    resting = true;
  } finally {
    element.removeEventListener("scroll", onScroll);
    element.removeEventListener("scrollend", onEnd);
    test.done();
  }
}

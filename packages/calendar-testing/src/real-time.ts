/**
 * Milliseconds on the page's own clock, read through the `performance` object as it was when the
 * package loaded, so deadlines keep running when a test fakes `performance` later.
 */
const page = globalThis.performance;
const now = page === undefined ? undefined : page.now.bind(page);

export function realNow(): number {
  return now?.() ?? 0;
}

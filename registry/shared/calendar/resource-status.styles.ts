/**
 * The resource status badge's classes, one place for every framework's markup. The badge is the
 * kit's outline badge; `data-state` colours the dot before its words.
 */

export const resourceStatusBadgeClass = "max-w-full min-w-0 gap-1.5 px-1.5 font-normal";

/** The dot: `--calendar-busy` when busy, `--calendar-free` when free, muted otherwise. */
export const resourceStatusDotClass =
  "size-1.5 shrink-0 rounded-full bg-muted-foreground in-data-[state=busy]:bg-calendar-busy in-data-[state=free]:bg-calendar-free";

export const resourceStatusTextClass = "truncate";

/** The status in words beside an app's own `DraftStatus`, for screen readers only. */
export const resourceStatusSpokenClass = "sr-only";

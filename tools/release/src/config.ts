const KiB = 1024;

export interface SizeBudget {
  /** Bytes of the emitted ESM file. */
  readonly raw: number;
  /** Bytes after gzip at level 9. */
  readonly gzip: number;
}

export interface PublishedPackage {
  /** Directory under `packages/`. */
  readonly directory: string;
  /** A budget for every subpath in `publishConfig.exports`, except `./package.json`. */
  readonly budgets: Readonly<Record<string, SizeBudget>>;
}

/**
 * Every package that publishes to npm. They share one version until after 1.0. calendar-testing
 * is an empty stub and stays private until then (#45).
 *
 * Budgets measure each entry point's emitted ESM, with dependencies left as imports. Raise one in
 * the PR that needs it, and say why.
 */
export const publishedPackages: readonly PublishedPackage[] = [
  { directory: "calendar", budgets: { ".": { raw: 4 * KiB, gzip: 1.5 * KiB } } },
  // The engine's pending changes and their phases (#199) took calendar-core to 184,065 of 184,320
  // raw and 47,477 of 47,104 gzip bytes. 188 and 48 KiB leave the usual headroom.
  { directory: "calendar-core", budgets: { ".": { raw: 188 * KiB, gzip: 48 * KiB } } },
  { directory: "calendar-dnd", budgets: { ".": { raw: 36 * KiB, gzip: 10 * KiB } } },
  // Root's event source (#200), read through useSyncExternalStore, took calendar-react to 78,147 of
  // 77,824 raw bytes, and onEventChangeResult with useCalendarPendingChanges (#199) to 79,597 raw
  // and 20,740 of 20,480 gzip bytes. 80 and 21 KiB leave the usual headroom.
  { directory: "calendar-react", budgets: { ".": { raw: 80 * KiB, gzip: 21 * KiB } } },
  // The ICS bridge's RANGE=THISANDFUTURE split, Outlook's all-day flag and the feed's zone, then
  // edits replayed on the series' clock (#160), took calendar-recurrence from 130,708 raw and
  // 35,063 gzip bytes to 148,799 and 39,899. 152 and 42 KiB leave the usual headroom.
  { directory: "calendar-recurrence", budgets: { ".": { raw: 152 * KiB, gzip: 42 * KiB } } },
  { directory: "calendar-temporal", budgets: { ".": { raw: 30 * KiB, gzip: 7 * KiB } } },
  // ics keeps the Unicode License v3 of its CLDR data in its build: 1.2 KiB gzip, which took it
  // to 25,267 of 25,600 bytes. 26 KiB leaves the usual headroom.
  { directory: "ics", budgets: { ".": { raw: 88 * KiB, gzip: 26 * KiB } } },
];

/** Optional adapters. Base packages never import them, and the facade's other exports tree-shake them away. */
export const optionalAdapters: readonly string[] = ["@moltenship/calendar-dnd", "@dnd-kit/"];

/** The facade re-exports the pointer adapter, so it is the one package allowed to import it. */
export const facadePackage = "@moltenship/calendar";

/** The pointer adapter the facade re-exports. */
export const pointerAdapterPackage = "@moltenship/calendar-dnd";

/** Where the dry run leaves its tarballs and manifest. Ignored by git. */
export const releaseDirectory = ".release";

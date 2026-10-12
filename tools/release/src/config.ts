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
  { directory: "calendar-core", budgets: { ".": { raw: 180 * KiB, gzip: 46 * KiB } } },
  { directory: "calendar-dnd", budgets: { ".": { raw: 36 * KiB, gzip: 10 * KiB } } },
  { directory: "calendar-react", budgets: { ".": { raw: 76 * KiB, gzip: 20 * KiB } } },
  { directory: "calendar-recurrence", budgets: { ".": { raw: 144 * KiB, gzip: 36 * KiB } } },
  { directory: "calendar-temporal", budgets: { ".": { raw: 30 * KiB, gzip: 7 * KiB } } },
  { directory: "ics", budgets: { ".": { raw: 88 * KiB, gzip: 25 * KiB } } },
];

/** Optional adapters. Base packages never import them, and the facade's other exports tree-shake them away. */
export const optionalAdapters: readonly string[] = ["@moltenship/calendar-dnd", "@dnd-kit/"];

/** The facade re-exports the pointer adapter, so it is the one package allowed to import it. */
export const facadePackage = "@moltenship/calendar";

/** The pointer adapter the facade re-exports. */
export const pointerAdapterPackage = "@moltenship/calendar-dnd";

/** Where the dry run leaves its tarballs and manifest. Ignored by git. */
export const releaseDirectory = ".release";

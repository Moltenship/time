/**
 * What a registry build produced, for tools that don't parse shadcn items: the release tooling
 * (#46) reads it to see which runtime each item needs. The build writes it next to the items as
 * `compatibility.json`.
 */
export interface RegistryManifest {
  readonly registry: string;
  readonly baseUrl: string;
  /** The workspace version of each runtime package the items were built and tested against. */
  readonly runtime: Readonly<Record<string, string>>;
  readonly items: readonly RegistryManifestItem[];
}

export interface RegistryManifestItem {
  readonly name: string;
  readonly type: string;
  readonly url: string;
  /** The runtime range a full install of this item needs, its registry dependencies included. */
  readonly compatibility: Readonly<Record<string, string>>;
  /**
   * The npm packages the item itself installs, as `shadcn add` gets them: ours with a range
   * (`@moltenship/calendar@^1.0.0`), third-party ones bare, so an app keeps the version it has.
   */
  readonly dependencies: readonly string[];
  /** Our items it installs, by name. */
  readonly items: readonly string[];
  /** Stock shadcn components it installs, by name. */
  readonly components: readonly string[];
  /** Where its files land, relative to the consumer's aliases. */
  readonly targets: readonly string[];
}

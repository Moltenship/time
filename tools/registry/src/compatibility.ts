import { satisfies, valid } from "semver";

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

export interface RuntimeIncompatibility {
  readonly item: string;
  readonly package: string;
  readonly range: string;
  /** What the consumer has installed, or null when the package is missing. */
  readonly installed: string | null;
}

/**
 * The items whose runtime range the installed packages don't satisfy. `installed` maps package
 * names to the versions in the consumer's `node_modules`.
 */
export function findIncompatibleItems(
  manifest: RegistryManifest,
  installed: Readonly<Record<string, string>>,
  itemNames: readonly string[] = manifest.items.map(({ name }) => name),
): RuntimeIncompatibility[] {
  const wanted = new Set(itemNames);
  const incompatibilities: RuntimeIncompatibility[] = [];
  for (const item of manifest.items) {
    if (!wanted.has(item.name)) continue;
    for (const [name, range] of Object.entries(item.compatibility)) {
      const version = installed[name] ?? null;
      if (!version || !valid(version) || !satisfies(version, range, { includePrerelease: true })) {
        incompatibilities.push({ item: item.name, package: name, range, installed: version });
      }
    }
  }
  return incompatibilities;
}

export function describeIncompatibility({
  item,
  package: name,
  range,
  installed,
}: RuntimeIncompatibility): string {
  return installed
    ? `${item} needs ${name}@${range}, but ${installed} is installed`
    : `${item} needs ${name}@${range}, which isn't installed`;
}

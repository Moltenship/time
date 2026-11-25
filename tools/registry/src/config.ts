/** The registry's name in `registry.json`, and the namespace its items use for each other. */
export const registryName = "moltenship-time";
export const registryNamespace = "@moltenship";

/**
 * Where the docs site serves the built registry. Items reach each other through URLs under it, so
 * a build for another host (a local server, a custom domain) passes its own `baseUrl`, or sets
 * `REGISTRY_BASE_URL` for the docs build.
 */
const defaultRegistryHomepage = "https://time.molten.sh";
export const defaultRegistryBaseUrl = `${defaultRegistryHomepage}/r`;

/**
 * Code with no framework in it, written once for every framework's items (ADR 0279): a manifest
 * lists `registry/shared/<item>/<file>.ts` as one of its own files, and the file lands at the
 * manifest's target like any other. Shared files import each other as `@registry/shared/…`, and
 * the facade as `@moltenship/calendar`, which a framework's build rewrites to its own facade.
 */
export const registrySharedDirectory = "registry/shared";

/** A set of items styled one way inside a registry, and the item that installs all of them. */
interface RegistryFlavour {
  /** What its items' names start with: `stylex-`, or nothing. */
  readonly prefix: string;
  /** The composition that installs every other item of the flavour, or none yet. */
  readonly fullItem: string | null;
}

/**
 * One framework's registry (ADR 0279, point 2): where its items' source is, what an application
 * of that framework already has, the facade its items import, and where it is served. Item names
 * and targets are the same in every framework's registry.
 */
export interface RegistryFramework {
  readonly name: "react" | "solid";
  /** The registry's name in its `registry.json`. */
  readonly registryName: string;
  /** Item manifests are `<sourceDirectory>/<item>/registry-item.json`. */
  readonly sourceDirectory: string;
  /** Folders under `sourceDirectory` that are another tree, not this registry's items. */
  readonly otherTrees: readonly string[];
  /** The workspace package that lists, and pins, every npm package its source imports. */
  readonly sourcePackage: string;
  /** Where its JSON is served under the registry's base URL: `` or `solid`. */
  readonly path: string;
  /** Packages every application of the framework already has, so items never list them. */
  readonly consumerPackages: ReadonlySet<string>;
  /** The one package of ours its items import, and shared files' `@moltenship/calendar` becomes. */
  readonly facade: string;
  /** Whether a component with hooks or handlers starts with `"use client"` (React Server Components). */
  readonly useClient: boolean;
  readonly flavours: readonly RegistryFlavour[];
}

export const reactRegistry: RegistryFramework = {
  name: "react",
  registryName,
  sourceDirectory: "registry",
  otherTrees: ["shared", "solid"],
  sourcePackage: "registry/package.json",
  path: "",
  consumerPackages: new Set(["react", "react-dom"]),
  facade: "@moltenship/calendar",
  useClient: true,
  flavours: [
    { prefix: "", fullItem: "calendar-full" },
    { prefix: "stylex-", fullItem: "stylex-calendar-full" },
  ],
};

export const solidRegistry: RegistryFramework = {
  name: "solid",
  registryName: `${registryName}-solid`,
  sourceDirectory: "registry/solid",
  otherTrees: [],
  sourcePackage: "registry/solid/package.json",
  path: "solid",
  consumerPackages: new Set(["solid-js", "@solidjs/web"]),
  facade: "@moltenship/calendar-solid",
  useClient: false,
  // `calendar-full` comes once every Solid view exists (ADR 0279, S9).
  flavours: [{ prefix: "", fullItem: null }],
};

export const registryFrameworks: readonly RegistryFramework[] = [reactRegistry, solidRegistry];

/** The base URL a framework's registry is served at, under the registry's own. */
export function frameworkBaseUrl(baseUrl: string, framework: RegistryFramework): string {
  const base = baseUrl.replace(/\/$/u, "");
  return framework.path === "" ? base : `${base}/${framework.path}`;
}

/** The item that installs only the stock shadcn tokens, for an application without shadcn/ui. */
export const baseTokensItemName = "base-tokens";

/**
 * The npm packages a shared file may import: framework-free ones that every framework's items can
 * use. It's a list of what is allowed, not of what is not, because no pattern catches every package
 * made for one framework (`next/link`, `radix-ui`, `motion/react`, `zustand`). A package joins
 * when a shared file needs it and it imports no framework. ui-sdk isn't on it: only the kit's own
 * files import ui-sdk (ADR 0279).
 */
export const sharedFilePackages: ReadonlySet<string> = new Set([
  "@moltenship/calendar",
  "@tanstack/virtual-core",
  "class-variance-authority",
  "clsx",
  "cn",
  "tailwind-merge",
]);

/**
 * Drag and drop stays optional. Views edit through the native pointer layer in
 * `@moltenship/calendar` (ADR 0037), which does nothing until the app passes `onEventChange`; no
 * item may depend on, or import, a drag-and-drop library or the pointer package itself.
 */
export const dragAndDropPackages: readonly RegExp[] = [
  /^@dnd-kit\//u,
  /^@moltenship\/calendar-dnd$/u,
];

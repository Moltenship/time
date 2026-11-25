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

/** Source manifests live one folder deep under `registry/`. */
export const registrySourceDirectory = "registry";

/**
 * Code with no framework in it, written once for every framework's items (ADR 0279): a manifest
 * lists `registry/shared/<item>/<file>.ts` as one of its own files, and the file lands at the
 * manifest's target like any other.
 */
export const registrySharedDirectory = "registry/shared";

/** The workspace package that lists, and pins, every npm package registry source imports. */
export const registrySourcePackage = "registry/package.json";

/** Packages every consumer already has, so items never list them. */
export const consumerPackages: ReadonlySet<string> = new Set(["react", "react-dom"]);

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

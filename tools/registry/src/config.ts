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

const frameworks = /^(?:react|react-dom|solid-js|preact|vue|svelte|lit)(?:\/|$)/u;
const frameworkScopes = /^@(?:solidjs|base-ui|astryxdesign|angular)\//u;
/** ui-sdk's renderers; its core has no framework in it. */
const uiSdkRenderer = /^@ui-sdk\/(?!core(?:\/|$))/u;
/** A package made for one framework, such as `lucide-react` or `@tanstack/react-virtual`. */
const frameworkFlavour = /^(?:@[^/]+\/)?(?:[^/]+-)?(?:react|solid|vue|svelte)(?:-[^/]+)?(?:\/|$)/u;

/** Whether an import names a framework, or a package made for one. */
export function frameworkPackage(specifier: string): boolean {
  if (specifier.startsWith(".") || specifier.startsWith("@registry/")) return false;
  return [frameworks, frameworkScopes, uiSdkRenderer, frameworkFlavour].some((pattern) =>
    pattern.test(specifier),
  );
}

/**
 * Drag and drop stays optional. Views edit through the native pointer layer in
 * `@moltenship/calendar` (ADR 0037), which does nothing until the app passes `onEventChange`; no
 * item may depend on, or import, a drag-and-drop library or the pointer package itself.
 */
export const dragAndDropPackages: readonly RegExp[] = [
  /^@dnd-kit\//u,
  /^@moltenship\/calendar-dnd$/u,
];

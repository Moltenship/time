import type { IConfiguration, IForbiddenRuleType } from "dependency-cruiser";

const packageNames = [
  "calendar",
  "calendar-core",
  "calendar-dnd",
  "calendar-dnd-kit",
  "calendar-primitives",
  "calendar-react",
  "calendar-recurrence",
  "calendar-solid",
  "calendar-temporal",
  "calendar-testing",
  "ics",
] as const;

const packageSourcePath = (packageName: string) => `(?:^|/)packages/${packageName}/src(?:/|$)`;

/**
 * npm packages as dependency-cruiser records them: the specifier when it can't resolve it, or the
 * resolved file under node_modules (pnpm's `node_modules/.pnpm/<id>/node_modules/<name>/…`) when it
 * can. A rule on `^name` alone sees only the first, and a declared dependency resolves.
 */
const npmPackages = (pattern: string) => `(?:^|(?:^|/)node_modules/)(?:${pattern})(?:/|$)`;

const reactPackages = npmPackages(
  "react|react-dom|@types/react|@types/react-dom|@ui-sdk/react|@vitejs/plugin-react",
);
const solidPackages = npmPackages("solid-js|@solidjs/[^/]+|@ui-sdk/solid|vite-plugin-solid");
const uiSdkPackages = npmPackages("@ui-sdk/[^/]+");
/** Other UI frameworks and their ui-sdk renderers, which the primitives don't import either. */
const otherFrameworkPackages = npmPackages(
  "preact|vue|svelte|@angular/[^/]+|lit|@ui-sdk/(?!core(?:/|$))[^/]+",
);

/** Where Solid may appear: the Solid integration and the Solid demo. */
const solidWorkspaces = "(?:^|/)(?:packages/calendar-solid|apps/demo-solid)/";
/**
 * Where ui-sdk may appear: the primitives, the two integrations, and the applications that create
 * an agent bridge to show them (architecture.md, rule 14): the Solid demo and the docs site. Also
 * calendar-testing's tests, which drive an agent over a recurring series: only that package
 * depends on both the facade and recurrence. Its source stays free of ui-sdk.
 */
const uiSdkWorkspaces =
  "(?:^|/)(?:packages/calendar-(?:primitives|react|solid)/|packages/calendar-testing/tests/|apps/(?:demo-solid|showcase)/)";
const sourceRoots = "(?:^|/)(?:apps|benchmarks|packages|registry|tools)/";
/** A package's source and its tests: rules 12 and 13 cover both (architecture.md). */
const packageCodePath = (packageName: string) =>
  `(?:^|/)packages/${packageName}/(?:src|tests)(?:/|$)`;
/** ui-sdk's date entries, which the packages never import: the domain is the engine's (rule 14). */
const uiSdkDateEntries = "date|calendar|timeline|date-picker|date-input|time-input";
/** What the primitives import, and the only things (rule 12): core, the Temporal utilities and ui-sdk's core. */
const primitivesImports = [
  "^@moltenship/calendar-(?:core|temporal)$",
  "(?:^|/)packages/calendar-(?:core|primitives|temporal)/",
  npmPackages("@ui-sdk/core"),
];
/**
 * What the two rules above already report for the primitives, so the "nothing else" rules name
 * only what neither of them does.
 */
const primitivesReportedElsewhere = [
  reactPackages,
  solidPackages,
  otherFrameworkPackages,
  npmPackages("jotai|@dnd-kit/[^/]+"),
  "\\.(?:css|less|sass|scss)$",
  "^@moltenship/",
  "(?:^|/)packages/",
];

const noOtherPackageSourceRules: IForbiddenRuleType[] = packageNames.map((packageName) => ({
  name: `no-${packageName}-deep-imports`,
  comment: `${packageName} must consume other workspaces through their package entry points.`,
  severity: "error",
  from: { path: packageSourcePath(packageName) },
  to: {
    path: "(?:^|/)packages/[^/]+/src(?:/|$)",
    pathNot: packageSourcePath(packageName),
  },
}));

export default {
  forbidden: [
    ...noOtherPackageSourceRules,
    {
      name: "no-package-source-specifiers",
      comment: "Workspace package specifiers expose only curated exports, never src paths.",
      severity: "error",
      from: {},
      to: { path: `^@moltenship/(?:${packageNames.join("|")})/src` },
    },
    {
      name: "consumers-use-public-package-entrypoints",
      comment: "Apps, benchmarks, registry source, and tools may not deep-import package source.",
      severity: "error",
      from: { path: "(?:^|/)(?:apps|benchmarks|registry|tools)/" },
      to: { path: "(?:^|/)packages/[^/]+/src(?:/|$)" },
    },
    {
      name: "packages-do-not-import-consumers",
      comment: "Published packages may not depend on applications or consumer-owned source.",
      severity: "error",
      from: { path: "(?:^|/)packages/[^/]+/src(?:/|$)" },
      to: { path: "(?:^|/)(?:apps|benchmarks|registry|tools)/" },
    },
    {
      name: "registry-source-uses-calendar-facade",
      comment:
        "Copied registry source depends only on the calendar facade and its declared UI deps.",
      severity: "error",
      from: {
        path: "(?:^|/)registry/",
        pathNot: ["(?:^|/)tools/registry/", "(?:^|/)registry/tests/"],
      },
      to: {
        path: ["^@moltenship/", "(?:^|/)(?:apps|benchmarks|packages|tools)/"],
        pathNot: "^@moltenship/calendar$",
      },
    },
    {
      name: "registry-tests-use-the-facade-and-the-harness",
      comment:
        "The registry's tests, which aren't copied, also use the test harness, as an app's tests would.",
      severity: "error",
      from: { path: "(?:^|/)registry/tests/", pathNot: "(?:^|/)tools/registry/" },
      to: {
        path: ["^@moltenship/", "(?:^|/)(?:apps|benchmarks|packages|tools)/"],
        pathNot: "^@moltenship/calendar(?:-testing)?$",
      },
    },
    {
      name: "ics-is-standalone",
      comment:
        "The iCalendar package depends on no other workspace, so any application can use it.",
      severity: "error",
      from: { path: "(?:^|/)packages/ics/src(?:/|$)" },
      to: { path: ["^@moltenship/", "(?:^|/)packages/(?!ics/)[^/]+/"] },
    },
    {
      name: "only-the-dnd-kit-adapter-imports-dnd-kit",
      comment:
        "dnd-kit stays an optional peer of @moltenship/calendar-dnd-kit; no other package imports it.",
      severity: "error",
      from: {
        path: "(?:^|/)packages/[^/]+/src(?:/|$)",
        pathNot: "(?:^|/)packages/calendar-dnd-kit/src(?:/|$)",
      },
      to: { path: "^@dnd-kit/" },
    },
    {
      name: "dnd-kit-adapter-binds-the-pointer-layer",
      comment:
        "The dnd-kit adapter binds calendar-dnd and core, never the React bindings or the facade.",
      severity: "error",
      from: { path: "(?:^|/)packages/calendar-dnd-kit/src(?:/|$)" },
      to: { path: ["^@moltenship/calendar-react$", "^@moltenship/calendar$"] },
    },
    {
      name: "testing-uses-public-entry-points",
      comment:
        "The test harness builds on what apps import: the calendar facade and recurrence, never the packages behind the facade.",
      severity: "error",
      from: { path: "(?:^|/)packages/calendar-testing/src(?:/|$)" },
      // Specifiers as written, and the packages' source should they resolve to it.
      to: {
        path: ["^@moltenship/", "(?:^|/)packages/"],
        pathNot: [
          "^@moltenship/(?:calendar|calendar-recurrence)$",
          "(?:^|/)packages/(?:calendar|calendar-recurrence|calendar-testing)/",
        ],
      },
    },
    {
      name: "primitives-import-no-framework",
      comment:
        "calendar-primitives is framework-free, its tests too: no React, Solid or other framework, no ui-sdk renderer, no Jotai, dnd-kit or CSS. DOM types are fine.",
      severity: "error",
      from: { path: packageCodePath("calendar-primitives") },
      to: {
        path: [
          reactPackages,
          solidPackages,
          otherFrameworkPackages,
          npmPackages("jotai|@dnd-kit/[^/]+"),
          "\\.(?:css|less|sass|scss)$",
        ],
      },
    },
    {
      name: "primitives-build-on-the-engine",
      comment:
        "calendar-primitives imports core and the Temporal utilities, nothing else of ours, in its tests too: no integration, facade, pointer layer or registry source.",
      severity: "error",
      from: { path: packageCodePath("calendar-primitives") },
      // Specifiers as written, and the packages' source should they resolve to it.
      to: {
        path: ["^@moltenship/", "(?:^|/)packages/"],
        pathNot: [
          // The package's own name too, which its tests may import it by.
          "^@moltenship/calendar-(?:core|primitives|temporal)$",
          "(?:^|/)packages/calendar-(?:core|primitives|temporal)/",
        ],
      },
    },
    {
      name: "primitives-import-nothing-else",
      comment:
        "calendar-primitives' source imports core, the Temporal utilities and @ui-sdk/core, and nothing else: no other npm package and no Node built-in.",
      severity: "error",
      from: { path: packageSourcePath("calendar-primitives") },
      to: { pathNot: [...primitivesImports, ...primitivesReportedElsewhere] },
    },
    {
      name: "primitives-tests-import-nothing-else",
      comment:
        "calendar-primitives' tests import what its source may, plus the test runner, jsdom and Node's built-ins.",
      severity: "error",
      from: { path: "(?:^|/)packages/calendar-primitives/tests(?:/|$)" },
      to: {
        pathNot: [
          ...primitivesImports,
          ...primitivesReportedElsewhere,
          npmPackages("vite-plus|jsdom"),
        ],
        // Node's built-ins, which the cruiser records without their `node:` prefix.
        dependencyTypesNot: ["core"],
      },
    },
    {
      name: "react-integration-builds-on-the-primitives",
      comment:
        "calendar-react imports the primitives, core and the Temporal utilities of ours, never calendar-solid.",
      severity: "error",
      from: { path: packageSourcePath("calendar-react") },
      to: {
        path: ["^@moltenship/", "(?:^|/)packages/"],
        pathNot: [
          "^@moltenship/calendar-(?:core|primitives|temporal)$",
          "(?:^|/)packages/calendar-(?:core|primitives|react|temporal)/",
        ],
      },
    },
    {
      name: "solid-integration-builds-on-the-primitives",
      comment:
        "calendar-solid imports the primitives, core and the Temporal utilities of ours, in its tests too, never calendar-react, the facade or the React-only packages.",
      severity: "error",
      from: { path: packageCodePath("calendar-solid") },
      to: {
        path: ["^@moltenship/", "(?:^|/)packages/"],
        pathNot: [
          "^@moltenship/calendar-(?:core|primitives|solid|temporal)$",
          "(?:^|/)packages/calendar-(?:core|primitives|solid|temporal)/",
        ],
      },
    },
    {
      name: "react-integration-tests-import-no-solid-integration",
      comment: "The integrations never import each other, in their tests either.",
      severity: "error",
      from: { path: "(?:^|/)packages/calendar-react/tests(?:/|$)" },
      to: { path: ["^@moltenship/calendar-solid$", "(?:^|/)packages/calendar-solid/"] },
    },
    {
      name: "no-react-in-primitives-or-solid",
      comment: "React stays out of calendar-primitives and calendar-solid, their tests included.",
      severity: "error",
      from: { path: "(?:^|/)packages/calendar-(?:primitives|solid)/" },
      to: { path: reactPackages },
    },
    {
      name: "only-calendar-solid-imports-solid",
      comment: "Solid appears only in calendar-solid and the Solid demo.",
      severity: "error",
      from: { path: sourceRoots, pathNot: solidWorkspaces },
      to: { path: solidPackages },
    },
    {
      name: "only-primitives-and-integrations-import-ui-sdk",
      comment:
        "ui-sdk is a peer of calendar-primitives, calendar-react and calendar-solid; besides them only the applications that create an agent bridge import it: the Solid demo and the docs site.",
      severity: "error",
      from: { path: sourceRoots, pathNot: uiSdkWorkspaces },
      to: { path: uiSdkPackages },
    },
    {
      name: "no-ui-sdk-internals",
      comment:
        "ui-sdk is pre-1.0: import only the entry points its packages export, never internal, dist or src paths.",
      severity: "error",
      from: {},
      to: {
        path: [
          "^@ui-sdk/[^/]+/(?:internal|dist|src)(?:/|$)",
          "(?:^|/)node_modules/@ui-sdk/[^/]+/(?:dist/)?(?:internal|src)/",
        ],
      },
    },
    {
      name: "no-ui-sdk-date-entries",
      comment:
        "The packages never import ui-sdk's date entries (date, calendar, timeline, date-picker, date-input, time-input): the domain is the engine's.",
      severity: "error",
      from: { path: "(?:^|/)packages/" },
      // Specifiers as written, and the files they resolve to: core's under `components/` and
      // `foundation/`, the renderers' at the top of `dist`, or Solid's under `dist/solid/`.
      to: {
        path: [
          `^@ui-sdk/[^/]+/(?:${uiSdkDateEntries})$`,
          // Without a quantified group around `[^/]+`, which the cruiser refuses as unsafe.
          `(?:^|/)node_modules/@ui-sdk/[^/]+/dist/(?:solid/|components/[^/]+/|foundation/[^/]+/|)(?:${uiSdkDateEntries})\\.(?:d\\.ts|jsx?|mjs)$`,
        ],
      },
    },
    {
      name: "engine-has-no-ui-runtime-imports",
      comment:
        "Temporal, core, and ICS stay independent from React, Jotai, dnd-kit, DOM helpers, and CSS.",
      severity: "error",
      from: {
        path: "(?:^|/)packages/(?:calendar-core|calendar-temporal|ics)/src(?:/|$)",
      },
      to: {
        path: ["^(?:react(?:-dom)?|jotai|@dnd-kit/)", "\\.(?:css|less|sass|scss)$"],
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // The workspaces' build output isn't source, and other tests rebuild it while this one reads.
    // Links into other packages' `dist` in node_modules still count.
    exclude: {
      path: "^(?:(?:apps|packages|tools)/[^/]+|benchmarks|registry)/(?:dist|\\.next|\\.source)/",
    },
    tsPreCompilationDeps: true,
  },
} satisfies IConfiguration;

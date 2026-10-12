import type { IConfiguration, IForbiddenRuleType } from "dependency-cruiser";

const packageNames = [
  "calendar",
  "calendar-core",
  "calendar-dnd",
  "calendar-react",
  "calendar-recurrence",
  "calendar-temporal",
  "calendar-testing",
  "ics",
] as const;

const packageSourcePath = (packageName: string) => `(?:^|/)packages/${packageName}/src(?:/|$)`;

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
      from: { path: "(?:^|/)registry/", pathNot: "(?:^|/)tools/registry/" },
      to: {
        path: ["^@moltenship/", "(?:^|/)(?:apps|benchmarks|packages|tools)/"],
        pathNot: "^@moltenship/calendar$",
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
    tsPreCompilationDeps: true,
  },
} satisfies IConfiguration;

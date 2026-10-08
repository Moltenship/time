import type { IConfiguration, IForbiddenRuleType } from "dependency-cruiser";

const packageNames = [
  "calendar",
  "calendar-core",
  "calendar-dnd",
  "calendar-react",
  "calendar-recurrence",
  "calendar-temporal",
  "calendar-testing",
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
      name: "registry-source-uses-public-calendar-api",
      comment:
        "Copied registry source depends only on public calendar packages and its declared UI deps. @moltenship/calendar-temporal folds into the facade with #70.",
      severity: "error",
      from: { path: "(?:^|/)registry/", pathNot: "(?:^|/)tools/registry/" },
      to: {
        path: ["^@moltenship/", "(?:^|/)(?:apps|benchmarks|packages|tools)/"],
        pathNot: "^@moltenship/calendar(?:-temporal)?$",
      },
    },
    {
      name: "engine-has-no-ui-runtime-imports",
      comment:
        "Temporal and core stay independent from React, Jotai, dnd-kit, DOM helpers, and CSS.",
      severity: "error",
      from: {
        path: "(?:^|/)packages/calendar-(?:core|temporal)/src(?:/|$)",
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

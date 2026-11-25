export type DemoFramework = "react" | "solid";

/**
 * The demo's pages for each framework. This app is built at `/solid/` of the React demo's
 * deployment (apps/demo/vite.config.ts); React leads back to its Tailwind page, at `/`.
 */
const frameworkPaths: Readonly<Record<DemoFramework, string>> = { react: "/", solid: "/solid/" };

export const demoFrameworks: readonly { readonly label: string; readonly value: DemoFramework }[] =
  [
    { label: "React", value: "react" },
    { label: "Solid", value: "solid" },
  ];

/** The framework's page, keeping this one's search string, so `?view=&date=` carries over. */
export function frameworkHref(
  framework: DemoFramework,
  search: string = window.location.search,
): string {
  return `${frameworkPaths[framework]}${search}`;
}

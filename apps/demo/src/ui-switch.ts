export type DemoUi = "tailwind" | "stylex";

/** The two pages of the demo, which load different global CSS. */
const uiPaths: Readonly<Record<DemoUi, string>> = { stylex: "/stylex/", tailwind: "/" };

export const demoUis: readonly { readonly label: string; readonly value: DemoUi }[] = [
  { label: "Tailwind", value: "tailwind" },
  { label: "StyleX", value: "stylex" },
];

/**
 * The other page's address, keeping this one's search string, so `?view=&date=` carries over. It's
 * read at the moment of the switch: the page mirrors the view and date into its URL after a render.
 */
export function uiHref(ui: DemoUi, search: string = window.location.search): string {
  return `${uiPaths[ui]}${search}`;
}

export type DemoFramework = "react" | "solid";

/**
 * The frameworks the calendar renders with. Solid is `apps/demo-solid`, a separate app the demo's
 * build puts at `/solid/` (vite.config.ts). It reads the same `?view=&date=`, and its way back
 * leads to the Tailwind page.
 */
const frameworkPaths: Readonly<Record<DemoFramework, string>> = { react: "/", solid: "/solid/" };

export const demoFrameworks: readonly { readonly label: string; readonly value: DemoFramework }[] =
  [
    { label: "React", value: "react" },
    { label: "Solid", value: "solid" },
  ];

/** The framework's page, keeping the search string as `uiHref` does. */
export function frameworkHref(
  framework: DemoFramework,
  search: string = window.location.search,
): string {
  return `${frameworkPaths[framework]}${search}`;
}

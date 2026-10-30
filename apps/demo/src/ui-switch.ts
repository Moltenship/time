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

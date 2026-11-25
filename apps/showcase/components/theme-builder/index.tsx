import { readFile } from "node:fs/promises";
import path from "node:path";

import ThemeBuilderClient from "./builder";
import { parseTheme } from "./theme";

// The docs build and run from `apps/showcase`.
const themeFile = path.join(
  process.cwd(),
  "../../registry/shared/calendar-theme/calendar-theme.css",
);

export interface ThemeBuilderProps {
  /**
   * Whether the builder offers the theme as StyleX too. Solid's docs turn it off: the Solid
   * registry has the Tailwind files alone.
   */
  readonly stylex?: boolean;
}

/**
 * The theme builder, over the tokens and values of the registry's `calendar-theme.css`, read as
 * the page renders, so the builder never lists a token the file doesn't have.
 */
export async function ThemeBuilder({ stylex = true }: ThemeBuilderProps) {
  const source = parseTheme(await readFile(themeFile, "utf8"));
  return <ThemeBuilderClient source={source} stylex={stylex} />;
}

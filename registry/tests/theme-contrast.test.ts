import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vite-plus/test";

import { calendarEventColors } from "../calendar-theme/event-colors";
import { composite, contrast, ThemeTokens } from "./theme-colors";

const css = await readFile(
  new URL("../calendar-theme/calendar-theme.css", import.meta.url),
  "utf8",
);

/** WCAG 2.2 AA: 4.5:1 for normal text, 3:1 for graphics and focus indicators. */
const TEXT = 4.5;
const GRAPHIC = 3;
/** The surfaces a calendar sits on. */
const surfaces = ["--background", "--card"] as const;

describe.each(["light", "dark"] as const)("%s theme", (theme) => {
  const tokens = new ThemeTokens(css, theme);

  test.each([undefined, ...calendarEventColors])("event text on %s events", (color) => {
    const event = new ThemeTokens(css, theme, color);

    expect(
      contrast(event.color("--calendar-event-foreground"), event.color("--calendar-event")),
    ).toBeGreaterThanOrEqual(TEXT);
  });

  test("today marker", () => {
    expect(
      contrast(tokens.color("--calendar-today-foreground"), tokens.color("--calendar-today")),
    ).toBeGreaterThanOrEqual(TEXT);
    for (const surface of surfaces) {
      const band = tokens.paint("--calendar-selection", surface);
      // Weekday labels on today's column, and the mini month's selected date in its range band.
      expect(
        contrast(tokens.color("--calendar-today"), tokens.color(surface)),
      ).toBeGreaterThanOrEqual(TEXT);
      expect(contrast(tokens.color("--calendar-today"), band)).toBeGreaterThanOrEqual(TEXT);
    }
  });

  test.each(surfaces)("dates on closed days on %s", (surface) => {
    // A closed day mutes its cell; its date, and an out-of-month date, stay readable on it.
    const closed = tokens.paint("--calendar-closed", surface);
    for (const text of ["--foreground", "--muted-foreground"]) {
      expect(contrast(tokens.color(text), closed)).toBeGreaterThanOrEqual(TEXT);
    }
  });

  test.each(surfaces)("invalid and warning marks on %s", (surface) => {
    for (const mark of ["--calendar-invalid", "--calendar-warning"]) {
      expect(contrast(tokens.color(mark), tokens.color(surface))).toBeGreaterThanOrEqual(GRAPHIC);
    }
  });

  test.each(surfaces)("now-line on %s", (surface) => {
    expect(contrast(tokens.color("--calendar-now"), tokens.color(surface))).toBeGreaterThanOrEqual(
      GRAPHIC,
    );
  });

  test.each(surfaces)("focus ring on %s", (surface) => {
    // Views outline focus in `outline-ring`; shadcn controls, such as the toolbar's buttons, draw
    // a `ring-ring/50` halo.
    const [red, green, blue] = tokens.color("--ring");
    const halo = composite([red, green, blue, 0.5], tokens.color(surface));

    expect(contrast(tokens.color("--ring"), tokens.color(surface))).toBeGreaterThanOrEqual(GRAPHIC);
    expect(contrast(halo, tokens.color(surface))).toBeGreaterThanOrEqual(GRAPHIC);
  });
});

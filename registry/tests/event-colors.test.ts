import { readFile } from "node:fs/promises";

import { expect, test } from "vite-plus/test";

import { calendarEventColors } from "../calendar-theme/event-colors";

test("every event colour has exactly one data-color rule in the theme", async () => {
  const css = await readFile(
    new URL("../calendar-theme/calendar-theme.css", import.meta.url),
    "utf8",
  );
  const styled = [...css.matchAll(/\[data-color="([a-z]+)"\]/g)].map(([, color]) => color);

  expect(styled).toEqual([...calendarEventColors]);
});

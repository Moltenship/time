import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createCalendar, defineEventAdapter } from "@moltenship/calendar";
import { describe, expect, test } from "vite-plus/test";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const anatomyRoot = fileURLToPath(new URL("../components/anatomy", import.meta.url));

async function readSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
      .map((entry) => readFile(join(entry.parentPath, entry.name), "utf8")),
  );
}

interface Meeting {
  readonly id: string;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
}

/** Only its keys matter: they are the `Calendar.*` parts a diagram may name. */
const Calendar = createCalendar<Meeting>()({
  eventAdapter: defineEventAdapter<Meeting>()({
    getId: (meeting) => meeting.id,
    getInterval: (meeting) => ({ kind: "timed", start: meeting.start, end: meeting.end }),
    getResourceIds: () => [],
    getTitle: (meeting) => meeting.id,
  }),
});

/** The callout `name`s an anatomy's source declares. */
async function partNames(file: string): Promise<string[]> {
  const source = await readFile(join(anatomyRoot, file), "utf8");
  return [...source.matchAll(/\bname: (?:"([^"]*)"|'([^']*)')/g)].map(
    ([, double, single]) => double ?? single!,
  );
}

describe("anatomy diagrams", () => {
  test.each([
    "calendar-anatomy.tsx",
    "month-anatomy.tsx",
    "time-grid-anatomy.tsx",
    "agenda-anatomy.tsx",
    "resource-columns-anatomy.tsx",
    "resource-timeline-anatomy.tsx",
  ])("%s names parts that exist in the code", async (file) => {
    const sources = (
      await Promise.all(
        ["registry", "packages/calendar-react/src"].map((directory) =>
          readSources(join(repositoryRoot, directory)),
        ),
      )
    ).flat();
    const names = await partNames(file);

    expect(names.length).toBeGreaterThan(3);
    for (const name of names) {
      if (name.startsWith("Calendar.")) {
        expect(Calendar, name).toHaveProperty(name.slice("Calendar.".length));
        continue;
      }
      // `aria-current="date"` is written as `aria-current={… ? "date" : …}`, so match the parts.
      const [attribute, value] = name.split("=");
      const found = sources.some(
        (source) => source.includes(attribute!) && (value === undefined || source.includes(value)),
      );
      expect(found, name).toBe(true);
    }
  });
});

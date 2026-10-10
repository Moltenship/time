import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createCalendar, defineEventAdapter } from "@moltenship/calendar";
import { describe, expect, test } from "vite-plus/test";

import { calloutViewBox, placeCallouts, type AnatomyCallout } from "../components/anatomy/layout";

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

describe("callout layout", () => {
  const left: AnatomyCallout = {
    label: "Day cell",
    name: "data-date",
    anchor: [10, 40],
    side: "left",
  };

  test("puts side labels beside the figure, level with the part", () => {
    const [placed] = placeCallouts(200, 100, [left], "text");

    expect(placed!.text).toEqual({ x: -16, y: 40, anchor: "end" });
    expect(placed!.line).toEqual([-12, 40, 10, 40]);
    expect(placed!.box.x + placed!.box.width).toBe(-16);
  });

  test("stacks top labels by row and runs them from the line", () => {
    const callout: AnatomyCallout = {
      label: "Next",
      anchor: [50, 10],
      side: "top",
      align: "start",
    };
    const [first, second] = placeCallouts(200, 100, [callout, { ...callout, row: 1 }], "text");

    expect(first!.text.anchor).toBe("start");
    expect(first!.box.x).toBe(50);
    expect(second!.box.y).toBe(first!.box.y - 38);
    expect(second!.line.slice(2)).toEqual([50, 10]);
  });

  test("draws a bracket along the side for a span", () => {
    const [placed] = placeCallouts(
      200,
      100,
      [{ label: "Week row", anchor: [200, 50], side: "right", span: 40 }],
      "text",
    );

    expect(placed!.bracket).toBe("M202,30 H206 V70 H202");
    expect(placed!.line.slice(2)).toEqual([206, 50]);
  });

  test("centers badges on their line whatever the label alignment", () => {
    const [placed] = placeCallouts(
      200,
      100,
      [{ label: "Previous", anchor: [50, 10], side: "top", align: "end" }],
      "badges",
    );

    expect(placed!.box.x + placed!.box.width / 2).toBe(50);
  });

  test("fits the view box around the figure and every label", () => {
    const placed = placeCallouts(200, 100, [left], "text");
    const box = calloutViewBox(200, 100, placed);

    expect(box.x).toBeLessThan(placed[0]!.box.x);
    expect(box.x + box.width).toBeGreaterThan(200);
    expect(box.y + box.height).toBeGreaterThan(100);
  });
});

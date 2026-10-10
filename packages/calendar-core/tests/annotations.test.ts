import { describe, expect, test } from "vite-plus/test";

import {
  createAnnotationSnapshot,
  projectTimeGridAnnotations,
  summarizeAnnotationMarks,
  timedFragmentBox,
  timeGridColumns,
  type CalendarAnnotation,
  type CalendarAnnotationSource,
} from "../src/index";
import { instantInterval } from "@moltenship/calendar-temporal";
import { dates } from "./view-fixtures";

const MINUTE = 1 / (24 * 60);

function annotation(
  id: string,
  sourceId: string,
  start: string,
  end: string,
): CalendarAnnotation<null, string> {
  return {
    end: Temporal.Instant.from(end),
    id,
    sourceId,
    start: Temporal.Instant.from(start),
    title: id,
  };
}

const music: CalendarAnnotationSource = {
  id: "music",
  label: "Music",
  mergeGap: Temporal.Duration.from({ minutes: 5 }),
};
const sleep: CalendarAnnotationSource = { id: "sleep", label: "Sleep" };
const focus: CalendarAnnotationSource = { id: "focus", label: "Focus" };

/** Two UTC days, so fractions are plain minutes of the day. */
const columns = timeGridColumns(dates("2026-10-05", "2026-10-07"), "UTC");

function ids(marks: readonly { readonly annotations: readonly { readonly id: unknown }[] }[]) {
  return marks.map((mark) => mark.annotations.map(({ id }) => id));
}

describe("annotation snapshot", () => {
  test("queries half-open intervals in input order", () => {
    const snapshot = createAnnotationSnapshot([
      annotation("b", "music", "2026-10-05T10:00Z", "2026-10-05T11:00Z"),
      annotation("a", "music", "2026-10-05T09:00Z", "2026-10-05T10:00Z"),
    ]);

    expect(
      snapshot
        .query(
          Temporal.Instant.from("2026-10-05T09:30Z"),
          Temporal.Instant.from("2026-10-05T12:00Z"),
        )
        .map(({ id }) => id),
    ).toEqual(["b", "a"]);
    expect(
      snapshot
        .query(
          Temporal.Instant.from("2026-10-05T10:00Z"),
          Temporal.Instant.from("2026-10-05T12:00Z"),
        )
        .map(({ id }) => id),
    ).toEqual(["b"]);
    expect(snapshot.get("a")?.title).toBe("a");
  });

  test("skips invalid annotations and repeated IDs, and reports them", () => {
    const valid = annotation("ok", "music", "2026-10-05T09:00Z", "2026-10-05T10:00Z");
    const snapshot = createAnnotationSnapshot([
      valid,
      { ...valid, id: "" },
      { ...valid, id: "empty", start: valid.end },
      { ...valid, id: "untyped", start: "2026-10-05T09:00Z" as unknown as Temporal.Instant },
      { ...valid, id: "no-source", sourceId: "" },
      { ...valid, title: "copy" },
    ]);

    expect(snapshot.annotations.map(({ id }) => id)).toEqual(["ok"]);
    expect(snapshot.issues.map(({ code, index }) => [code, index])).toEqual([
      ["invalid-annotation-id", 1],
      ["start-not-before-end", 2],
      ["invalid-annotation", 3],
      ["invalid-annotation", 4],
      ["duplicate-annotation-id", 5],
    ]);
  });
});

describe("time-grid annotation projection", () => {
  test("splits an annotation across midnight and marks the cut ends", () => {
    const snapshot = createAnnotationSnapshot([
      annotation("night", "sleep", "2026-10-05T23:00Z", "2026-10-06T07:00Z"),
    ]);
    const [monday, tuesday] = projectTimeGridAnnotations(columns, snapshot, [sleep]);

    expect(monday).toMatchObject([
      {
        endsAfterDay: true,
        height: expect.closeTo(1 / 24),
        startsBeforeDay: false,
        top: expect.closeTo(23 / 24),
      },
    ]);
    expect(tuesday).toMatchObject([
      { endsAfterDay: false, height: expect.closeTo(7 / 24), startsBeforeDay: true, top: 0 },
    ]);
    expect(tuesday![0]!.start.toString()).toBe("2026-10-06T00:00:00Z");
  });

  test("merges a source's items closer than its merge gap, never across sources", () => {
    const snapshot = createAnnotationSnapshot([
      annotation("t1", "music", "2026-10-05T09:00Z", "2026-10-05T09:04Z"),
      annotation("t2", "music", "2026-10-05T09:05Z", "2026-10-05T09:09Z"),
      annotation("t3", "music", "2026-10-05T09:14Z", "2026-10-05T09:18Z"),
      annotation("t4", "music", "2026-10-05T09:40Z", "2026-10-05T09:44Z"),
      annotation("f1", "focus", "2026-10-05T09:05Z", "2026-10-05T09:30Z"),
    ]);
    const [monday] = projectTimeGridAnnotations(columns, snapshot, [music, focus]);

    expect(ids(monday!)).toEqual([["t1", "t2", "t3"], ["t4"], ["f1"]]);
    expect(monday![0]).toMatchObject({ key: "music:t1", top: expect.closeTo(9 / 24) });
    expect(monday![0]!.end.toString()).toBe("2026-10-05T09:18:00Z");
  });

  test("merges marks whose drawn size would touch, and draws short ones as dots", () => {
    const snapshot = createAnnotationSnapshot([
      annotation("a", "sleep", "2026-10-05T09:00Z", "2026-10-05T09:05Z"),
      annotation("b", "sleep", "2026-10-05T09:15Z", "2026-10-05T09:20Z"),
      annotation("c", "sleep", "2026-10-05T10:00Z", "2026-10-05T10:05Z"),
    ]);

    const loose = projectTimeGridAnnotations(columns, snapshot, [sleep])[0]!;
    expect(ids(loose)).toEqual([["a"], ["b"], ["c"]]);
    expect(loose.map(({ kind }) => kind)).toEqual(["bar", "bar", "bar"]);

    const drawn = projectTimeGridAnnotations(columns, snapshot, [sleep], {
      minGap: 2 * MINUTE,
      minHeight: 15 * MINUTE,
    })[0]!;
    expect(ids(drawn)).toEqual([["a", "b"], ["c"]]);
    // The merged mark runs 20 minutes, so only the lone five-minute one is a dot.
    expect(drawn.map(({ kind }) => kind)).toEqual(["bar", "dot"]);
  });

  test("packs overlapping sources into rail lanes by drawn size", () => {
    const snapshot = createAnnotationSnapshot([
      annotation("m", "music", "2026-10-05T09:00Z", "2026-10-05T11:00Z"),
      annotation("f", "focus", "2026-10-05T10:00Z", "2026-10-05T10:30Z"),
      annotation("s", "sleep", "2026-10-05T10:15Z", "2026-10-05T10:20Z"),
      annotation("late", "focus", "2026-10-05T15:00Z", "2026-10-05T16:00Z"),
    ]);
    const place = (geometry: Parameters<typeof projectTimeGridAnnotations>[3]) =>
      projectTimeGridAnnotations(columns, snapshot, [music, focus, sleep], geometry)[0]!.map(
        ({ key, lane, lanes }) => [key, lane, lanes],
      );

    expect(place({})).toEqual([
      ["music:m", 0, 3],
      ["focus:f", 1, 3],
      ["focus:late", 0, 1],
      ["sleep:s", 2, 3],
    ]);
    expect(place({ maxLanes: 2 })).toEqual([
      ["music:m", 0, 2],
      ["focus:f", 1, 2],
      ["focus:late", 0, 1],
      ["sleep:s", 1, 2],
    ]);
    expect(place({ layout: "per-source" })).toEqual([
      ["music:m", 0, 3],
      ["focus:f", 1, 3],
      ["focus:late", 1, 3],
      ["sleep:s", 2, 3],
    ]);
  });

  test("leaves out annotations of sources it is not given", () => {
    const snapshot = createAnnotationSnapshot([
      annotation("m", "music", "2026-10-05T09:00Z", "2026-10-05T10:00Z"),
      annotation("x", "unknown", "2026-10-05T09:00Z", "2026-10-05T10:00Z"),
    ]);

    expect(ids(projectTimeGridAnnotations(columns, snapshot, [music])[0]!)).toEqual([["m"]]);
    expect(projectTimeGridAnnotations(columns, snapshot, [])[0]).toEqual([]);
  });

  test("places marks on a DST day with the column's wall-clock geometry", () => {
    const [fallBack] = timeGridColumns(dates("2026-11-01", "2026-11-02"), "America/New_York");
    const start = Temporal.Instant.from("2026-11-01T05:30Z");
    const end = Temporal.Instant.from("2026-11-01T07:30Z");
    const snapshot = createAnnotationSnapshot([
      annotation("fold", "sleep", start.toString(), end.toString()),
    ]);
    const [marks] = projectTimeGridAnnotations([fallBack!], snapshot, [sleep]);

    expect(marks![0]).toMatchObject(timedFragmentBox(fallBack!, instantInterval(start, end)));
  });
});

describe("annotation summaries", () => {
  test("summarizes each source's marks on a day in source order", () => {
    const snapshot = createAnnotationSnapshot([
      annotation("night", "sleep", "2026-10-04T23:00Z", "2026-10-05T07:00Z"),
      annotation("t1", "music", "2026-10-05T09:00Z", "2026-10-05T09:40Z"),
      annotation("t2", "music", "2026-10-05T18:00Z", "2026-10-05T19:30Z"),
    ]);
    const [monday] = projectTimeGridAnnotations(columns, snapshot, [sleep, music]);
    const summaries = summarizeAnnotationMarks(monday!);

    expect(
      summaries.map(({ count, duration, source, startsBeforeDay }) => [
        source.id,
        count,
        duration.toString(),
        startsBeforeDay,
      ]),
    ).toEqual([
      ["sleep", 1, "PT7H", true],
      ["music", 2, "PT2H10M", false],
    ]);
    expect(summaries[1]!.end.toString()).toBe("2026-10-05T19:30:00Z");
  });
});

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
    expect(monday![0]).toMatchObject({ key: '["music","t1"]', top: expect.closeTo(9 / 24) });
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
      ['["music","m"]', 0, 3],
      ['["focus","f"]', 1, 3],
      ['["focus","late"]', 0, 1],
      ['["sleep","s"]', 2, 3],
    ]);
    expect(place({ maxLanes: 2 })).toEqual([
      ['["music","m"]', 0, 2],
      ['["focus","f"]', 1, 2],
      ['["focus","late"]', 0, 1],
      ['["sleep","s"]', 1, 2],
    ]);
    expect(place({ layout: "per-source" })).toEqual([
      ['["music","m"]', 0, 3],
      ['["focus","f"]', 1, 3],
      ['["focus","late"]', 1, 3],
      ['["sleep","s"]', 2, 3],
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

describe("time-grid annotation edge cases", () => {
  test("keys keep numeric and string IDs and source boundaries apart", () => {
    const snapshot = createAnnotationSnapshot([
      // Overlapping marks of two sources whose "source:id" strings would both read "a:b:c".
      annotation("c", "a:b", "2026-10-05T09:00Z", "2026-10-05T10:00Z"),
      annotation("b:c", "a", "2026-10-05T09:30Z", "2026-10-05T10:30Z"),
      // Hours apart, so they don't merge: the IDs 1 and "1".
      { ...annotation("1", "s", "2026-10-05T12:00Z", "2026-10-05T12:30Z"), id: 1 },
      annotation("1", "s", "2026-10-05T15:00Z", "2026-10-05T15:30Z"),
    ]);
    const sources = [
      { id: "a:b", label: "AB" },
      { id: "a", label: "A" },
      { id: "s", label: "S" },
    ];
    const [monday] = projectTimeGridAnnotations(columns, snapshot, sources);

    expect(new Set(monday!.map(({ key }) => key)).size).toBe(4);
    expect(monday!.slice(0, 2).map(({ lane, lanes }) => [lane, lanes])).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });

  test("merges by drawn position on a fall-back day only when marks touch", () => {
    const [fallBack] = timeGridColumns(dates("2026-11-01", "2026-11-02"), "America/New_York");
    // 01:50–01:55 EDT, then 01:10–01:15 EST: later in time, drawn earlier.
    const apart = createAnnotationSnapshot([
      annotation("first", "sleep", "2026-11-01T05:50Z", "2026-11-01T05:55Z"),
      annotation("second", "sleep", "2026-11-01T06:10Z", "2026-11-01T06:15Z"),
    ]);
    expect(ids(projectTimeGridAnnotations([fallBack!], apart, [sleep])[0]!)).toEqual([
      ["first"],
      ["second"],
    ]);

    // 01:05 EDT and 01:10 EST draw on top of each other: they merge, and nothing of one source
    // overlaps afterwards.
    const overlapping = createAnnotationSnapshot([
      annotation("early", "sleep", "2026-11-01T05:05Z", "2026-11-01T05:15Z"),
      annotation("repeat", "sleep", "2026-11-01T06:10Z", "2026-11-01T06:20Z"),
      annotation("apart", "sleep", "2026-11-01T05:40Z", "2026-11-01T05:45Z"),
    ]);
    const marks = projectTimeGridAnnotations([fallBack!], overlapping, [sleep])[0]!;
    const sorted = marks.toSorted((left, right) => left.top - right.top);
    for (let index = 1; index < sorted.length; index++) {
      expect(sorted[index]!.top).toBeGreaterThan(
        sorted[index - 1]!.top + sorted[index - 1]!.height,
      );
    }
    expect(
      marks
        .flatMap((mark) => mark.annotations.map(({ id }) => String(id)))
        .toSorted((left, right) => left.localeCompare(right)),
    ).toEqual(["apart", "early", "repeat"]);
  });

  test("accepts merge gaps in calendar units", () => {
    const weekly = { id: "music", label: "Music", mergeGap: Temporal.Duration.from({ weeks: 1 }) };
    const snapshot = createAnnotationSnapshot([
      annotation("a", "music", "2026-10-05T09:00Z", "2026-10-05T09:05Z"),
      annotation("b", "music", "2026-10-05T20:00Z", "2026-10-05T20:05Z"),
    ]);

    expect(ids(projectTimeGridAnnotations(columns, snapshot, [weekly])[0]!)).toEqual([["a", "b"]]);
    expect(projectTimeGridAnnotations(columns, createAnnotationSnapshot([]), [weekly])[0]).toEqual(
      [],
    );
  });

  test("measures marks at the day's end where they draw, up from midnight", () => {
    // A quarter-hour minimum: a dot at 23:59 draws over 23:45–24:00, onto one at 23:40.
    const geometry = { minHeight: 15 * MINUTE };
    const snapshot = createAnnotationSnapshot([
      annotation("a", "sleep", "2026-10-05T23:40Z", "2026-10-05T23:41Z"),
      annotation("b", "sleep", "2026-10-05T23:59Z", "2026-10-05T23:59:30Z"),
      annotation("c", "focus", "2026-10-05T23:59Z", "2026-10-05T23:59:30Z"),
    ]);
    const [monday] = projectTimeGridAnnotations(columns, snapshot, [sleep, focus], geometry);

    expect(ids(monday!)).toEqual([["a", "b"], ["c"]]);
    // Its true time stays in `top`; only the drawn extent moves, and lanes see it overlap.
    expect(monday![1]!.top).toBeCloseTo((23 * 60 + 59) * MINUTE);
    expect(monday!.map(({ lane, lanes }) => [lane, lanes])).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });

  test("lets marks that meet exactly share a lane", () => {
    const snapshot = createAnnotationSnapshot([
      annotation("m", "music", "2026-10-05T00:01Z", "2026-10-05T00:05Z"),
      annotation("s", "sleep", "2026-10-05T00:05Z", "2026-10-05T00:06Z"),
    ]);
    const [monday] = projectTimeGridAnnotations(columns, snapshot, [music, sleep]);

    expect(monday!.map(({ lane, lanes }) => [lane, lanes])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  test("keeps lanes whole and at least one", () => {
    const snapshot = createAnnotationSnapshot([
      annotation("m", "music", "2026-10-05T09:00Z", "2026-10-05T11:00Z"),
      annotation("s", "sleep", "2026-10-05T10:00Z", "2026-10-05T10:30Z"),
    ]);
    for (const maxLanes of [0, 1.5, Number.NaN]) {
      const marks = projectTimeGridAnnotations(columns, snapshot, [music, sleep], { maxLanes })[0]!;
      for (const { lane, lanes } of marks) {
        expect(Number.isInteger(lane) && lane >= 0 && Number.isInteger(lanes) && lanes >= 1).toBe(
          true,
        );
      }
    }
  });

  test("merges contained and equal-start items, and keeps per-source lanes for sources without marks", () => {
    const snapshot = createAnnotationSnapshot([
      annotation("outer", "music", "2026-10-05T09:00Z", "2026-10-05T11:00Z"),
      annotation("inner", "music", "2026-10-05T09:30Z", "2026-10-05T10:00Z"),
      annotation("twin", "music", "2026-10-05T09:00Z", "2026-10-05T09:10Z"),
    ]);
    const [monday] = projectTimeGridAnnotations(columns, snapshot, [sleep, focus, music], {
      layout: "per-source",
    });

    expect(ids(monday!)).toEqual([["twin", "outer", "inner"]]);
    expect(monday![0]!.end.toString()).toBe("2026-10-05T11:00:00Z");
    expect(monday![0]).toMatchObject({ lane: 2, lanes: 3 });
  });

  test("skips a day removed by a date-line change and clips around a spring-forward gap", () => {
    // Samoa skipped 2011-12-30.
    const samoa = timeGridColumns(dates("2011-12-29", "2011-12-31"), "Pacific/Apia");
    const skipped = createAnnotationSnapshot([
      annotation("across", "sleep", "2011-12-29T08:00Z", "2011-12-30T12:00Z"),
    ]);
    expect(projectTimeGridAnnotations(samoa, skipped, [sleep])[1]).toEqual([]);

    const [springForward] = timeGridColumns(dates("2026-03-08", "2026-03-09"), "America/New_York");
    const start = Temporal.Instant.from("2026-03-08T06:30Z");
    const end = Temporal.Instant.from("2026-03-08T07:30Z");
    const gap = createAnnotationSnapshot([
      annotation("gap", "sleep", start.toString(), end.toString()),
    ]);
    expect(projectTimeGridAnnotations([springForward!], gap, [sleep])[0]![0]).toMatchObject(
      timedFragmentBox(springForward!, instantInterval(start, end)),
    );
  });
});

describe("time-grid annotation folds and scale", () => {
  // St. John's fell back at 00:01 on 2010-11-07, to 23:01 on the 6th: the fold crosses midnight.
  const stJohns = timeGridColumns(dates("2010-11-06", "2010-11-08"), "America/St_Johns");

  test("puts repeated time on the date its wall clock reads", () => {
    // 23:10–23:30 on the 6th, after the clocks went back: instants that the 7th's span holds.
    const snapshot = createAnnotationSnapshot([
      annotation("repeat", "sleep", "2010-11-07T02:40Z", "2010-11-07T03:00Z"),
    ]);
    const [saturday, sunday] = projectTimeGridAnnotations(stJohns, snapshot, [sleep]);

    expect(sunday).toEqual([]);
    expect(saturday![0]).toMatchObject({
      end: Temporal.Instant.from("2010-11-07T03:00Z"),
      endsAfterDay: false,
      start: Temporal.Instant.from("2010-11-07T02:40Z"),
      startsBeforeDay: false,
    });
    expect(saturday![0]!.top).toBeCloseTo((23 * 60 + 10) * MINUTE);
    expect(saturday![0]!.height).toBeCloseTo(20 * MINUTE);
  });

  test("splits an annotation across a fold at midnight like an event", () => {
    // 23:50 on the 6th to 00:01 on the 7th, then 23:01–23:15 on the 6th again.
    const start = Temporal.Instant.from("2010-11-07T02:20Z");
    const end = Temporal.Instant.from("2010-11-07T02:45Z");
    const snapshot = createAnnotationSnapshot([
      annotation("across", "sleep", start.toString(), end.toString()),
    ]);
    const [saturday, sunday] = projectTimeGridAnnotations(stJohns, snapshot, [sleep]);

    expect(saturday![0]).toMatchObject({
      ...timedFragmentBox(stJohns[0]!, instantInterval(start, end)),
      end,
      endsAfterDay: true,
      start,
      startsBeforeDay: false,
    });
    expect(sunday![0]).toMatchObject({
      ...timedFragmentBox(stJohns[1]!, instantInterval(start, end)),
      end: Temporal.Instant.from("2010-11-07T02:31Z"),
      endsAfterDay: false,
      start: Temporal.Instant.from("2010-11-07T02:30Z"),
      startsBeforeDay: true,
    });
  });

  test("merges many items in linear time", () => {
    // Back to back, 4 seconds each: one mark.
    const day = Temporal.Instant.from("2026-10-05T00:00Z");
    const many = Array.from({ length: 20_000 }, (_, index) =>
      annotation(
        `m${index}`,
        "sleep",
        day.add({ seconds: index * 4 }).toString(),
        day.add({ seconds: index * 4 + 4 }).toString(),
      ),
    );
    const [monday] = projectTimeGridAnnotations(columns, createAnnotationSnapshot(many), [sleep]);
    expect(ids(monday!)).toEqual([many.map(({ id }) => id)]);

    // On a fall-back day, items a second apart in each 1 o'clock hour only touch in drawn order.
    const [fallBack] = timeGridColumns(dates("2026-11-01", "2026-11-02"), "America/New_York");
    const first = Temporal.Instant.from("2026-11-01T05:00Z");
    const second = Temporal.Instant.from("2026-11-01T06:00:01Z");
    const interleaved = Array.from({ length: 3000 }, (_, index) => {
      const from = (index % 2 === 0 ? first : second).add({ seconds: index - (index % 2) });
      return annotation(`f${index}`, "sleep", from.toString(), from.add({ seconds: 1 }).toString());
    });
    const [marks] = projectTimeGridAnnotations([fallBack!], createAnnotationSnapshot(interleaved), [
      sleep,
    ]);
    expect(marks).toHaveLength(1);
    expect(marks![0]!.annotations).toHaveLength(3000);
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

  test("rounds the summed duration, not each mark's", () => {
    const quick = { id: "quick", label: "Quick" };
    const snapshot = createAnnotationSnapshot(
      [0, 10, 20, 30].map((minute) =>
        annotation(
          `q${minute}`,
          "quick",
          `2026-10-05T09:${String(minute).padStart(2, "0")}:00Z`,
          `2026-10-05T09:${String(minute).padStart(2, "0")}:40Z`,
        ),
      ),
    );
    const [monday] = projectTimeGridAnnotations(columns, snapshot, [quick]);

    // Four 40-second marks are 160 seconds: three minutes, where rounding each would give four.
    expect(summarizeAnnotationMarks(monday!)[0]!.duration.toString()).toBe("PT3M");
  });

  test("adds durations up exactly before rounding", () => {
    // 3,000 merged pairs across a repeated hour, each spanning an hour, and one 1 ns short: just
    // under 3,000 hours and 30 seconds, which a double rounds up to the next minute.
    const [fallBack] = timeGridColumns(dates("2026-11-01", "2026-11-02"), "America/New_York");
    const items = Array.from({ length: 3000 }, (_, index) =>
      [0, 1].map((hour) => {
        const start = Temporal.Instant.from("2026-11-01T05:00Z").add({
          hours: hour,
          seconds: index,
        });
        const end = start.add({ nanoseconds: index === 2999 ? 9_999_999 : 10_000_000 });
        return annotation(`${hour}-${index}`, "sleep", start.toString(), end.toString());
      }),
    ).flat();
    const [marks] = projectTimeGridAnnotations([fallBack!], createAnnotationSnapshot(items), [
      sleep,
    ]);

    expect(marks).toHaveLength(3000);
    expect(summarizeAnnotationMarks(marks!)[0]!.duration.toString()).toBe("PT3000H");
  });

  test("counts only each date's own time in a fold across midnight", () => {
    // 23:50 on the 6th to 00:01 on the 7th, then 23:01–23:15 on the 6th again: 24 minutes on the
    // 6th and one on the 7th, though the 6th's mark spans 25 minutes of instants.
    const stJohns = timeGridColumns(dates("2010-11-06", "2010-11-08"), "America/St_Johns");
    const snapshot = createAnnotationSnapshot([
      annotation("across", "sleep", "2010-11-07T02:20Z", "2010-11-07T02:45Z"),
    ]);
    const days = projectTimeGridAnnotations(stJohns, snapshot, [sleep]);

    expect(days.map((marks) => marks[0]!.duration.toString())).toEqual(["PT24M", "PT1M"]);
    expect(days.map((marks) => summarizeAnnotationMarks(marks)[0]!.duration.toString())).toEqual([
      "PT24M",
      "PT1M",
    ]);
  });

  test("ends at the latest mark's end when a repeated hour reorders marks", () => {
    // 01:05–01:15 EDT and 01:10–01:20 EST draw together and merge; 01:40–01:45 EDT stays apart.
    const [fallBack] = timeGridColumns(dates("2026-11-01", "2026-11-02"), "America/New_York");
    const snapshot = createAnnotationSnapshot([
      annotation("early", "sleep", "2026-11-01T05:05Z", "2026-11-01T05:15Z"),
      annotation("apart", "sleep", "2026-11-01T05:40Z", "2026-11-01T05:45Z"),
      annotation("repeat", "sleep", "2026-11-01T06:10Z", "2026-11-01T06:20Z"),
    ]);
    const [marks] = projectTimeGridAnnotations([fallBack!], snapshot, [sleep]);
    const [summary] = summarizeAnnotationMarks(marks!);

    expect(ids(marks!)).toEqual([["early", "repeat"], ["apart"]]);
    expect(summary!.start.toString()).toBe("2026-11-01T05:05:00Z");
    expect(summary!.end.toString()).toBe("2026-11-01T06:20:00Z");
  });
});

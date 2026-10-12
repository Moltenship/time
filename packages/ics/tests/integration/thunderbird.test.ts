import { describe, expect, test } from "vite-plus/test";

import { icsExtension, parseIcs } from "../../src/index";
import {
  eventByUid,
  instantOf,
  once,
  onlyCalendar,
  plain,
  propertyNames,
  readFixture,
} from "./helpers";

const text = readFixture("thunderbird.ics");
const result = once(() => parseIcs(text));
const calendar = once(() => onlyCalendar(result()));

const paris = "/mozilla.org/20070129_1/Europe/Paris";
const chicago = "/mozilla.org/20070129_1/America/Chicago";

const uid = {
  passport: "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
  report: "c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f",
  supplier: "5d3c2b1a-0f9e-4d8c-b7a6-958473625140",
  webinar: "6e4d3c2b-1a0f-4e9d-c8b7-a69584736251",
};

describe("thunderbird.ics", () => {
  test("parses without issues", () => {
    expect(result().issues).toEqual([]);
  });

  test("reads every component kind", () => {
    expect(calendar().productId).toBe("-//Mozilla.org/NONSGML Mozilla Calendar V1.1//EN");
    expect(calendar().events).toHaveLength(2);
    expect(calendar().todos).toHaveLength(2);
    expect(calendar().journals).toHaveLength(1);
  });

  test("resolves /mozilla.org/ TZIDs, with and without X-LIC-LOCATION", () => {
    expect(calendar().timeZones.map(({ timeZone, tzid }) => ({ timeZone, tzid }))).toEqual([
      { timeZone: "Europe/Paris", tzid: paris },
      { timeZone: "America/Chicago", tzid: chicago },
    ]);
  });

  test("reads an event in a /mozilla.org/ zone", () => {
    const supplier = eventByUid(calendar().events, uid.supplier);
    expect(plain(supplier.start)).toEqual({
      kind: "zoned",
      tzid: paris,
      wallTime: "2026-06-10T14:30:00",
      zoned: "2026-06-10T14:30:00+02:00[Europe/Paris]",
    });
    expect(instantOf(supplier.end)).toBe("2026-06-10T13:30:00Z");
    expect(supplier).toMatchObject({
      categories: ["Business", "Meetings"],
      classification: "PRIVATE",
      description: "Bring the signed contract.",
      location: "Atelier 3, Lyon",
      status: "CONFIRMED",
      summary: "Supplier visit",
    });
    expect(plain(supplier.alarms.map(({ trigger }) => trigger))).toEqual([
      { kind: "relative", offset: "-PT15M", relatedTo: "START" },
    ]);
    expect(propertyNames(supplier.otherProperties)).toEqual(["X-MOZ-GENERATION", "X-MOZ-LASTACK"]);

    const webinar = eventByUid(calendar().events, uid.webinar);
    expect(plain(webinar.start)).toMatchObject({
      tzid: chicago,
      zoned: "2026-01-20T08:00:00-06:00[America/Chicago]",
    });
    expect(instantOf(webinar.start)).toBe("2026-01-20T14:00:00Z");
  });

  test("reads a completed VTODO", () => {
    const [passport] = calendar().todos;
    expect(passport?.uid).toBe(uid.passport);
    expect(passport).toMatchObject({ percentComplete: 100, priority: 1, status: "COMPLETED" });
    expect(passport?.summary).toBe("Renew passport");
    expect(plain(passport?.start)).toMatchObject({
      tzid: paris,
      zoned: "2026-05-02T09:00:00+02:00[Europe/Paris]",
    });
    expect(plain(passport?.due)).toEqual({
      kind: "zoned",
      tzid: paris,
      wallTime: "2026-05-15T17:00:00",
      zoned: "2026-05-15T17:00:00+02:00[Europe/Paris]",
    });
    expect(passport?.completed?.toString()).toBe("2026-05-05T16:30:00Z");
    expect(passport?.stamp?.toString()).toBe("2026-05-05T16:30:00Z");
    expect(passport?.created?.toString()).toBe("2026-05-01T08:00:00Z");
    expect(passport?.alarms).toEqual([]);
  });

  test("reads an in-process VTODO with a DATE due and a parent", () => {
    const [, report] = calendar().todos;
    expect(report?.uid).toBe(uid.report);
    expect(report).toMatchObject({ percentComplete: 40, status: "IN-PROCESS" });
    expect(plain(report?.due)).toEqual({ date: "2026-06-20", kind: "date" });
    expect(report?.start).toBeUndefined();
    expect(report?.completed).toBeUndefined();
    expect(report?.relatedTo).toEqual([{ relationship: "PARENT", uid: uid.passport }]);
  });

  test("reads the VJOURNAL", () => {
    const [journal] = calendar().journals;
    expect(journal).toMatchObject({
      categories: ["Notes"],
      description: "What went well: the release.\nWhat to improve: fewer late changes.",
      status: "FINAL",
      summary: "Retrospective notes",
      uid: "d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80",
    });
    expect(plain(journal?.start)).toEqual({ date: "2026-05-12", kind: "date" });
    expect(propertyNames(journal?.otherProperties ?? [])).toEqual(["X-MOZ-GENERATION"]);
  });

  test("event, todo and journal extensions read X-MOZ-* properties", () => {
    const generation = icsExtension("X-MOZ-GENERATION", { type: "INTEGER" });
    const parsed = parseIcs(text, {
      extensions: {
        event: {
          generation,
          lastAck: icsExtension("X-MOZ-LASTACK", { type: "DATE-TIME" }),
        },
        journal: { generation },
        todo: { generation },
      },
    });
    const extended = onlyCalendar(parsed);
    expect(
      extended.events.map(({ extensions }) => ({
        generation: extensions.generation,
        lastAck: plain(extensions.lastAck),
      })),
    ).toEqual([
      { generation: 2, lastAck: { instant: "2026-06-09T12:00:00Z", kind: "utc" } },
      { generation: 1, lastAck: undefined },
    ]);
    expect(extended.todos.map(({ extensions }) => extensions.generation)).toEqual([3, 1]);
    expect(extended.journals.map(({ extensions }) => extensions.generation)).toEqual([1]);
    expect(extended.events.map(({ otherProperties }) => otherProperties)).toEqual([[], []]);
    expect(parsed.issues).toEqual([]);
  });
});

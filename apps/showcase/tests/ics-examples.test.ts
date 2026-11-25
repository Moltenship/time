import { describe, expect, test } from "vite-plus/test";

import { describeEvents, text } from "../content/examples/ics-first";
import { POST, readIcsFile, readStrictly } from "../content/examples/ics-import";

const crlf = (lines: readonly string[]) => lines.join("\r\n");

const calendar = (lines: readonly string[], header: readonly string[] = []) =>
  crlf([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Moltenship//Tests//EN",
    ...header,
    ...lines,
    "END:VCALENDAR",
  ]);

const event = (uid: string, lines: readonly string[]) => [
  "BEGIN:VEVENT",
  `UID:${uid}`,
  "DTSTAMP:20261001T080000Z",
  ...lines,
  "END:VEVENT",
];

describe("the overview's first example", () => {
  test("prints what the page says it prints", () => {
    expect(describeEvents(text)).toEqual([
      "Planning: 2026-10-12T09:00:00+02:00[Europe/Berlin] to 2026-10-12T09:45:00+02:00[Europe/Berlin]",
      "Offsite: 2026-10-15 to 2026-10-17",
    ]);
  });
});

describe("readIcsFile", () => {
  const file = (text: string) => new File([text], "team.ics", { type: "text/calendar" });

  test("reads every kind of start as an instant", async () => {
    const { events, problems } = await readIcsFile(
      file(
        calendar([
          ...event("utc", ["DTSTART:20261012T090000Z", "DTEND:20261012T100000Z", "SUMMARY:UTC"]),
          ...event("zoned", ["DTSTART;TZID=America/New_York:20261012T090000", "DURATION:PT30M"]),
          ...event("floating", ["DTSTART:20261012T090000", "DTEND:20261012T100000"]),
          ...event("day", ["DTSTART;VALUE=DATE:20261015", "DTEND;VALUE=DATE:20261017"]),
        ]),
      ),
      "Asia/Tokyo",
    );

    expect(problems).toEqual([]);
    expect(
      events.map((item) => [
        item.id,
        item.title,
        item.allDay,
        item.start.toString(),
        item.end.toString(),
      ]),
    ).toEqual([
      ["utc", "UTC", false, "2026-10-12T09:00:00Z", "2026-10-12T10:00:00Z"],
      ["zoned", "Untitled", false, "2026-10-12T13:00:00Z", "2026-10-12T13:30:00Z"],
      ["floating", "Untitled", false, "2026-10-12T00:00:00Z", "2026-10-12T01:00:00Z"],
      ["day", "Untitled", true, "2026-10-14T15:00:00Z", "2026-10-16T15:00:00Z"],
    ]);
  });

  test("reads a time without a zone in the file's X-WR-TIMEZONE", async () => {
    const { events } = await readIcsFile(
      file(
        calendar(event("floating", ["DTSTART:20261012T090000"]), ["X-WR-TIMEZONE:Europe/Berlin"]),
      ),
      "Asia/Tokyo",
    );
    expect(events[0]?.start.toString()).toBe("2026-10-12T07:00:00Z");
  });

  test("keeps the events it can read and names the line of one it can't", async () => {
    const { events, problems } = await readIcsFile(
      file(
        calendar([
          ...event("kept", ["DTSTART:20261012T090000Z"]),
          ...event("skipped", ["SUMMARY:No start"]),
        ]),
      ),
      "UTC",
    );
    expect(events.map((item) => item.id)).toEqual(["kept"]);
    expect(problems).toEqual(["Line 9: VEVENT has no DTSTART; skipped"]);
  });
});

describe("readStrictly", () => {
  test("returns the calendars of a file without errors", () => {
    const result = readStrictly(calendar(event("kept", ["DTSTART:20261012T090000Z"])));
    expect(result.ok && result.calendars[0]?.events).toHaveLength(1);
  });

  test("refuses a file with an error, with the first one as the reason", () => {
    const result = readStrictly(calendar(event("skipped", ["SUMMARY:No start"])));
    expect(result).toMatchObject({ ok: false, reason: "VEVENT has no DTSTART; skipped" });
    expect(!result.ok && result.issues).toHaveLength(1);
  });

  test("refuses text that isn't a calendar", () => {
    expect(readStrictly("hello")).toMatchObject({ ok: false });
  });
});

describe("the upload route", () => {
  const upload = (value: Blob | string | undefined) => {
    const body = new FormData();
    if (value !== undefined) body.set("calendar", value);
    return POST(new Request("https://example.com/import", { method: "POST", body }));
  };

  test("counts the events of a valid file", async () => {
    const response = await upload(
      new File([calendar(event("kept", ["DTSTART:20261012T090000Z"]))], "team.ics"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imported: 1 });
  });

  test("answers 400 with the errors of a bad file", async () => {
    const response = await upload(
      new File([calendar(event("skipped", ["SUMMARY:No start"]))], "team.ics"),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ errors: ["VEVENT has no DTSTART; skipped"] });
  });

  test("answers 400 when the form has no file", async () => {
    expect((await upload(undefined)).status).toBe(400);
    expect((await upload("not a file")).status).toBe(400);
  });
});

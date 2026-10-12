import { describe, expect, test } from "vite-plus/test";

import { getEventEnd, icsExtension, parseIcs, parseIcsComponents } from "../../src/index";
import {
  describeDate,
  enumSchema,
  errorsOf,
  eventByUid,
  idSchema,
  instantOf,
  once,
  onlyCalendar,
  plain,
  propertyNamed,
  propertyNames,
  readFixture,
} from "./helpers";

const text = readFixture("outlook.ics");
const result = once(() => parseIcs(text));
const calendar = once(() => onlyCalendar(result()));

const uid = {
  customized:
    "040000008200E00074C5B7101A82E00800000000E4F5A6B7C8D9DC01000000000000000010000000D4E5F6A7B8C9102B",
  displayName:
    "040000008200E00074C5B7101A82E00800000000D3E4F5A6B7C8DC01000000000000000010000000C3D4E5F6A7B8091A",
  outOfOffice:
    "040000008200E00074C5B7101A82E00800000000C2D3E4F5A6B7DC01000000000000000010000000B2C3D4E5F6A70819",
  standUp:
    "040000008200E00074C5B7101A82E00800000000B1C2D3E4F5A6DC01000000000000000010000000A1B2C3D4E5F60718293A4B5C6D7E8F",
  teams:
    "040000008200E00074C5B7101A82E00800000000A0B1C2D3E4F5DC01000000000000000010000000F1E2D3C4B5A6978877665544332211",
};

const displayNameTzid = "(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna";
const teamsLink =
  "https://teams.microsoft.com/l/meetup-join/19%3ameeting_ZmFrZS1tZWV0aW5nLWlk%40thread.v2/0";

const extended = once(() =>
  parseIcs(text, {
    extensions: {
      event: {
        allDay: icsExtension("X-MICROSOFT-CDO-ALLDAYEVENT", { type: "BOOLEAN" }),
        apptSequence: icsExtension("X-MICROSOFT-CDO-APPT-SEQUENCE", { type: "INTEGER" }),
        busyStatus: icsExtension("X-MICROSOFT-CDO-BUSYSTATUS", {
          schema: enumSchema(["BUSY", "FREE", "OOF", "TENTATIVE", "WORKINGELSEWHERE"]),
        }),
        htmlDescription: icsExtension("X-ALT-DESC"),
        owner: icsExtension("X-MICROSOFT-CDO-OWNERAPPTID", { schema: idSchema, type: "INTEGER" }),
      },
    },
  }),
);

describe("outlook.ics", () => {
  test("parses without errors", () => {
    expect(errorsOf(result().issues)).toEqual([]);
  });

  test("reads the calendar, with X-PUBLISHED-TTL as the refresh interval", () => {
    expect(calendar()).toMatchObject({
      method: "PUBLISH",
      name: "Calendar",
      productId: "Microsoft Exchange Server 2010",
      version: "2.0",
    });
    expect(calendar().refreshInterval?.toString()).toBe("PT1H");
    expect(calendar().events).toHaveLength(5);
  });

  test("resolves Windows TZIDs and a fixed-offset VTIMEZONE", () => {
    const zones = new Map(calendar().timeZones.map((zone) => [zone.tzid, zone.timeZone]));
    expect([...zones.keys()]).toEqual([
      "W. Europe Standard Time",
      "Pacific Standard Time",
      displayNameTzid,
      "Customized Time Zone",
    ]);
    // CLDR windowsZones, territory 001.
    expect(zones.get("W. Europe Standard Time")).toBe("Europe/Berlin");
    expect(zones.get("Pacific Standard Time")).toBe("America/Los_Angeles");
    // Every observance of "Customized Time Zone" has the offset +05:30.
    expect(zones.get("Customized Time Zone")).toBe("+05:30");
    // A Windows display name is not in CLDR; resolving it is optional.
    expect([undefined, "Europe/Berlin"]).toContain(zones.get(displayNameTzid));
  });

  test("reads Microsoft-style VTIMEZONE observances from 1601", () => {
    const pacific = calendar().timeZones.find((zone) => zone.tzid === "Pacific Standard Time");
    expect(plain(pacific?.observances)).toEqual([
      {
        comments: [],
        kind: "standard",
        names: [],
        offsetFrom: "-07:00",
        offsetTo: "-08:00",
        otherProperties: [],
        recurrenceDates: [],
        recurrenceRule: {
          byDay: [{ ordinal: 1, weekday: "SU" }],
          byMonth: [11],
          frequency: "YEARLY",
          interval: 1,
        },
        start: "1601-01-01T02:00:00",
      },
      {
        comments: [],
        kind: "daylight",
        names: [],
        offsetFrom: "-08:00",
        offsetTo: "-07:00",
        otherProperties: [],
        recurrenceDates: [],
        recurrenceRule: {
          byDay: [{ ordinal: 2, weekday: "SU" }],
          byMonth: [3],
          frequency: "YEARLY",
          interval: 1,
        },
        start: "1601-01-01T02:00:00",
      },
    ]);
  });

  describe("the Teams meeting", () => {
    const teams = once(() => eventByUid(calendar().events, uid.teams));

    test("starts in W. Europe Standard Time, resolved to Europe/Berlin", () => {
      expect(plain(teams().start)).toEqual({
        kind: "zoned",
        tzid: "W. Europe Standard Time",
        wallTime: "2026-03-04T15:00:00",
        zoned: "2026-03-04T15:00:00+01:00[Europe/Berlin]",
      });
      expect(instantOf(teams().start)).toBe("2026-03-04T14:00:00Z");
      expect(instantOf(teams().end)).toBe("2026-03-04T15:00:00Z");
    });

    test("reads CLASS, PRIORITY and the text fields", () => {
      expect(teams()).toMatchObject({
        classification: "PUBLIC",
        location: "Microsoft Teams Meeting",
        priority: 5,
        sequence: 0,
        status: "CONFIRMED",
        summary: "Quarterly planning",
        transparency: "OPAQUE",
      });
      expect(teams().description).toMatch(
        /^Quarterly planning for Q2, see the Teams link below\.\n\n_{80}\nMicrosoft Teams meeting\n/,
      );
      expect(teams().description).toContain("Join on your computer, mobile app or room device\n");
      expect(teams().description).toContain(`Click here to join the meeting<${teamsLink}?context=`);
      expect(teams().description).toContain("\nMeeting ID: 123 456 789 012\nPasscode: aBc123\n");
    });

    test("reads the quoted CN of the organizer and attendees", () => {
      expect(teams().organizer).toEqual({
        address: "mailto:frank@example.com",
        email: "frank@example.com",
        name: "Frank Example",
        otherParameters: {},
      });
      expect(teams().attendees.map(({ name, role, rsvp }) => ({ name, role, rsvp }))).toEqual([
        { name: "Grace Example", role: "REQ-PARTICIPANT", rsvp: true },
        { name: "Heidi Example", role: "OPT-PARTICIPANT", rsvp: true },
      ]);
    });

    test("reads the VALARM with RELATED=START", () => {
      expect(
        plain(teams().alarms.map(({ description, trigger }) => ({ description, trigger }))),
      ).toEqual([
        {
          description: "REMINDER",
          trigger: { kind: "relative", offset: "-PT15M", relatedTo: "START" },
        },
      ]);
    });

    test("keeps the X-MICROSOFT-* and X-ALT-DESC properties in source order", () => {
      expect(propertyNames(teams().otherProperties)).toEqual([
        "X-MICROSOFT-CDO-APPT-SEQUENCE",
        "X-MICROSOFT-CDO-OWNERAPPTID",
        "X-MICROSOFT-CDO-BUSYSTATUS",
        "X-MICROSOFT-CDO-INTENDEDSTATUS",
        "X-MICROSOFT-CDO-ALLDAYEVENT",
        "X-MICROSOFT-CDO-IMPORTANCE",
        "X-MICROSOFT-CDO-INSTTYPE",
        "X-MICROSOFT-DONOTFORWARDMEETING",
        "X-MICROSOFT-DISALLOW-COUNTER",
        "X-MICROSOFT-SKYPETEAMSMEETINGURL",
        "X-ALT-DESC",
      ]);
      const altDesc = propertyNamed(teams().otherProperties, "X-ALT-DESC");
      expect(altDesc?.parameters).toEqual({ FMTTYPE: ["text/html"] });
      // Raw values keep their TEXT escapes.
      expect(altDesc?.value).toMatch(
        /^<html><head><meta name="Generator" content="Microsoft Exchange Server">\\n/,
      );
      expect(altDesc?.value).toContain("padding-left: 4pt\\; border-left");
      expect(propertyNamed(teams().otherProperties, "X-MICROSOFT-CDO-BUSYSTATUS")?.value).toBe(
        "BUSY",
      );
    });
  });

  test("reads the weekly Pacific series with a comma-separated EXDATE", () => {
    const standUp = eventByUid(calendar().events, uid.standUp);
    expect(plain(standUp.start)).toEqual({
      kind: "zoned",
      tzid: "Pacific Standard Time",
      wallTime: "2026-03-10T09:00:00",
      zoned: "2026-03-10T09:00:00-07:00[America/Los_Angeles]",
    });
    expect(instantOf(standUp.start)).toBe("2026-03-10T16:00:00Z");
    expect(instantOf(standUp.end)).toBe("2026-03-10T16:15:00Z");
    expect(plain(standUp.recurrenceRule)).toEqual({
      byDay: [{ weekday: "TU" }, { weekday: "TH" }],
      count: 6,
      frequency: "WEEKLY",
      interval: 1,
      weekStart: "SU",
    });
    expect(standUp.exceptionDates.map(instantOf)).toEqual([
      "2026-03-17T16:00:00Z",
      "2026-03-19T16:00:00Z",
    ]);
    expect(
      standUp.exceptionDates.map((value) => (value.kind === "zoned" ? value.tzid : value.kind)),
    ).toEqual(["Pacific Standard Time", "Pacific Standard Time"]);
  });

  test("reads the all-day out-of-office", () => {
    const outOfOffice = eventByUid(calendar().events, uid.outOfOffice);
    expect(plain(outOfOffice.start)).toEqual({ date: "2026-04-06", kind: "date" });
    expect(plain(getEventEnd(outOfOffice))).toEqual({ date: "2026-04-07", kind: "date" });
    expect(outOfOffice.classification).toBe("PRIVATE");
    expect(outOfOffice.transparency).toBe("TRANSPARENT");
  });

  test("reads a TZID that is a quoted Windows display name", () => {
    const demo = eventByUid(calendar().events, uid.displayName);
    const { start } = demo;
    // The contract doesn't require display names to resolve: accept zoned or unresolved.
    expect(["zoned", "unresolved"]).toContain(start.kind);
    if (start.kind === "zoned") {
      expect(start.tzid).toBe(displayNameTzid);
      expect(start.wallTime.toString()).toBe("2026-05-12T09:00:00");
      expect(start.zoned.timeZoneId).toBe("Europe/Berlin");
      expect(start.zoned.toInstant().toString()).toBe("2026-05-12T07:00:00Z");
    } else {
      expect(describeDate(start)).toBe(`unresolved 2026-05-12T09:00:00 ${displayNameTzid}`);
      expect(result().issues).toContainEqual(
        expect.objectContaining({
          code: "unknown-time-zone",
          property: "DTSTART",
          severity: "warning",
        }),
      );
    }
  });

  test("keeps the display-name TZID parameter whole: its commas are quoted", () => {
    const [vcalendar] = parseIcsComponents(text).components;
    const demo = vcalendar?.components.find((component) =>
      component.properties.some((property) => property.value === uid.displayName),
    );
    expect(propertyNamed(demo?.properties ?? [], "DTSTART")).toMatchObject({
      parameters: { TZID: [displayNameTzid] },
      value: "20260512T090000",
    });
  });

  test("a custom resolver maps the display name and the built-in rules still apply", () => {
    const definitions: (string | undefined)[] = [];
    const parsed = parseIcs(text, {
      resolveTimeZone: (tzid, definition) => {
        if (!tzid.startsWith("(UTC+01:00) Amsterdam")) return undefined;
        definitions.push(propertyNamed(definition?.properties ?? [], "TZID")?.value);
        return "Europe/Amsterdam";
      },
    });
    const events = onlyCalendar(parsed).events;
    const demo = eventByUid(events, uid.displayName);
    expect(demo.start.kind).toBe("zoned");
    if (demo.start.kind === "zoned") {
      expect(demo.start.zoned.timeZoneId).toBe("Europe/Amsterdam");
      expect(demo.start.zoned.toInstant().toString()).toBe("2026-05-12T07:00:00Z");
    }
    expect(definitions).toContain(displayNameTzid);
    expect(describeDate(eventByUid(events, uid.teams).start)).toBe(
      "zoned 2026-03-04T15:00:00+01:00[Europe/Berlin] tzid=W. Europe Standard Time",
    );
    expect(parsed.issues.filter((issue) => issue.code === "unknown-time-zone")).toEqual([]);
  });

  test("reads an event in the fixed-offset Customized Time Zone", () => {
    const call = eventByUid(calendar().events, uid.customized);
    expect(call.start.kind).toBe("zoned");
    if (call.start.kind !== "zoned") return;
    expect(call.start.tzid).toBe("Customized Time Zone");
    expect(call.start.zoned.timeZoneId).toBe("+05:30");
    expect(call.start.zoned.toInstant().toString()).toBe("2026-06-01T03:30:00Z");
    expect(instantOf(call.end)).toBe("2026-06-01T04:00:00Z");
    expect(call.classification).toBe("CONFIDENTIAL");
    expect(call.priority).toBe(9);
  });

  describe("with extensions", () => {
    const events = once(() => onlyCalendar(extended()).events);

    test("decodes BOOLEAN, INTEGER and TEXT, and runs the schemas", () => {
      const teams = eventByUid(events(), uid.teams);
      expect(teams.extensions.allDay).toBe(false);
      expect(teams.extensions.apptSequence).toBe(0);
      expect(teams.extensions.busyStatus).toBe("BUSY");
      expect(teams.extensions.owner).toEqual({ id: 2120000431 });
      // TEXT unescapes \n, \; and \, in the HTML.
      expect(teams.extensions.htmlDescription).toMatch(
        /^<html><head><meta name="Generator" content="Microsoft Exchange Server">\n/,
      );
      expect(teams.extensions.htmlDescription).toContain(
        "margin-left: 1pt; padding-left: 4pt; border-left: #800000 2px solid; }",
      );
      expect(teams.extensions.htmlDescription).toContain(
        '<div><font face="Calibri">Quarterly planning for Q2, see the Teams link below.</font></div>',
      );
    });

    test("gives each event its own values", () => {
      expect(
        events().map(({ extensions: { allDay, busyStatus } }) => ({ allDay, busyStatus })),
      ).toEqual([
        { allDay: false, busyStatus: "BUSY" },
        { allDay: false, busyStatus: "TENTATIVE" },
        { allDay: true, busyStatus: "OOF" },
        { allDay: false, busyStatus: "BUSY" },
        { allDay: false, busyStatus: "WORKINGELSEWHERE" },
      ]);
      expect(eventByUid(events(), uid.outOfOffice).extensions.htmlDescription).toBeUndefined();
    });

    test("removes the claimed properties from otherProperties", () => {
      expect(propertyNames(eventByUid(events(), uid.teams).otherProperties)).toEqual([
        "X-MICROSOFT-CDO-INTENDEDSTATUS",
        "X-MICROSOFT-CDO-IMPORTANCE",
        "X-MICROSOFT-CDO-INSTTYPE",
        "X-MICROSOFT-DONOTFORWARDMEETING",
        "X-MICROSOFT-DISALLOW-COUNTER",
        "X-MICROSOFT-SKYPETEAMSMEETINGURL",
      ]);
    });

    test("adds no issues", () => {
      expect(extended().issues).toEqual(result().issues);
    });
  });
});

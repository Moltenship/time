// RFC 5545 §4 "iCalendar Object Examples", one VCALENDAR each, as printed in the RFC. The only
// change: the VFREEBUSY example gains the UID and DTSTAMP that §3.6.4 requires.

import { describe, expect, test } from "vite-plus/test";

import { getEventEnd, parseIcs } from "../../src/index";
import { errorsOf, instantOf, once, plain, readFixture } from "./helpers";

const text = readFixture("rfc5545-examples.ics");
const result = once(() => parseIcs(text));
const calendar = (index: number) => {
  const found = result().calendars[index];
  if (!found) throw new Error(`no calendar ${index}`);
  return found;
};

describe("rfc5545-examples.ics", () => {
  test("holds six calendars and no errors", () => {
    expect(result().calendars).toHaveLength(6);
    expect(errorsOf(result().issues)).toEqual([]);
    expect(result().calendars.map((each) => each.productId)).toEqual([
      "-//xyz Corp//NONSGML PDA Calendar Version 1.0//EN",
      "-//RDU Software//NONSGML HandCal//EN",
      "-//ABC Corporation//NONSGML My Product//EN",
      "-//ABC Corporation//NONSGML My Product//EN",
      "-//ABC Corporation//NONSGML My Product//EN",
      "-//RDU Software//NONSGML HandCal//EN",
    ]);
  });

  test("1: a three-day conference in UTC", () => {
    const [event] = calendar(0).events;
    expect(event).toMatchObject({
      categories: ["CONFERENCE"],
      organizer: { address: "mailto:jsmith@example.com", email: "jsmith@example.com" },
      status: "CONFIRMED",
      summary: "Networld+Interop Conference",
      uid: "uid1@example.com",
    });
    expect(event?.organizer?.name).toBeUndefined();
    expect(event?.stamp?.toString()).toBe("1996-07-04T12:00:00Z");
    expect(plain(event?.start)).toEqual({ instant: "1996-09-18T14:30:00Z", kind: "utc" });
    expect(plain(event?.end)).toEqual({ instant: "1996-09-20T22:00:00Z", kind: "utc" });
    // The second physical line starts with two spaces: one is the fold, one is content.
    expect(event?.description).toBe(
      "Networld+Interop Conference and Exhibit\nAtlanta World Congress Center\nAtlanta, Georgia",
    );
  });

  test("2: a group-scheduled meeting in America/New_York", () => {
    const [zone] = calendar(1).timeZones;
    expect(zone?.tzid).toBe("America/New_York");
    expect(zone?.timeZone).toBe("America/New_York");
    expect(plain(zone?.observances)).toEqual([
      {
        comments: [],
        kind: "standard",
        names: ["EST"],
        offsetFrom: "-04:00",
        offsetTo: "-05:00",
        otherProperties: [],
        recurrenceDates: [],
        start: "1998-10-25T02:00:00",
      },
      {
        comments: [],
        kind: "daylight",
        names: ["EDT"],
        offsetFrom: "-05:00",
        offsetTo: "-04:00",
        otherProperties: [],
        recurrenceDates: [],
        start: "1999-04-04T02:00:00",
      },
    ]);

    const [event] = calendar(1).events;
    expect(plain(event?.start)).toEqual({
      kind: "zoned",
      tzid: "America/New_York",
      wallTime: "1998-03-12T08:30:00",
      zoned: "1998-03-12T08:30:00-05:00[America/New_York]",
    });
    expect(instantOf(event?.end)).toBe("1998-03-12T14:30:00Z");
    expect(event).toMatchObject({
      categories: ["MEETING"],
      classification: "PUBLIC",
      description: "Project XYZ Review Meeting",
      location: "1CP Conference Room 4350",
      summary: "XYZ Project Review",
      uid: "guid-1.example.com",
    });
    expect(event?.created?.toString()).toBe("1998-03-09T13:00:00Z");
    // The value is folded right after the colon.
    expect(event?.attendees).toMatchObject([
      {
        address: "mailto:employee-A@example.com",
        calendarUserType: "GROUP",
        email: "employee-A@example.com",
        role: "REQ-PARTICIPANT",
        rsvp: true,
      },
    ]);
  });

  test("3: a meeting with an attachment and METHOD:xyz", () => {
    // METHOD values are case-insensitive (RFC 5545 §2), so the parser upper-cases them.
    expect(calendar(2).method).toBe("XYZ");
    const [event] = calendar(2).events;
    expect(event).toMatchObject({
      categories: ["MEETING", "PROJECT"],
      classification: "PUBLIC",
      description:
        "Discuss how we can test c&s interoperability\nusing iCalendar and other IETF standards.",
      location: "LDB Lobby",
      sequence: 0,
      summary: "Calendaring Interoperability Planning Meeting",
    });
    expect(event?.attendees).toMatchObject([{ address: "mailto:jsmith@example.com", rsvp: true }]);
    expect(event?.attachments).toEqual([
      {
        formatType: "application/postscript",
        kind: "uri",
        uri: "ftp://example.com/pub/conf/bkgrnd.ps",
      },
    ]);
    expect(plain(event?.start)).toEqual({ instant: "1997-03-24T12:30:00Z", kind: "utc" });
    expect(event && instantOf(getEventEnd(event))).toBe("1997-03-24T21:00:00Z");
  });

  test("4: a to-do with an audio alarm", () => {
    const [todo] = calendar(3).todos;
    expect(todo).toMatchObject({
      sequence: 2,
      status: "NEEDS-ACTION",
      summary: "Submit Income Taxes",
      uid: "uid4@example.com",
    });
    expect(todo?.attendees).toMatchObject([
      { address: "mailto:jqpublic@example.com", participationStatus: "ACCEPTED" },
    ]);
    expect(plain(todo?.due)).toEqual({ kind: "floating", wallTime: "1998-04-15T00:00:00" });
    // TRIGGER defaults to DURATION; the RFC writes this absolute one without VALUE=DATE-TIME, so
    // a tolerant parser decodes it by its shape.
    expect(plain(todo?.alarms)).toMatchObject([
      {
        action: "AUDIO",
        attachments: [
          {
            formatType: "audio/basic",
            kind: "uri",
            uri: "http://example.com/pub/audio-files/ssbanner.aud",
          },
        ],
        duration: "PT1H",
        repeat: 4,
        trigger: { instant: "1998-04-03T12:00:00Z", kind: "absolute" },
      },
    ]);
  });

  test("5: a journal entry, unfolded literally", () => {
    const [journal] = calendar(4).journals;
    expect(journal).toMatchObject({
      categories: ["Project Report", "XYZ", "Weekly Meeting"],
      classification: "PUBLIC",
      status: "DRAFT",
      uid: "uid5@example.com",
    });
    expect(journal?.start).toBeUndefined();
    // Unfolding removes exactly CRLF + one space, so the RFC's "Definition\r\n of" gives
    // "Definitionof".
    expect(journal?.description).toBe(
      "Project xyz Review Meeting Minutes\nAgenda\n1. Review of project version 1.0 " +
        "requirements.\n2. Definitionof project processes.\n3. Review of project schedule.\n" +
        "Participants: John Smith, Jane Doe, Jim Dandy\n-It was decided that the requirements " +
        "need to be signed off by product marketing.\n-Project processes were accepted.\n" +
        "-Project schedule needs to account for scheduled holidays and employee vacation time. " +
        "Check with HR for specific dates.\n-New schedule will be distributed by Friday.\n" +
        "-Next weeks meeting is cancelled. No meeting until 3/23.",
    );
  });

  test("6: published busy time", () => {
    const [busy] = calendar(5).freeBusy;
    expect(calendar(5).freeBusy).toHaveLength(1);
    expect(busy).toMatchObject({
      organizer: { address: "mailto:jsmith@example.com" },
      uid: "19980313T141711Z-busytime-jsmith@example.com",
      url: "http://www.example.com/calendar/busytime/jsmith.ifb",
    });
    expect(plain(busy?.start)).toEqual({ instant: "1998-03-13T14:17:11Z", kind: "utc" });
    expect(plain(busy?.end)).toEqual({ instant: "1998-04-10T14:17:11Z", kind: "utc" });
    // Whether FREEBUSY lines of one type are merged is open: compare the flattened periods.
    expect(new Set(busy?.freeBusy.map((entry) => entry.type))).toEqual(new Set(["BUSY"]));
    expect(plain(busy?.freeBusy.flatMap((entry) => entry.periods))).toEqual([
      {
        end: { instant: "1998-03-15T00:30:00Z", kind: "utc" },
        start: { instant: "1998-03-14T23:30:00Z", kind: "utc" },
      },
      {
        end: { instant: "1998-03-16T16:30:00Z", kind: "utc" },
        start: { instant: "1998-03-16T15:30:00Z", kind: "utc" },
      },
      {
        end: { instant: "1998-03-18T04:00:00Z", kind: "utc" },
        start: { instant: "1998-03-18T03:00:00Z", kind: "utc" },
      },
    ]);
  });
});

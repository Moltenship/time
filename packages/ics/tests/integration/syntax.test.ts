import { describe, expect, test } from "vite-plus/test";

import type { IcsComponent } from "../../src/index";
import { parseIcsComponents, stringifyIcsComponents } from "../../src/index";
import { fixtureNames, lineOf, propertyNamed, readFixture, withoutLines } from "./helpers";

const cleanFixtures = fixtureNames.filter((name) => !name.startsWith("quirks"));
const encoder = new TextEncoder();

/** Checks RFC 5545 §3.1 output: CRLF only, ≤ 75 octets a line, no code point split. */
function expectWellFolded(output: string): void {
  expect(output.endsWith("\r\n")).toBe(true);
  const lines = output.slice(0, -2).split("\r\n");
  for (const line of lines) {
    expect(line).not.toMatch(/[\r\n]/);
    expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    expect(line).not.toMatch(/[\uD800-\uDBFF]$/);
    expect(line).not.toMatch(/^ ?[\uDC00-\uDFFF]/);
  }
}

test("the corpus has the expected fixtures", () => {
  expect(fixtureNames).toEqual([
    "fastmail.ics",
    "google.ics",
    "icloud.ics",
    "invitation.ics",
    "outlook.ics",
    "quirks-lf.ics",
    "quirks-structure.ics",
    "quirks.ics",
    "rfc5545-examples.ics",
    "rfc7986.ics",
    "thunderbird.ics",
  ]);
});

describe.each(fixtureNames)("%s", (name) => {
  const text = readFixture(name);

  test("round-trips through parseIcsComponents and stringifyIcsComponents", () => {
    const first = parseIcsComponents(text);
    const output = stringifyIcsComponents(first.components);
    const second = parseIcsComponents(output);
    expect(second.issues).toEqual([]);
    expect(withoutLines(second.components)).toEqual(withoutLines(first.components));
    // Stringifying is stable once the text is canonical.
    expect(stringifyIcsComponents(second.components)).toBe(output);
  });

  test("is written back with CRLF and folded at 75 octets", () => {
    expectWellFolded(stringifyIcsComponents(parseIcsComponents(text).components));
  });

  test("numbers components from their BEGIN line", () => {
    const [first] = parseIcsComponents(text).components;
    expect(first?.name).toBe("VCALENDAR");
    expect(first?.line).toBe(1);
  });
});

describe.each(cleanFixtures)("%s (well-formed)", (name) => {
  test("has no syntax issues", () => {
    expect(parseIcsComponents(readFixture(name)).issues).toEqual([]);
  });
});

describe("parseIcsComponents", () => {
  test("gives a folded property the line of its first physical line", () => {
    const text = readFixture("google.ics");
    const [vcalendar] = parseIcsComponents(text).components;
    const vevent = vcalendar?.components.find((component) => component.name === "VEVENT");
    expect(vevent?.line).toBe(lineOf(text, "BEGIN:VEVENT"));
    const description = propertyNamed(vevent?.properties ?? [], "DESCRIPTION");
    expect(description?.line).toBe(
      lineOf(
        text,
        "DESCRIPTION:Agenda:\\n- Status updates\\, blockers and next steps\\n- Demo of ",
      ),
    );
    // The value is unfolded but still escaped.
    expect(description?.value).toMatch(
      /^Agenda:\\n- Status updates\\, blockers and next steps\\n- Demo of the new build\\n/,
    );
  });

  test("nests components in source order", () => {
    const [vcalendar] = parseIcsComponents(readFixture("thunderbird.ics")).components;
    expect(vcalendar?.components.map(({ name }) => name)).toEqual([
      "VTIMEZONE",
      "VTIMEZONE",
      "VEVENT",
      "VEVENT",
      "VTODO",
      "VTODO",
      "VJOURNAL",
    ]);
    expect(vcalendar?.components[0]?.components.map(({ name }) => name)).toEqual([
      "DAYLIGHT",
      "STANDARD",
    ]);
    expect(vcalendar?.components[2]?.components.map(({ name }) => name)).toEqual(["VALARM"]);
  });

  test("upper-cases names but keeps parameter values and values as written", () => {
    const [vcalendar] = parseIcsComponents(readFixture("quirks.ics")).components;
    const vevent = vcalendar?.components[0];
    expect(vevent?.name).toBe("VEVENT");
    expect(vevent?.components.map(({ name }) => name)).toEqual(["X-EXAMPLE-NOTE"]);
    expect(propertyNamed(vevent?.properties ?? [], "DTSTART")).toMatchObject({
      name: "DTSTART",
      parameters: { TZID: ["Europe/Berlin"] },
      value: "20260302T090000",
    });
    expect(propertyNamed(vcalendar?.properties ?? [], "X-WR-CALNAME")?.value).toBe("Quirks");
  });

  test("splits parameter values on commas outside quotes", () => {
    const [vcalendar] = parseIcsComponents(readFixture("rfc7986.ics")).components;
    const call = vcalendar?.components[1];
    const conferences = call?.properties.filter((property) => property.name === "CONFERENCE") ?? [];
    expect(conferences.map((conference) => conference.parameters.FEATURE)).toEqual([
      ["PHONE", "MODERATOR"],
      ["PHONE"],
      ["PHONE"],
      ["CHAT"],
      ["AUDIO", "VIDEO"],
      ["VIDEO"],
    ]);
    expect(conferences[5]).toMatchObject({
      parameters: { LABEL: ["Web video chat, access code=76543"], VALUE: ["URI"] },
      value: "https://video-chat.example.com/;group-id=1234",
    });
    // Indexing an absent parameter gives undefined.
    expect(conferences[0]?.parameters.LANGUAGE).toBeUndefined();
  });
});

describe("stringifyIcsComponents", () => {
  const long =
    "Еженедельная встреча команды 👩‍💻 и планирование спринта 🚀 — повестка: итоги релиза, " +
    "ретроспектива и планы на следующий квартал 🗓️ До встречи! 👋🏽";
  const tree: IcsComponent = {
    components: [
      {
        components: [],
        name: "VEVENT",
        properties: [
          { name: "UID", parameters: {}, value: "built-in-code@example.com" },
          { name: "DTSTAMP", parameters: {}, value: "20260301T120000Z" },
          { name: "DTSTART", parameters: { TZID: ["Europe/Berlin"] }, value: "20260302T090000" },
          { name: "SUMMARY", parameters: { LANGUAGE: ["ru"] }, value: long },
          {
            name: "ATTENDEE",
            parameters: {
              // Needs quoting (comma, colon, semicolon) and RFC 6868 encoding (DQUOTE).
              CN: ['Room 3, "Main"; Building B: East'],
              MEMBER: ["mailto:a@example.com", "mailto:b@example.com"],
            },
            value: "mailto:room-3b@example.com",
          },
          { name: "X-EMPTY", parameters: {}, value: "" },
        ],
      },
    ],
    name: "VCALENDAR",
    properties: [
      { name: "VERSION", parameters: {}, value: "2.0" },
      { name: "PRODID", parameters: {}, value: "-//Example Corp//Tests//EN" },
    ],
  };

  test("writes a tree built in code, which parses back to the same tree", () => {
    const output = stringifyIcsComponents(tree);
    expectWellFolded(output);
    expect(output.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(output.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
    const parsed = parseIcsComponents(output);
    expect(parsed.issues).toEqual([]);
    expect(withoutLines(parsed.components)).toEqual(withoutLines([tree]));
  });

  test("folds a long multi-byte value across several lines", () => {
    const lines = stringifyIcsComponents(tree).split("\r\n");
    const start = lines.findIndex((line) => line.startsWith("SUMMARY;"));
    let end = start + 1;
    while (lines[end]?.startsWith(" ")) end += 1;
    // The content line is 299 octets: 75 + 3 × 74 is too few, so at least five physical lines.
    expect(end - start).toBeGreaterThanOrEqual(5);
  });

  test("takes one component or an array", () => {
    expect(stringifyIcsComponents([tree])).toBe(stringifyIcsComponents(tree));
    const twice = stringifyIcsComponents([tree, tree]);
    expect(parseIcsComponents(twice).components).toHaveLength(2);
  });
});

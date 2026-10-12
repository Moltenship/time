import { describe, expect, test } from "vite-plus/test";

import { parseIcsComponents } from "../../src/index";
import type { IcsComponent } from "../../src/index";

function ics(...lines: string[]): string {
  return icsOf(lines);
}

function icsOf(lines: readonly string[]): string {
  return `${lines.join("\r\n")}\r\n`;
}

function only(text: string): IcsComponent {
  const { components } = parseIcsComponents(text);
  expect(components).toHaveLength(1);
  return components[0]!;
}

function firstProperty(text: string) {
  return only(text).properties[0]!;
}

describe("line breaks and unfolding", () => {
  test("unfolds the RFC 5545 §3.1 example", () => {
    const property = firstProperty(
      ics(
        "BEGIN:VCALENDAR",
        "DESCRIPTION:This is a lo",
        " ng description",
        "  that exists on a long line.",
        "END:VCALENDAR",
      ),
    );
    expect(property.value).toBe("This is a long description that exists on a long line.");
  });

  test("removes exactly one leading space or tab per continuation", () => {
    const property = firstProperty(ics("BEGIN:X", "SUMMARY:a", "\tb", "   c", "END:X"));
    expect(property.value).toBe("ab  c");
  });

  test("unfolds inside parameters and names", () => {
    const property = firstProperty(
      ics("BEGIN:X", "ATTE", " NDEE;C", ' N="Ann', '  Smith":mailto:a@example.com', "END:X"),
    );
    expect(property.name).toBe("ATTENDEE");
    expect(property.parameters).toEqual({ CN: ["Ann Smith"] });
    expect(property.value).toBe("mailto:a@example.com");
  });

  test.each([
    ["CRLF", "\r\n"],
    ["LF", "\n"],
    ["CR", "\r"],
  ])("accepts %s line ends", (_, eol) => {
    const text = ["BEGIN:VCALENDAR", "SUMMARY:a", " b", "END:VCALENDAR", ""].join(eol);
    const result = parseIcsComponents(text);
    expect(result.issues).toEqual([]);
    expect(result.components[0]!.properties[0]!.value).toBe("ab");
    expect(result.components[0]!.properties[0]!.line).toBe(2);
  });

  test("accepts mixed line ends and a missing final line end", () => {
    const result = parseIcsComponents("BEGIN:X\nA:1\r\nB:2\rC:3\r\nEND:X");
    expect(result.issues).toEqual([]);
    expect(result.components[0]!.properties.map((property) => property.line)).toEqual([2, 3, 4]);
  });

  test("strips a leading byte order mark", () => {
    const result = parseIcsComponents("﻿BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n");
    expect(result.issues).toEqual([]);
    expect(result.components[0]!.name).toBe("VCALENDAR");
  });

  test("skips blank lines silently, also between a line and its continuation", () => {
    const result = parseIcsComponents("  \r\nBEGIN:X\r\r\nSUMMARY:a\r\r\n b\r\r\n\r\nEND:X\r\r\n");
    expect(result.issues).toEqual([]);
    expect(result.components[0]!.properties).toEqual([
      { line: 4, name: "SUMMARY", parameters: {}, value: "ab" },
    ]);
  });

  test("a whitespace-only line after a line is a fold of whitespace", () => {
    expect(firstProperty(ics("BEGIN:X", "SUMMARY:a", "   ", "END:X")).value).toBe("a  ");
  });
});

describe("content lines", () => {
  test("upper-cases names and keeps the value verbatim", () => {
    const component = only(
      ics("begin:vcalendar", "x-wr-calname;value=text:  Mixed Case: a;b,c\\n  ", "end:VCalendar"),
    );
    expect(component).toEqual({
      components: [],
      line: 1,
      name: "VCALENDAR",
      properties: [
        {
          line: 2,
          name: "X-WR-CALNAME",
          parameters: { VALUE: ["text"] },
          value: "  Mixed Case: a;b,c\\n  ",
        },
      ],
    });
  });

  test("keeps an empty value", () => {
    expect(firstProperty(ics("BEGIN:X", "DESCRIPTION:", "END:X")).value).toBe("");
  });

  test("splits quoted parameter values on commas outside quotes", () => {
    const property = firstProperty(
      ics(
        "BEGIN:VEVENT",
        'ATTENDEE;MEMBER="mailto:a@example.com","mailto:b@example.com";DELEGATED-FROM="mailto:c@example.com":mailto:d@example.com',
        "END:VEVENT",
      ),
    );
    expect(property.parameters).toEqual({
      "DELEGATED-FROM": ["mailto:c@example.com"],
      MEMBER: ["mailto:a@example.com", "mailto:b@example.com"],
    });
    expect(property.value).toBe("mailto:d@example.com");
  });

  test("keeps `;`, `:` and `,` inside quotes", () => {
    const property = firstProperty(
      ics("BEGIN:X", 'X-P;A="x;y:z,w",plain;B=:value:with:colons', "END:X"),
    );
    expect(property.parameters).toEqual({ A: ["x;y:z,w", "plain"], B: [""] });
    expect(property.value).toBe("value:with:colons");
  });

  test("upper-cases parameter names and concatenates repeated parameters", () => {
    const property = firstProperty(ics("BEGIN:X", "CATEGORIES;x-tag=a,b;X-Tag=c:v", "END:X"));
    expect(property.parameters).toEqual({ "X-TAG": ["a", "b", "c"] });
  });

  test("reads names an object inherits, such as constructor, as absent parameters", () => {
    const { parameters } = firstProperty(ics("BEGIN:X", "X-P;A=1:v", "END:X"));

    expect(parameters).toEqual({ A: ["1"] });
    for (const name of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      expect(parameters[name]).toBeUndefined();
      expect(name in parameters).toBe(false);
    }
  });

  test("decodes the RFC 6868 examples", () => {
    const component = only(
      ics(
        "BEGIN:VEVENT",
        'GEO;X-ADDRESS="Pittsburgh Pirates^n115 Federal St^nPittsburgh, PA 15212":40.446816;-80.00566',
        "ATTENDEE;CN=\"George Herman ^'Babe^' Ruth\":mailto:babe@example.com",
        "X-P;A=a^^b^xc^:mailto:x@example.com",
        "END:VEVENT",
      ),
    );
    expect(component.properties[0]!.parameters["X-ADDRESS"]).toEqual([
      "Pittsburgh Pirates\n115 Federal St\nPittsburgh, PA 15212",
    ]);
    expect(component.properties[0]!.value).toBe("40.446816;-80.00566");
    expect(component.properties[1]!.parameters.CN).toEqual(['George Herman "Babe" Ruth']);
    // Unknown caret sequences, and a trailing caret, stay as written.
    expect(component.properties[2]!.parameters.A).toEqual(["a^b^xc^"]);
  });

  test("an absent parameter indexes as undefined", () => {
    const property = firstProperty(ics("BEGIN:X", "A:1", "END:X"));
    expect(property.parameters.TZID).toBeUndefined();
  });
});

describe("tolerance", () => {
  test("a line that isn't a content line continues the previous property with `\\n`", () => {
    const result = parseIcsComponents(
      ics(
        "BEGIN:VEVENT",
        "DESCRIPTION:First line",
        "second line, written raw",
        "  and a fold of it",
        "third line",
        "SUMMARY:Next",
        "END:VEVENT",
      ),
    );
    const [description, summary] = result.components[0]!.properties;
    expect(description!.value).toBe(
      "First line\\nsecond line, written raw and a fold of it\\nthird line",
    );
    expect(summary).toEqual({ line: 6, name: "SUMMARY", parameters: {}, value: "Next" });
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "invalid-content-line",
        component: "VEVENT",
        line: 3,
        path: [],
        property: "DESCRIPTION",
        severity: "warning",
      }),
      expect.objectContaining({ code: "invalid-content-line", line: 5, severity: "warning" }),
    ]);
  });

  test("a line that isn't a content line and follows no property is dropped", () => {
    const result = parseIcsComponents(ics("BEGIN:VEVENT", "just text", "UID:1", "END:VEVENT"));
    expect(result.components[0]!.properties).toEqual([
      { line: 3, name: "UID", parameters: {}, value: "1" },
    ]);
    expect(result.issues).toEqual([
      {
        code: "invalid-content-line",
        component: "VEVENT",
        line: 2,
        message: expect.any(String),
        path: [],
        severity: "warning",
      },
    ]);
  });

  test("lines without a colon, a name, or with a bad parameter name aren't content lines", () => {
    const result = parseIcsComponents(
      ics(
        "BEGIN:X",
        "A:1",
        "no colon here",
        ":no name",
        "Note; see this: here",
        'B;P="unclosed:value"',
        "END:X",
      ),
    );
    expect(result.components[0]!.properties[0]!.value).toBe(
      '1\\nno colon here\\n:no name\\nNote; see this: here\\nB;P="unclosed:value"',
    );
    expect(result.issues.map((issue) => issue.line)).toEqual([3, 4, 5, 6]);
  });

  test("a parameter without `=` is kept with no values", () => {
    const result = parseIcsComponents(
      ics("BEGIN:VEVENT", "DESCRIPTION;QUOTED-PRINTABLE;CHARSET=UTF-8:caf=C3=A9", "END:VEVENT"),
    );
    expect(result.components[0]!.properties[0]).toEqual({
      line: 2,
      name: "DESCRIPTION",
      parameters: { CHARSET: ["UTF-8"], "QUOTED-PRINTABLE": [] },
      value: "caf=C3=A9",
    });
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "invalid-content-line",
        component: "VEVENT",
        line: 2,
        property: "DESCRIPTION",
        severity: "warning",
      }),
    ]);
  });

  test("stray and unterminated quotes are kept literally, with a warning", () => {
    const result = parseIcsComponents(
      ics("BEGIN:X", 'A;CN=Ann "Annie" Smith:1', 'B;CN="Ann"ie:2', 'C;CN="Ann:3', "END:X"),
    );
    expect(result.components[0]!.properties.map((property) => property.parameters.CN)).toEqual([
      ['Ann "Annie" Smith'],
      ["Annie"],
      ['"Ann'],
    ]);
    expect(result.components[0]!.properties.map((property) => property.value)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(result.issues.map((issue) => [issue.code, issue.line])).toEqual([
      ["invalid-content-line", 2],
      ["invalid-content-line", 3],
      ["invalid-content-line", 4],
    ]);
  });

  test("an END that closes an open ancestor closes the components in between", () => {
    const result = parseIcsComponents(
      ics(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:2",
        "END:VEVENT",
        "END:VCALENDAR",
      ),
    );
    const calendar = result.components[0]!;
    expect(calendar.components.map((component) => component.name)).toEqual(["VEVENT", "VEVENT"]);
    expect(calendar.components[0]!.components[0]!.properties[0]!.name).toBe("ACTION");
    expect(result.issues).toEqual([
      {
        code: "invalid-structure",
        component: "VALARM",
        line: 5,
        message: expect.stringContaining("END:VEVENT"),
        path: [],
        severity: "warning",
      },
    ]);
  });

  test("an END without a matching BEGIN is ignored", () => {
    const result = parseIcsComponents(
      ics("BEGIN:VCALENDAR", "END:VEVENT", "PRODID:x", "END:VCALENDAR"),
    );
    expect(result.components[0]!.properties[0]!.name).toBe("PRODID");
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "invalid-structure",
        component: "VEVENT",
        line: 2,
        severity: "warning",
      }),
    ]);
  });

  test("components still open at the end are closed and kept", () => {
    const result = parseIcsComponents(
      ics("BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:1", "SUMMARY:truncated feed"),
    );
    expect(result.components[0]!.components[0]!.properties).toHaveLength(2);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "invalid-structure", component: "VEVENT", line: 2 }),
      expect.objectContaining({ code: "invalid-structure", component: "VCALENDAR", line: 1 }),
    ]);
    expect(result.issues.every((issue) => issue.severity === "warning")).toBe(true);
  });

  test("properties and other lines outside any component are dropped", () => {
    const result = parseIcsComponents(
      ics("PRODID:stray", "BEGIN:VCALENDAR", "END:VCALENDAR", "garbage after the end"),
    );
    expect(result.components).toEqual([
      { components: [], line: 2, name: "VCALENDAR", properties: [] },
    ]);
    expect(result.issues).toEqual([
      {
        code: "invalid-structure",
        line: 1,
        message: expect.any(String),
        path: [],
        property: "PRODID",
        severity: "warning",
      },
      {
        code: "invalid-content-line",
        line: 4,
        message: expect.any(String),
        path: [],
        severity: "warning",
      },
    ]);
  });

  test("text with no component yields one error", () => {
    const html = "<!DOCTYPE html>\n<html>\n<head><title>502 Bad Gateway</title></head>\n</html>\n";
    expect(parseIcsComponents(html)).toEqual({
      components: [],
      issues: [
        {
          code: "invalid-structure",
          message: expect.any(String),
          path: [],
          severity: "error",
        },
      ],
    });
    expect(parseIcsComponents("PRODID:x\nEND:VCALENDAR\n").issues).toEqual([
      expect.objectContaining({ code: "invalid-structure", severity: "error" }),
    ]);
  });

  test("empty and blank text yields nothing", () => {
    expect(parseIcsComponents("")).toEqual({ components: [], issues: [] });
    expect(parseIcsComponents("﻿ \r\n\t\r\n")).toEqual({ components: [], issues: [] });
  });

  test("BEGIN and END without a name are ignored", () => {
    const result = parseIcsComponents(ics("BEGIN:X", "BEGIN:", "END: ", "END:X"));
    expect(result.components).toEqual([{ components: [], line: 1, name: "X", properties: [] }]);
    expect(result.issues.map((issue) => [issue.code, issue.line])).toEqual([
      ["invalid-structure", 2],
      ["invalid-structure", 3],
    ]);
  });

  test("tolerates trailing whitespace on BEGIN and END", () => {
    const result = parseIcsComponents(ics("BEGIN:VCALENDAR ", "END:vcalendar\t"));
    expect(result).toEqual({
      components: [{ components: [], line: 1, name: "VCALENDAR", properties: [] }],
      issues: [],
    });
  });
});

describe("structure", () => {
  test("nests VCALENDAR > VEVENT > VALARM and VTIMEZONE > STANDARD/DAYLIGHT", () => {
    const result = parseIcsComponents(
      ics(
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VTIMEZONE",
        "TZID:Europe/Berlin",
        "BEGIN:DAYLIGHT",
        "TZOFFSETFROM:+0100",
        "END:DAYLIGHT",
        "BEGIN:STANDARD",
        "TZOFFSETFROM:+0200",
        "END:STANDARD",
        "END:VTIMEZONE",
        "BEGIN:VEVENT",
        "UID:1",
        "BEGIN:VALARM",
        "TRIGGER:-PT15M",
        "END:VALARM",
        "SUMMARY:After the alarm",
        "END:VEVENT",
        "END:VCALENDAR",
      ),
    );
    expect(result.issues).toEqual([]);
    const outline = (component: IcsComponent): unknown => ({
      [component.name]: {
        line: component.line,
        properties: component.properties.map((property) => `${property.line}:${property.name}`),
        components: component.components.map(outline),
      },
    });
    expect(result.components.map(outline)).toEqual([
      {
        VCALENDAR: {
          line: 1,
          properties: ["2:VERSION"],
          components: [
            {
              VTIMEZONE: {
                line: 3,
                properties: ["4:TZID"],
                components: [
                  { DAYLIGHT: { line: 5, properties: ["6:TZOFFSETFROM"], components: [] } },
                  { STANDARD: { line: 8, properties: ["9:TZOFFSETFROM"], components: [] } },
                ],
              },
            },
            {
              VEVENT: {
                line: 12,
                properties: ["13:UID", "17:SUMMARY"],
                components: [{ VALARM: { line: 14, properties: ["15:TRIGGER"], components: [] } }],
              },
            },
          ],
        },
      },
    ]);
  });

  test("returns every VCALENDAR in the text", () => {
    const result = parseIcsComponents(
      ics(
        "BEGIN:VCALENDAR",
        "PRODID:one",
        "END:VCALENDAR",
        "",
        "BEGIN:VCALENDAR",
        "PRODID:two",
        "END:VCALENDAR",
      ),
    );
    expect(result.issues).toEqual([]);
    expect(
      result.components.map((component) => [component.line, component.properties[0]!.value]),
    ).toEqual([
      [1, "one"],
      [5, "two"],
    ]);
  });

  test("line numbers point at the first physical line of folded properties", () => {
    const result = parseIcsComponents(
      ics(
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "DESCRIPTION:a",
        " b",
        " c",
        "UID:1",
        "END:VEVENT",
        "END:VCALENDAR",
      ),
    );
    const event = result.components[0]!.components[0]!;
    expect(event.line).toBe(2);
    expect(event.properties.map((property) => property.line)).toEqual([3, 6]);
  });
});

describe("large feeds", () => {
  test("parses 20,000 events", () => {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Example//EN"];
    for (let index = 0; index < 20_000; index += 1) {
      lines.push(
        "BEGIN:VEVENT",
        `UID:${index}@example.com`,
        "DTSTART;TZID=Europe/Berlin:20260101T090000",
        `SUMMARY:Event ${index} with a summary long enough to need folding at seventy-five oct`,
        " ets",
        'ATTENDEE;CN="Ann, Smith";ROLE=REQ-PARTICIPANT:mailto:ann@example.com',
        "END:VEVENT",
      );
    }
    lines.push("END:VCALENDAR");
    const result = parseIcsComponents(icsOf(lines));
    expect(result.issues).toEqual([]);
    const events = result.components[0]!.components;
    expect(events).toHaveLength(20_000);
    expect(events[19_999]!.line).toBe(4 + 19_999 * 7);
    expect(events[19_999]!.properties[2]!.value).toMatch(/octets$/);
  });

  test("a long run of raw continuation lines stays one value", () => {
    const lines = ["BEGIN:VEVENT", "DESCRIPTION:start"];
    for (let index = 0; index < 20_000; index += 1) lines.push(`raw line ${index}`);
    lines.push("END:VEVENT");
    const result = parseIcsComponents(icsOf(lines));
    const value = result.components[0]!.properties[0]!.value;
    expect(value.split("\\n")).toHaveLength(20_001);
    expect(result.issues).toHaveLength(20_000);
  });

  test("lone-CR text with a single trailing LF parses without rescanning", () => {
    const body = Array.from({ length: 50_000 }, (_, index) => `X-N:${index}`).join("\r");
    const result = parseIcsComponents(`BEGIN:X\r${body}\rEND:X\n`);
    expect(result.components[0]!.properties).toHaveLength(50_000);
  });
});

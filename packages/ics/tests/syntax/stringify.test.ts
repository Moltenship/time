import fc from "fast-check";
import { describe, expect, test } from "vite-plus/test";

import { parseIcsComponents, stringifyIcsComponents } from "../../src/index";
import type { IcsComponent, IcsProperty } from "../../src/index";

function utf8Length(line: string): number {
  let octets = 0;
  for (const character of line) {
    const code = character.codePointAt(0)!;
    octets += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return octets;
}

function physicalLines(text: string): string[] {
  expect(text.endsWith("\r\n")).toBe(true);
  return text.slice(0, -2).split("\r\n");
}

function unfolded(text: string): string[] {
  return physicalLines(text.replaceAll("\r\n ", ""));
}

function withoutLines(component: IcsComponent): IcsComponent {
  return {
    components: component.components.map(withoutLines),
    name: component.name,
    properties: component.properties.map(({ name, parameters, value }) => ({
      name,
      parameters,
      value,
    })),
  };
}

function event(...properties: IcsProperty[]): IcsComponent {
  return { components: [], name: "VEVENT", properties };
}

describe("stringifyIcsComponents", () => {
  test("writes BEGIN, properties, subcomponents and END with CRLF after every line", () => {
    const text = stringifyIcsComponents({
      components: [
        {
          components: [
            {
              components: [],
              name: "VALARM",
              properties: [{ name: "TRIGGER", parameters: {}, value: "-PT15M" }],
            },
          ],
          name: "VEVENT",
          properties: [
            { name: "UID", parameters: {}, value: "1" },
            { name: "SUMMARY", parameters: { LANGUAGE: ["en"] }, value: "Lunch\\, then a walk" },
          ],
        },
      ],
      name: "VCALENDAR",
      properties: [{ name: "VERSION", parameters: {}, value: "2.0" }],
    });
    expect(text).toBe(
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:1",
        "SUMMARY;LANGUAGE=en:Lunch\\, then a walk",
        "BEGIN:VALARM",
        "TRIGGER:-PT15M",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
      ].join("\r\n"),
    );
  });

  test("accepts a list of components", () => {
    const calendar: IcsComponent = { components: [], name: "VCALENDAR", properties: [] };
    expect(stringifyIcsComponents([calendar, calendar])).toBe(
      "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\nBEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n",
    );
    expect(stringifyIcsComponents([])).toBe("");
  });

  test("quotes parameter values with `:`, `;` or `,` and joins lists with commas", () => {
    const text = stringifyIcsComponents(
      event({
        name: "ATTENDEE",
        parameters: {
          CN: ["Smith, Ann"],
          MEMBER: ["mailto:a@example.com", "mailto:b@example.com"],
          ROLE: ["REQ-PARTICIPANT"],
          "X-SEMI": ["a;b"],
        },
        value: "mailto:ann@example.com",
      }),
    );
    expect(unfolded(text)[1]).toBe(
      'ATTENDEE;CN="Smith, Ann";MEMBER="mailto:a@example.com","mailto:b@example.com";ROLE=REQ-PARTICIPANT;X-SEMI="a;b":mailto:ann@example.com',
    );
  });

  test("RFC 6868-encodes carets, line breaks and double quotes", () => {
    const text = stringifyIcsComponents(
      event(
        {
          name: "GEO",
          parameters: { "X-ADDRESS": ["Pittsburgh Pirates\n115 Federal St\r\nPittsburgh"] },
          value: "40.446816;-80.00566",
        },
        { name: "ATTENDEE", parameters: { CN: ['George "Babe" ^ Ruth'] }, value: "mailto:b@x" },
      ),
    );
    const lines = unfolded(text);
    expect(lines[1]).toBe(
      "GEO;X-ADDRESS=Pittsburgh Pirates^n115 Federal St^nPittsburgh:40.446816;-80.00566",
    );
    expect(lines[2]).toBe("ATTENDEE;CN=George ^'Babe^' ^^ Ruth:mailto:b@x");
  });

  test("writes an empty parameter list as a bare name and skips undefined parameters", () => {
    const text = stringifyIcsComponents(
      event({ name: "X-P", parameters: { A: [], B: undefined, C: [""] }, value: "v" }),
    );
    expect(physicalLines(text)[1]).toBe("X-P;A;C=:v");
    const reparsed = parseIcsComponents(text);
    expect(reparsed.components[0]!.properties[0]!.parameters).toEqual({ A: [], C: [""] });
  });

  test("writes the value as-is", () => {
    const value = 'a\\nb\\;c,d:e"f^g';
    expect(
      physicalLines(stringifyIcsComponents(event({ name: "X", parameters: {}, value })))[1],
    ).toBe(`X:${value}`);
  });

  test("folds at 75 octets with a leading space on continuation lines", () => {
    const value = "x".repeat(200);
    const lines = physicalLines(
      stringifyIcsComponents(event({ name: "DESCRIPTION", parameters: {}, value })),
    );
    expect(lines).toEqual([
      "BEGIN:VEVENT",
      `DESCRIPTION:${"x".repeat(63)}`,
      ` ${"x".repeat(74)}`,
      ` ${"x".repeat(200 - 63 - 74)}`,
      "END:VEVENT",
    ]);
  });

  test("doesn't fold a line of exactly 75 octets", () => {
    const value = "y".repeat(75 - "SUMMARY:".length);
    const lines = physicalLines(
      stringifyIcsComponents(event({ name: "SUMMARY", parameters: {}, value })),
    );
    expect(lines[1]).toBe(`SUMMARY:${value}`);
    expect(lines).toHaveLength(3);
  });

  test("writes nesting as deep as the parser accepts", () => {
    const depth = 100_000;
    const text = "BEGIN:X\r\n".repeat(depth) + "END:X\r\n".repeat(depth);
    const { components, issues } = parseIcsComponents(text);

    expect(issues).toEqual([]);
    expect(stringifyIcsComponents(components)).toBe(text);
  });

  test.each([
    [
      "a property value",
      event({ name: "DESCRIPTION", parameters: {}, value: "a\nb" }),
      "Value of DESCRIPTION contains a line break",
    ],
    [
      "a property value, as a lone CR",
      event({ name: "SUMMARY", parameters: {}, value: "a\rb" }),
      "Value of SUMMARY contains a line break",
    ],
    [
      "a property name",
      event({ name: "X-A\r\nB", parameters: {}, value: "v" }),
      'Property name "X-A\\r\\nB" contains a line break',
    ],
    [
      "a parameter name",
      event({ name: "ATTENDEE", parameters: { "C\nN": ["Ann"] }, value: "mailto:a@x" }),
      'Parameter name "C\\nN" of ATTENDEE contains a line break',
    ],
    [
      "a component name",
      { components: [], name: "V\nEVENT", properties: [] },
      'Component name "V\\nEVENT" contains a line break',
    ],
  ])("throws a RangeError for a line break in %s", (_, component, message) => {
    expect(() => stringifyIcsComponents(component)).toThrow(RangeError);
    expect(() => stringifyIcsComponents(component)).toThrow(message);
  });

  test.each([
    ["Cyrillic", "Встреча с командой по планированию квартала"],
    ["CJK", "会議の議題について話し合いましょう"],
    ["emoji", "🎉👩‍👩‍👧‍👦🚀🇺🇦"],
    ["mixed", "aé€😀"],
  ])("never splits a UTF-8 sequence or surrogate pair (%s)", (_, text) => {
    for (let prefix = 0; prefix < 8; prefix += 1) {
      const value = "-".repeat(prefix) + text.repeat(6);
      const output = stringifyIcsComponents(event({ name: "SUMMARY", parameters: {}, value }));
      for (const line of physicalLines(output)) {
        expect(utf8Length(line)).toBeLessThanOrEqual(75);
        expect(line.isWellFormed()).toBe(true);
      }
      expect(parseIcsComponents(output).components[0]!.properties[0]!.value).toBe(value);
    }
  });
});

const nameArbitrary = fc
  .stringMatching(/^[A-Z][\dA-Z-]{0,20}$/)
  .filter((name) => name !== "BEGIN" && name !== "END");

const characterArbitrary = fc.oneof(
  fc.constantFrom(":", ";", ",", '"', "^", "\\", " ", "\t", "\n", "'", "n", "="),
  fc.constantFrom("я", "Ж", "ё", "€", "😀", "👩‍💻", "🇯🇵", "é", "中"),
  fc.string({ maxLength: 1, minLength: 1, unit: "binary" }),
);

// Raw CR and LF can't appear in a value; parameter values carry LF through RFC 6868.
const parameterValueArbitrary = fc
  .string({ maxLength: 40, unit: characterArbitrary })
  .map((value) => value.replaceAll("\r", ""));

const propertyValueArbitrary = fc
  .oneof(
    fc.string({ maxLength: 40, unit: characterArbitrary }),
    fc.string({ maxLength: 400, minLength: 70, unit: characterArbitrary }),
  )
  .map((value) => value.replaceAll(/[\n\r]/g, ""));

const propertyArbitrary: fc.Arbitrary<IcsProperty> = fc.record({
  name: nameArbitrary,
  parameters: fc.dictionary(
    nameArbitrary,
    fc.array(parameterValueArbitrary, { maxLength: 3, minLength: 1 }),
    { maxKeys: 4, noNullPrototype: true },
  ),
  value: propertyValueArbitrary,
});

const { component: componentArbitrary } = fc.letrec<{ component: IcsComponent }>((tie) => ({
  component: fc.record({
    components: fc.oneof(
      { depthSize: "small" },
      fc.constant([]),
      fc.array(tie("component"), { maxLength: 3 }),
    ),
    name: nameArbitrary,
    properties: fc.array(propertyArbitrary, { maxLength: 5 }),
  }),
}));

describe("round trip", () => {
  test("parse(stringify(tree)) equals the tree, in lines of at most 75 octets", () => {
    fc.assert(
      fc.property(fc.array(componentArbitrary, { maxLength: 3, minLength: 1 }), (tree) => {
        const text = stringifyIcsComponents(tree);
        for (const line of physicalLines(text)) {
          expect(utf8Length(line)).toBeLessThanOrEqual(75);
          expect(line.isWellFormed()).toBe(true);
        }
        const result = parseIcsComponents(text);
        expect(result.issues).toEqual([]);
        expect(result.components.map(withoutLines)).toEqual(tree);
      }),
      { numRuns: 300 },
    );
  });
});

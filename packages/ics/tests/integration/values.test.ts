import { describe, expect, test } from "vite-plus/test";

import {
  decodeIcsDateValue,
  decodeIcsValues,
  icsValueTypeOf,
  parseIcsComponents,
  splitIcsValues,
} from "../../src/index";
import { ics } from "./helpers";

// The README's "drop down a layer": list properties read from the syntax tree, through the public
// entry point only.
const [event] = parseIcsComponents(
  ics(
    "BEGIN:VEVENT",
    "CATEGORIES:Work,Planning\\, Q2",
    "EXDATE;VALUE=DATE:20260302,20260309",
    "EXDATE:20260316",
    "END:VEVENT",
  ),
).components;
const [categories, exdate, exdateWithoutValue] = event!.properties;

describe("the value layer, from the package entry point", () => {
  test("splitIcsValues splits a list and leaves TEXT escapes in place", () => {
    expect(splitIcsValues(icsValueTypeOf(categories!), categories!.value)).toEqual([
      "Work",
      "Planning\\, Q2",
    ]);
  });

  test("decodeIcsValues decodes each item", () => {
    expect(decodeIcsValues("TEXT", categories!.value)).toEqual([
      { ok: true, value: "Work" },
      { ok: true, value: "Planning, Q2" },
    ]);
    const dates = decodeIcsValues("DATE", exdate!.value);
    expect(dates.map((result) => result.ok && result.value.date.toString())).toEqual([
      "2026-03-02",
      "2026-03-09",
    ]);
  });

  test("decodeIcsDateValue reads a date by its shape, with a warning", () => {
    const result = decodeIcsDateValue(exdateWithoutValue!.value, "DATE-TIME");
    expect(result).toMatchObject({
      ok: true,
      value: { kind: "date" },
      warnings: [{ code: "invalid-value", message: expect.stringMatching(/DATE where DATE-TIME/) }],
    });
  });
});

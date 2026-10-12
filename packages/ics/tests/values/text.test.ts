import { describe, expect, test } from "vite-plus/test";

import { decodeIcsValue, decodeIcsValues, encodeIcsValue, splitIcsValues } from "../../src/values";
import { decoded, lenient, plain, rejected } from "./helpers";

describe("TEXT", () => {
  test("reads RFC 5545 §3.3.11's example", () => {
    expect(
      decoded(
        decodeIcsValue(
          "TEXT",
          String.raw`Project XYZ Final Review\nConference Room - 3B\nCome Prepared.`,
        ),
      ),
    ).toBe("Project XYZ Final Review\nConference Room - 3B\nCome Prepared.");
  });

  test("unescapes backslash, semicolon, comma and both newline escapes", () => {
    expect(decoded(decodeIcsValue("TEXT", String.raw`a\\b\;c\,d\ne\Nf`))).toBe("a\\b;c,d\ne\nf");
  });

  test("reads an escaped backslash before n as a backslash, not a newline", () => {
    expect(decoded(decodeIcsValue("TEXT", String.raw`C:\\new\\`))).toBe("C:\\new\\");
  });

  test("keeps unescaped commas and semicolons in a single value", () => {
    expect(decoded(decodeIcsValue("TEXT", "a,b;c"))).toBe("a,b;c");
  });

  test("drops the backslash of escapes RFC 5545 doesn't define, with a warning", () => {
    expect(lenient(decodeIcsValue("TEXT", String.raw`Room\: 3B`), /escapes/)).toBe("Room: 3B");
    expect(lenient(decodeIcsValue("TEXT", String.raw`say \"hi\"`), /\\"/)).toBe('say "hi"');
    expect(lenient(decodeIcsValue("TEXT", "party \\🎉"), /\\🎉/)).toBe("party 🎉");
  });

  test("keeps a lone trailing backslash, with a warning", () => {
    expect(lenient(decodeIcsValue("TEXT", "a\\"), /backslash/)).toBe("a\\");
  });

  test("escapes backslash, semicolon, comma and every newline form", () => {
    expect(encodeIcsValue("TEXT", "a\\b;c,d\ne\r\nf\rg")).toBe(String.raw`a\\b\;c\,d\ne\nf\ng`);
    expect(encodeIcsValue("TEXT", "Zoë: 会議 🎉")).toBe("Zoë: 会議 🎉");
  });
});

describe("lists", () => {
  test("split TEXT on separating commas only", () => {
    expect(splitIcsValues("TEXT", String.raw`a\,b,c`)).toEqual([String.raw`a\,b`, "c"]);
    expect(splitIcsValues("TEXT", String.raw`a\\,b`)).toEqual([String.raw`a\\`, "b"]);
    expect(splitIcsValues("TEXT", String.raw`a\\\,b`)).toEqual([String.raw`a\\\,b`]);
    expect(splitIcsValues("TEXT", "a,,b")).toEqual(["a", "", "b"]);
    expect(splitIcsValues("TEXT", "")).toEqual([""]);
  });

  test("decode each TEXT item after splitting", () => {
    expect(
      decodeIcsValues("TEXT", String.raw`APPOINTMENT,EDUCATION\, TRAINING,C:\\,x\;y`).map(decoded),
    ).toEqual(["APPOINTMENT", "EDUCATION, TRAINING", "C:\\", "x;y"]);
  });

  test("decode each item of other types independently", () => {
    const [first, second, third] = decodeIcsValues("DATE", "19970714,19970230,19970715");
    expect(plain(decoded(first!))).toEqual({ date: "Temporal.PlainDate 1997-07-14", kind: "date" });
    rejected(second!);
    expect(plain(decoded(third!))).toEqual({ date: "Temporal.PlainDate 1997-07-15", kind: "date" });
  });

  test("decode DATE-TIME and PERIOD items in the property's context", () => {
    const tzid = "America/New_York";
    expect(
      decodeIcsValues("DATE-TIME", "19970714T133000,19970715T133000", { tzid })
        .map(decoded)
        .map((value) => value.kind === "zoned" && value.zoned.toString()),
    ).toEqual([
      "1997-07-14T13:30:00-04:00[America/New_York]",
      "1997-07-15T13:30:00-04:00[America/New_York]",
    ]);
    expect(
      decodeIcsValues("PERIOD", "19960403T020000Z/19960403T040000Z,19960404T010000Z/PT3H"),
    ).toHaveLength(2);
  });

  test("never split a RECUR, whose parts hold commas", () => {
    const [rule, ...rest] = decodeIcsValues("RECUR", "FREQ=WEEKLY;BYDAY=MO,TU");
    expect(rest).toEqual([]);
    expect(decoded(rule!).byDay).toEqual([{ weekday: "MO" }, { weekday: "TU" }]);
  });
});

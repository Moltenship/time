import { plainDateInterval } from "@moltenship/calendar";
import { describe, expect, it } from "vite-plus/test";

import { around, covering } from "../src/load-range";

const date = (text: string) => Temporal.PlainDate.from(text);
const range = (start: string, end: string) => plainDateInterval(date(start), date(end));
const text = ({ end, start }: { end: Temporal.PlainDate; start: Temporal.PlainDate }) =>
  `${start.toString()}/${end.toString()}`;

describe("covering", () => {
  const current = around(date("2026-11-25"));

  it("keeps the range while it covers the dates the calendar needs", () => {
    expect(covering(current, range("2026-11-22", "2026-11-29"))).toBe(current);
    expect(covering(current, range("2026-10-14", "2027-01-06"))).toBe(current);
  });

  it("moves to six weeks either side of dates it doesn't cover", () => {
    expect(text(covering(current, range("2027-01-03", "2027-01-10")))).toBe(
      "2026-11-22/2027-02-14",
    );
  });

  it("reaches the end of a load range longer than six weeks", () => {
    expect(text(covering(current, range("2027-03-01", "2027-06-01")))).toBe(
      "2027-01-18/2027-06-01",
    );
  });
});

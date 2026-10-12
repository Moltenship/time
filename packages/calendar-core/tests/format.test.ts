import { describe, expect, test } from "vite-plus/test";

import { withAsciiSpaces } from "../src/index";

describe("withAsciiSpaces", () => {
  test("turns thin and narrow no-break spaces into plain ones", () => {
    expect(withAsciiSpaces("Oct 12\u2009–\u200918, 2026")).toBe("Oct 12 – 18, 2026");
    expect(withAsciiSpaces("9:30\u202FAM")).toBe("9:30 AM");
  });

  test("keeps other spaces, which runtimes agree on", () => {
    expect(withAsciiSpaces("12\u00A0oct.")).toBe("12\u00A0oct.");
  });

  test("makes a range read the same in every runtime", () => {
    const format = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
    const range = format.formatRange(
      Temporal.PlainTime.from("09:30"),
      Temporal.PlainTime.from("10:30"),
    );
    expect(withAsciiSpaces(range)).toBe("9:30 – 10:30 AM");
  });
});

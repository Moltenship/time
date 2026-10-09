import { describe, expect, test } from "vite-plus/test";

import { anchorShowingDate, getMonthRange, navigateMonth, timeGridStrategy } from "../src/index";
import { environment } from "./view-fixtures";

const date = (value: string) => Temporal.PlainDate.from(value);
const month = { getRange: getMonthRange, navigate: navigateMonth };

function reveal(
  strategy: Parameters<typeof anchorShowingDate>[0],
  anchor: string,
  target: string,
): string {
  return anchorShowingDate(
    strategy,
    date(anchor),
    date(target),
    environment("UTC"),
    undefined,
  ).toString();
}

describe("anchorShowingDate", () => {
  test("keeps the anchor while its range shows the date, padding days included", () => {
    expect(reveal(month, "2026-10-08", "2026-10-31")).toBe("2026-10-08");
    expect(reveal(month, "2026-10-08", "2026-09-27")).toBe("2026-10-08");
  });

  test("pages by whole ranges in either direction", () => {
    expect(reveal(month, "2026-10-08", "2026-11-08")).toBe("2026-11-08");
    // Each step constrains the day: October 31, September 30, August 30.
    expect(reveal(month, "2026-10-31", "2026-08-15")).toBe("2026-08-30");
  });

  test("a three-day view moves three days at a time", () => {
    const strategy = timeGridStrategy({ count: 3, kind: "days" });
    expect(reveal(strategy, "2026-10-05", "2026-10-08")).toBe("2026-10-08");
    expect(reveal(strategy, "2026-10-05", "2026-10-04")).toBe("2026-10-02");
  });
});

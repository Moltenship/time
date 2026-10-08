import { expect, test } from "vite-plus/test";

import { eventTimeRange, type TimeGridEventFormats } from "../time-grid-view/time-grid-event";

function formats(locale: string): TimeGridEventFormats {
  return {
    dayTime: new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
      weekday: "short",
    }),
    time: new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }),
  };
}

/** Intl separates parts with narrow and thin spaces; compare them as plain spaces. */
function label(start: string, end: string, locale: string): string {
  return eventTimeRange(
    Temporal.PlainDateTime.from(start),
    Temporal.PlainDateTime.from(end),
    formats(locale),
  ).replace(/\s/gu, " ");
}

test("a range ending on a later date shows the end's weekday", () => {
  expect(label("2026-10-12T18:15", "2026-10-13T18:00", "pt-BR")).toBe("18:15 – ter., 18:00");
  expect(label("2026-10-12T18:15", "2026-10-13T18:00", "en-US")).toBe("6:15 PM – Tue 6:00 PM");
  // Without a plain range dash in the locale, a standard one keeps the label readable.
  expect(label("2026-10-12T18:15", "2026-10-13T18:00", "ja-JP")).toMatch(/^18:15 – .*18:00/u);
});

test("a same-day range, or one ending at the next midnight, stays a time range", () => {
  expect(label("2026-10-12T18:15", "2026-10-12T19:00", "pt-BR")).toBe("18:15 – 19:00");
  expect(label("2026-10-12T22:00", "2026-10-13T00:00", "pt-BR")).toBe("22:00 – 00:00");
  expect(label("2026-10-12T09:00", "2026-10-12T10:00", "en-US")).toBe("9:00 – 10:00 AM");
});

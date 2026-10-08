import { describe, expect, test } from "vite-plus/test";

import { parseEvents, serializeEvents } from "../src/event-storage";
import { createSeedEvents } from "../src/seed";

const events = createSeedEvents(Temporal.PlainDate.from("2026-10-08"), "Europe/Berlin");

describe("event storage", () => {
  test("round-trips timed and all-day events through JSON", () => {
    const stored = serializeEvents(events);
    const parsed = parseEvents(stored);

    expect(parsed).not.toBeNull();
    expect(JSON.parse(serializeEvents(parsed ?? []))).toEqual(JSON.parse(stored));
    expect(parsed?.find(({ kind }) => kind === "timed")?.start).toBeInstanceOf(Temporal.Instant);
    expect(parsed?.find(({ kind }) => kind === "all-day")?.start).toBeInstanceOf(
      Temporal.PlainDate,
    );
  });

  test.each([
    ["nothing stored", null],
    ["malformed JSON", "{"],
    ["a non-array", '{"events":[]}'],
    [
      "an unknown calendar",
      JSON.stringify([{ ...JSON.parse(serializeEvents(events))[0], calendarId: "gone" }]),
    ],
    [
      "an unparseable instant",
      JSON.stringify([{ ...JSON.parse(serializeEvents(events))[0], start: "soon" }]),
    ],
  ])("falls back for %s", (_, stored) => {
    expect(parseEvents(stored)).toBeNull();
  });
});

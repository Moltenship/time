import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { createCanonicalRecurrenceAdapter, createOccurrenceExpander } from "../../src";
import { expandRecurrenceRule } from "../../src/rule/expand";
import { ids, instant, range, timed, type Event } from "./helpers";

vi.mock("../../src/rule/expand", async (importOriginal) => {
  const engine = await importOriginal<typeof import("../../src/rule/expand")>();
  return { ...engine, expandRecurrenceRule: vi.fn(engine.expandRecurrenceRule) };
});

const engine = vi.mocked(expandRecurrenceRule);
const adapters = createCanonicalRecurrenceAdapter<Event["data"]>();
const sync = timed("sync", "2026-10-21T09:00", "Europe/Berlin", 60, {
  recurrence: { rule: { frequency: "WEEKLY" } },
});
const lunch = timed("lunch", "2026-10-22T12:00", "Europe/Berlin");
const thisWeek = range("2026-10-19", "2026-10-26", "Europe/Berlin");
const nextWeek = range("2026-10-26", "2026-11-02", "Europe/Berlin");

beforeEach(() => {
  engine.mockClear();
});

describe("createOccurrenceExpander reuse", () => {
  test("returns the same expansion for the same events and range", () => {
    const expander = createOccurrenceExpander(adapters);
    const first = expander.expand([sync, lunch], thisWeek);

    expect(expander.expand([sync, lunch], thisWeek)).toBe(first);
    expect(engine).toHaveBeenCalledTimes(1);
  });

  test("asks the engine once per series and range, however often the view comes back", () => {
    const expander = createOccurrenceExpander(adapters);
    const first = expander.expand([sync, lunch], thisWeek);
    expander.expand([sync, lunch], nextWeek);
    const back = expander.expand([lunch, sync], thisWeek);

    expect(engine).toHaveBeenCalledTimes(2);
    expect(back.occurrences).toEqual([first.occurrences[1], first.occurrences[0]]);
    expect(back.occurrences[0]).toBe(first.occurrences[1]);
  });

  test("keeps the rule's dates when only the overrides change", () => {
    const expander = createOccurrenceExpander(adapters);
    expander.expand([sync], nextWeek);
    const moved = timed("sync-moved", "2026-10-29T09:00", "Europe/Berlin", 60, {
      override: { recurrenceId: instant("2026-10-28T08:00:00Z"), seriesId: "sync" },
    });
    const { occurrences } = expander.expand([sync, moved], nextWeek);

    expect(ids(occurrences)).toEqual(["sync::2026-10-28T08:00:00Z"]);
    expect(occurrences[0]?.event).toBe(moved);
    expect(engine).toHaveBeenCalledTimes(1);
  });

  test("expands a master again when it is a new object", () => {
    const expander = createOccurrenceExpander(adapters);
    const first = expander.expand([sync], thisWeek);
    const renamed = expander.expand([{ ...sync, title: "Weekly sync" }], thisWeek);

    expect(engine).toHaveBeenCalledTimes(2);
    expect(renamed.occurrences[0]).not.toBe(first.occurrences[0]);
    expect(renamed.occurrences[0]?.id).toBe(first.occurrences[0]?.id);
  });

  test("shares one view's work between time zones with the same instants", () => {
    const expander = createOccurrenceExpander(adapters);
    expander.expand([sync], range("2026-10-19", "2026-10-26", "Europe/Paris"));
    expander.expand([sync], thisWeek);
    expect(engine).toHaveBeenCalledTimes(1);
  });
});

describe("createOccurrenceExpander engine errors", () => {
  test("tells rules the engine doesn't support from invalid ones", () => {
    engine.mockImplementationOnce(() => {
      throw new RangeError("FREQ=SECONDLY isn't supported yet.");
    });
    const unsupported = createOccurrenceExpander(adapters).expand([sync], thisWeek);
    engine.mockImplementationOnce(() => {
      throw new RangeError("BY parts must not be empty.");
    });
    const invalid = createOccurrenceExpander(adapters).expand([sync], thisWeek);

    expect(unsupported.issues).toMatchObject([{ code: "unsupported-rule", event: sync, index: 0 }]);
    expect(invalid.issues).toMatchObject([{ code: "invalid-rule", event: sync, index: 0 }]);
    // The first occurrence is always one.
    expect(ids(unsupported.occurrences)).toEqual(["sync::2026-10-21T07:00:00Z"]);
  });
});

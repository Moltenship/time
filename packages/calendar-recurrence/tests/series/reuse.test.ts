import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceExpander,
  RecurrenceRuleError,
} from "../../src";
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

  test("lets occurrence objects go with the ranges the cache forgets", () => {
    const expander = createOccurrenceExpander(adapters);
    const first = expander.expand([sync], thisWeek);
    for (let week = 1; week <= 4; week += 1) {
      const start = Temporal.PlainDate.from("2026-10-19").add({ weeks: week });
      expander.expand([sync], range(start.toString(), start.add({ weeks: 1 }).toString()));
    }
    const back = expander.expand([sync], thisWeek);

    // Four later weeks pushed it out, so its objects went with it; the IDs stay.
    expect(back.occurrences[0]).not.toBe(first.occurrences[0]);
    expect(ids(back.occurrences)).toEqual(ids(first.occurrences));
  });

  test("sees events added to an array changed in place", () => {
    const expander = createOccurrenceExpander(adapters);
    const events = [sync];
    const first = expander.expand(events, thisWeek);
    events.push(lunch);

    expect(ids(expander.expand(events, thisWeek).occurrences)).toEqual([
      ...ids(first.occurrences),
      "lunch",
    ]);
  });

  test("shares one view's work between time zones with the same instants", () => {
    const expander = createOccurrenceExpander(adapters);
    expander.expand([sync], range("2026-10-19", "2026-10-26", "Europe/Paris"));
    expander.expand([sync], thisWeek);
    expect(engine).toHaveBeenCalledTimes(1);
  });
});

describe("createOccurrenceExpander engine errors", () => {
  test("reports a rule error under its code, and any other error as an invalid rule", () => {
    const expandWith = (error: Error) => {
      engine.mockImplementationOnce(() => {
        throw error;
      });
      return createOccurrenceExpander(adapters).expand([sync], thisWeek);
    };
    const unsupported = expandWith(new RecurrenceRuleError("unsupported-rule", "Not yet."));
    const zone = expandWith(new RecurrenceRuleError("invalid-time-zone", "No such zone."));
    const other = expandWith(new RangeError("A window bug."));

    expect(unsupported.issues).toMatchObject([
      { code: "unsupported-rule", event: sync, index: 0, message: "Not yet." },
    ]);
    expect(zone.issues).toMatchObject([{ code: "invalid-time-zone" }]);
    expect(other.issues).toMatchObject([{ code: "invalid-rule", message: "A window bug." }]);
    // The first occurrence is always one.
    expect(ids(unsupported.occurrences)).toEqual(["sync::2026-10-21T07:00:00Z"]);
  });
});

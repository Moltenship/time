import {
  createEventSnapshotCache,
  createEventTransactions,
  defineEventAdapter,
} from "@moltenship/calendar-core";
import { describe, expect, test } from "vite-plus/test";

import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceAdapter,
  createOccurrenceExpander,
  type RecurrenceOccurrence,
} from "../../src";
import { instant, range, timed, type Event } from "./helpers";

const adapters = createCanonicalRecurrenceAdapter<Event["data"]>();
const week = range("2026-10-26", "2026-11-02", "Europe/Berlin");
const sync = timed("sync", "2026-10-21T09:00", "Europe/Berlin", 60, {
  recurrence: { rule: { frequency: "WEEKLY" } },
  resourceIds: ["room-1"],
});

function overrideOf(start: string, title = "Sync (moved)", extra: Partial<Event> = {}): Event {
  return timed("sync-moved", start, "Europe/Berlin", 60, {
    override: { recurrenceId: instant("2026-10-28T08:00:00Z"), seriesId: "sync" },
    title,
    ...extra,
  });
}

describe("createOccurrenceAdapter", () => {
  test("reads IDs and intervals from occurrences, the rest from the event they show", () => {
    const adapter = createOccurrenceAdapter(adapters.event);
    const moved = overrideOf("2026-10-28T15:00", "Sync (moved)", { resourceIds: ["room-2"] });
    const [occurrence] = createOccurrenceExpander(adapters).expand([sync, moved], week).occurrences;
    if (occurrence === undefined) throw new Error("expected an occurrence");

    expect(adapter.getId(occurrence)).toBe("sync::2026-10-28T08:00:00Z");
    expect(adapter.getInterval(occurrence)).toBe(occurrence.interval);
    expect(adapter.getTitle(occurrence)).toBe("Sync (moved)");
    expect(adapter.getResourceIds(occurrence)).toEqual(["room-2"]);
    // The canonical adapter has neither, so the calendar's defaults apply.
    expect("isBusy" in adapter).toBe(false);
    expect("isReadOnly" in adapter).toBe(false);
  });

  test("delegates read-only and busy state when the event adapter has them", () => {
    const adapter = createOccurrenceAdapter(
      defineEventAdapter<Event>()({
        ...adapters.event,
        isBusy: (event) => event.title !== "Free",
        isReadOnly: (event) => event.override !== undefined,
      }),
    );
    const moved = overrideOf("2026-10-28T15:00", "Free");
    const occurrences = createOccurrenceExpander(adapters).expand(
      [sync, moved],
      range("2026-10-26", "2026-11-09", "Europe/Berlin"),
    ).occurrences;

    expect(occurrences.map((occurrence) => adapter.isReadOnly?.(occurrence))).toEqual([
      false,
      true,
    ]);
    expect(occurrences.map((occurrence) => adapter.isBusy?.(occurrence))).toEqual([true, false]);
  });

  test("changes the revision when the master or the override changes", () => {
    const adapter = createOccurrenceAdapter(adapters.event);
    const expander = createOccurrenceExpander(adapters);
    const revisions = (events: readonly Event[]) =>
      expander
        .expand(events, range("2026-10-26", "2026-11-09", "Europe/Berlin"))
        .occurrences.map((occurrence) => adapter.getRevision?.(occurrence));

    const moved = overrideOf("2026-10-28T15:00");
    const base = revisions([sync, moved]);
    const renamed = { ...sync, title: "Weekly sync" };

    expect(revisions([sync, moved])).toEqual(base);
    // A new master changes every occurrence, the override's too, since it shows the series.
    expect(revisions([renamed, moved]).every((revision, index) => revision !== base[index])).toBe(
      true,
    );
    // A new override object changes its occurrence only.
    const [generated, overridden] = revisions([sync, { ...moved }]);
    expect(generated).toBe(base[0]);
    expect(overridden).not.toBe(base[1]);
  });

  test("keeps an orphan override's revision to the override", () => {
    const adapter = createOccurrenceAdapter(adapters.event);
    const moved = overrideOf("2026-10-28T15:00");
    const [orphan] = createOccurrenceExpander(adapters).expand([moved], week).occurrences;
    const [again] = createOccurrenceExpander(adapters).expand([moved], week).occurrences;

    expect(orphan?.recurrence?.series).toBeUndefined();
    expect(adapter.getRevision?.(orphan!)).toBe(adapter.getRevision?.(again!));
  });

  test("uses the event adapter's revisions when it has them", () => {
    type Versioned = Event & { readonly version: number };
    const adapter = createOccurrenceAdapter(
      defineEventAdapter<Versioned>()({ ...adapters.event, getRevision: (event) => event.version }),
    );
    const expand = (master: Versioned) =>
      createOccurrenceExpander({ ...adapters, event: adapters.event }).expand([master], week)
        .occurrences[0] as RecurrenceOccurrence<Versioned, string>;

    const first = adapter.getRevision?.(expand({ ...sync, version: 1 }));
    expect(adapter.getRevision?.(expand({ ...sync, version: 1 }))).toBe(first);
    expect(adapter.getRevision?.(expand({ ...sync, version: 2 }))).not.toBe(first);
  });

  test("reads the event adapter's revision every time", () => {
    const master = { ...sync, version: 1 };
    const adapter = createOccurrenceAdapter(
      defineEventAdapter<typeof master>()({
        ...adapters.event,
        getRevision: (event) => event.version,
      }),
    );
    const [occurrence] = createOccurrenceExpander({ ...adapters, event: adapters.event }).expand(
      [master],
      week,
    ).occurrences as readonly RecurrenceOccurrence<typeof master, string>[];
    const before = adapter.getRevision?.(occurrence!);
    master.version = 2;

    expect(adapter.getRevision?.(occurrence!)).not.toBe(before);
  });

  test("keeps the snapshot current when the master changes", () => {
    const cache = createEventSnapshotCache(createOccurrenceAdapter(adapters.event));
    const expander = createOccurrenceExpander(adapters);
    const titles = (master: Event) =>
      cache
        .getSnapshot(expander.expand([master], week).occurrences)
        .events.map(({ title }) => title);

    expect(titles(sync)).toEqual(["sync"]);
    expect(titles({ ...sync, title: "Weekly sync" })).toEqual(["Weekly sync"]);
  });

  test("lets a pending move settle when the application saves an override elsewhere", async () => {
    const cache = createEventSnapshotCache(createOccurrenceAdapter(adapters.event));
    const expander = createOccurrenceExpander(adapters);
    const transactions = createEventTransactions<
      RecurrenceOccurrence<Event, string>,
      string,
      string
    >();
    let events: readonly Event[] = [sync];
    const snapshot = () => cache.getSnapshot(expander.expand(events, week).occurrences);
    transactions.reconcile(snapshot());

    const result = transactions.propose(
      {
        cause: "move",
        eventId: "sync::2026-10-28T08:00:00Z",
        // 10:00 instead of 09:00 in Berlin.
        proposed: {
          end: instant("2026-10-28T10:00:00Z"),
          kind: "timed",
          start: instant("2026-10-28T09:00:00Z"),
        },
      },
      {
        // The application saves the move a quarter of an hour later than proposed, and the
        // calendar renders the new events before the handler returns.
        onEventChange: () => {
          events = [sync, overrideOf("2026-10-28T10:15")];
          transactions.reconcile(snapshot());
        },
        snapshot: snapshot(),
        timeZone: "Europe/Berlin",
      },
    );

    expect(await result).toMatchObject({ status: "committed" });
    expect(transactions.getPending().size).toBe(0);
  });
});

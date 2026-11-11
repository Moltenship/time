import {
  type CalendarEvent,
  createEventSnapshot,
  type EventAdapter,
  type EventSnapshot,
} from "@moltenship/calendar-core";
import {
  instantInterval,
  plainDateInterval,
  plainDateTimeInterval,
} from "@moltenship/calendar-temporal";
import type { BenchmarkEngine, BenchmarkQuery } from "../shared/contracts";
import type { BenchmarkFixtureSet, FixtureEventData } from "../shared/fixtures";

type NativeFixtureEvent = CalendarEvent<FixtureEventData, string, string>;
type IndexedFixtureSnapshot = EventSnapshot<NativeFixtureEvent, string, string>;

const originInstant = Temporal.Instant.from("2026-08-01T00:00Z");
const originDate = Temporal.PlainDate.from("2026-08-01");
const originDateTime = Temporal.PlainDateTime.from("2026-08-01T00:00");

const fixtureAdapter: EventAdapter<NativeFixtureEvent, string, string> = {
  getId: (event) => event.id,
  getInterval: (event) => event,
  getResourceIds: (event) => event.resourceIds ?? [],
  getRevision: (event) => event.data.ordinal,
  getTitle: (event) => event.title,
};

const nativeEventCache = new WeakMap<BenchmarkFixtureSet, readonly NativeFixtureEvent[]>();

function nativeEvents(fixtures: BenchmarkFixtureSet): readonly NativeFixtureEvent[] {
  const cached = nativeEventCache.get(fixtures);
  if (cached !== undefined) return cached;

  const events = Object.freeze(
    fixtures.events.map((event): NativeFixtureEvent =>
      event.kind === "timed"
        ? Object.freeze({
            ...event,
            end: Temporal.Instant.from(event.end),
            start: Temporal.Instant.from(event.start),
          })
        : event.kind === "all-day"
          ? Object.freeze({
              ...event,
              end: Temporal.PlainDate.from(event.end),
              start: Temporal.PlainDate.from(event.start),
            })
          : Object.freeze({
              ...event,
              end: Temporal.PlainDateTime.from(event.end),
              start: Temporal.PlainDateTime.from(event.start),
            }),
    ),
  );
  nativeEventCache.set(fixtures, events);
  return events;
}

function buildIndexedSnapshot(fixtures: BenchmarkFixtureSet): IndexedFixtureSnapshot {
  // A fresh cache keeps every measured build honest; query caching is disabled so
  // the warm-query stage measures the production interval indexes themselves.
  return createEventSnapshot(nativeEvents(fixtures), fixtureAdapter, { queryCacheSize: 0 });
}

function queryIndexedSnapshot(
  snapshot: IndexedFixtureSnapshot,
  query: BenchmarkQuery,
): readonly string[] {
  const firstDay = Math.floor(query.startUnit / 1_440);
  const endDay = Math.ceil(query.endUnit / 1_440);
  const events = [
    ...snapshot.queryTimed(
      instantInterval(
        originInstant.add({ minutes: query.startUnit }),
        originInstant.add({ minutes: query.endUnit }),
      ),
    ),
    ...snapshot.queryAllDay(
      plainDateInterval(originDate.add({ days: firstDay }), originDate.add({ days: endDay })),
    ),
    ...snapshot.queryFloating(
      plainDateTimeInterval(
        originDateTime.add({ minutes: query.startUnit }),
        originDateTime.add({ minutes: query.endUnit }),
      ),
    ),
  ];

  return events.sort((left, right) => left.inputIndex - right.inputIndex).map(({ id }) => id);
}

export const indexedSnapshotEngine: BenchmarkEngine<IndexedFixtureSnapshot> = Object.freeze({
  build: buildIndexedSnapshot,
  name: "indexed-event-snapshot",
  query: queryIndexedSnapshot,
});

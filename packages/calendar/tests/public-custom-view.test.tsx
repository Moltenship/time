import { readFile } from "node:fs/promises";
import type { ComponentProps } from "react";

import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  plainDateInterval,
} from "@moltenship/calendar";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, expectTypeOf, test } from "vite-plus/test";

interface Meeting {
  readonly endsAt: Temporal.Instant;
  readonly id: `meeting-${number}`;
  readonly roomIds: readonly `room-${number}`[];
  readonly startsAt: Temporal.Instant;
  readonly title: string;
}

interface Room {
  readonly capacity: number;
  readonly id: `room-${number}`;
}

const eventAdapter = defineEventAdapter<Meeting>()({
  getId: (event) => event.id,
  getInterval: (event) => ({ end: event.endsAt, kind: "timed", start: event.startsAt }),
  getResourceIds: (event) => event.roomIds,
  getTitle: (event) => event.title,
});

const capacityView = defineCalendarView({
  defaultOptions: { days: 5 },
  name: "capacity",
  strategy: {
    getRange: (anchor, _environment, { days }) => plainDateInterval(anchor, anchor.add({ days })),
    getTitle: (range) => range.start.toString(),
    navigate: (anchor, delta, { days }) => anchor.add({ days: delta * days }),
    project: ({ instantRange, snapshot }) => snapshot.queryTimed(instantRange),
  },
  Renderer: ({ projection }) => (
    <ul>
      {projection.map(({ id, title }) => (
        <li key={id}>{title}</li>
      ))}
    </ul>
  ),
});

const TeamCalendar = createCalendar<Meeting, Room>()({ eventAdapter, views: [capacityView] });

const events: readonly Meeting[] = [
  {
    endsAt: Temporal.Instant.from("2026-08-15T10:00:00Z"),
    id: "meeting-1",
    roomIds: ["room-1"],
    startsAt: Temporal.Instant.from("2026-08-15T09:00:00Z"),
    title: "Architecture review",
  },
];
const resources: readonly Room[] = [{ capacity: 8, id: "room-1" }];

test("a third-party view and event renderer use public exports without casts", () => {
  const markup = renderToStaticMarkup(
    <TeamCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
      defaultTimeZone="Asia/Tbilisi"
      events={events}
      locale="en-GB"
      resources={resources}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <TeamCalendar.Frame>
        <TeamCalendar.Title />
        <TeamCalendar.ActiveView />
        <TeamCalendar.Event eventId="meeting-1">
          {({ event, normalized }) => {
            expectTypeOf(event).toEqualTypeOf<Meeting>();
            expectTypeOf(normalized.id).toEqualTypeOf<`meeting-${number}`>();
            return <span>{event.title}</span>;
          }}
        </TeamCalendar.Event>
      </TeamCalendar.Frame>
    </TeamCalendar.Root>,
  );

  expectTypeOf<ComponentProps<typeof TeamCalendar.Root>["view"]>().toEqualTypeOf<
    "capacity" | undefined
  >();
  expect(markup).toContain("2026-08-15");
  expect(markup).toContain("<li>Architecture review</li>");
  expect(markup).toContain("<span>Architecture review</span>");
});

test("the facade entry is not a client boundary, so core utilities work in Server Components", async () => {
  const source = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");

  expect(source).not.toMatch(/^\s*["']use client["']/mu);
  expect(plainDateInterval).toBeTypeOf("function");
  expect(defineEventAdapter).toBeTypeOf("function");
});

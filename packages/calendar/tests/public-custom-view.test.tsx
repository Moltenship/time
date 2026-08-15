import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  type CalendarViewStrategy,
} from "@moltenship/calendar";
import { plainDateInterval } from "@moltenship/calendar-temporal";
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

interface CapacityOptions {
  readonly days: number;
}

const eventAdapter = defineEventAdapter<Meeting>()({
  getId: (event) => event.id,
  getInterval: (event) => ({
    end: event.endsAt,
    kind: "timed",
    start: event.startsAt,
  }),
  getResourceIds: (event) => event.roomIds,
  getTitle: (event) => event.title,
});

const capacityStrategy = {
  getInteractionGeometry: (input: number) => input,
  getRange: (anchor: Temporal.PlainDate, _environment, options: CapacityOptions) =>
    plainDateInterval(anchor, anchor.add({ days: options.days })),
  getSpatialNavigation: (input: string) => input.length,
  getTitle: (range: ReturnType<typeof plainDateInterval>) => range.start.toString(),
  name: "capacity",
  navigate: (
    anchor: Temporal.PlainDate,
    direction: -1 | 1,
    _environment,
    options: CapacityOptions,
  ) => anchor.add({ days: direction * options.days }),
  project: (input: readonly Meeting[]) => input.length,
} satisfies CalendarViewStrategy<
  "capacity",
  CapacityOptions,
  readonly Meeting[],
  number,
  string,
  number,
  number,
  number
>;

const capacityView = defineCalendarView<Meeting, Room>()({
  capabilities: ["view:capacity"],
  defaultOptions: { days: 5 },
  Renderer({ calendar, options, strategy }) {
    const meeting: Meeting | undefined = calendar.meta.events[0];
    const room: Room | undefined = calendar.meta.resources.find((candidate) =>
      meeting?.roomIds.includes(candidate.id),
    );

    expectTypeOf(options.days).toEqualTypeOf<number>();
    expectTypeOf(strategy.name).toEqualTypeOf<"capacity">();

    return meeting === undefined || room === undefined ? null : (
      <output>
        {meeting.title} · {room.capacity}
      </output>
    );
  },
  strategy: capacityStrategy,
});

const UnionCalendar = createCalendar<Meeting, Room, "agenda" | "capacity">({ eventAdapter });
const unionCapacityView = UnionCalendar.defineView({
  defaultOptions: { days: 5 },
  Renderer({ calendar }) {
    expectTypeOf(calendar.state.view).toEqualTypeOf<"agenda" | "capacity">();
    const setView: (view: "agenda" | "capacity") => void = calendar.actions.setView;
    void setView;
    return null;
  },
  strategy: capacityStrategy,
});
void unionCapacityView;
const calendarWithStandaloneView = createCalendar<Meeting, Room, "agenda" | "capacity">({
  eventAdapter,
  views: [capacityView],
});
void calendarWithStandaloneView;

const TeamCalendar = createCalendar<Meeting, Room>({
  eventAdapter,
  views: [capacityView],
});

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
      defaultView="capacity"
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

  expect(markup).toContain("2026-08-15");
  expect(markup).toContain("Architecture review · 8");
  expect(markup).toContain("Architecture review");
});

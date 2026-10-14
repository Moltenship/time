import {
  createCalendar,
  createCanonicalEventAdapter,
  defineCalendarView,
  eventIdAttributes,
  plainDateInterval,
  useNow,
  type CalendarEvent,
  type CalendarResource,
} from "@moltenship/calendar";

export type TestEvent = CalendarEvent<null>;

/** Today's date, from the calendar's `now`, so tests can see the environment reach views. */
function Today({ timeZone }: { readonly timeZone: string }) {
  const now = useNow();
  return <p data-today>{now?.toZonedDateTimeISO(timeZone).toPlainDate().toString() ?? "none"}</p>;
}

/** A week of events as a list, each item carrying `eventIdAttributes`, as the registry's do. */
const listView = defineCalendarView({
  name: "list",
  strategy: {
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 7 })),
    getTitle: (range) => `List ${range.start.toString()}`,
    navigate: (anchor, delta) => anchor.add({ days: delta * 7 }),
    project: ({ instantRange, snapshot }) => snapshot.queryTimed(instantRange),
  },
  Renderer: ({ environment, projection }) => (
    <section>
      <Today timeZone={environment.timeZone} />
      <ol>
        {projection.map((event) => (
          <li key={event.id} {...eventIdAttributes(event.id)}>
            {event.title} {event.start.toString()}
          </li>
        ))}
      </ol>
    </section>
  ),
});

export const Calendar = createCalendar<TestEvent, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null>(),
  views: [listView],
});

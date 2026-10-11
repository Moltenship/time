// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  timeGridStrategy,
  type CalendarDraft,
  type CalendarEvent,
  type CalendarResource,
} from "@moltenship/calendar-core";
import { act } from "react";
import { afterEach, expect, test } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useBusyResources,
  useCalendarDraft,
  useCalendarDraftReporter,
  useDraftBusy,
} from "@moltenship/calendar-react";
import { instantInterval } from "@moltenship/calendar-temporal";

import { gateWeekRules } from "./harness/builders";
import { renderWithHarness, type ReactRootHarness } from "./harness/render-harness";
import "./setup";

type Meeting = CalendarEvent<null, string, string>;

const at = (value: string) => Temporal.ZonedDateTime.from(`${value}[America/New_York]`).toInstant();
const meeting = (id: string, start: string, end: string, resourceIds: string[]): Meeting => ({
  data: null,
  end: at(end),
  id,
  kind: "timed",
  resourceIds,
  start: at(start),
  title: id,
});
const meetings = [
  meeting("standup", "2026-10-08T09:00", "2026-10-08T09:30", ["ana"]),
  meeting("call", "2026-10-08T10:00", "2026-10-08T11:00", ["ben"]),
];
const resources: readonly CalendarResource<null>[] = ["ana", "ben", "cy"].map((id) => ({
  data: null,
  id,
  title: id,
}));
const time = (value: string) => Temporal.PlainTime.from(value);

const Calendar = createCalendar<Meeting, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [
    defineCalendarView({
      name: "day",
      strategy: timeGridStrategy<undefined, Meeting>({ count: 1, kind: "days" }),
      Renderer: () => null,
    }),
  ],
});

const renders: Record<string, number> = {};
let report: (draft: CalendarDraft<string, string> | null) => void = () => {};

function Header({ id }: { readonly id: string }) {
  renders[id] = (renders[id] ?? 0) + 1;
  const busy = useDraftBusy(id);
  const status =
    busy === null
      ? "none"
      : busy.events.length > 0
        ? busy.events.map((event) => event.id).join("+")
        : busy.outsideHours
          ? "outside-hours"
          : "free";
  return <li data-id={id}>{status}</li>;
}

/** An app's own "who's busy" UI, from the draft's range. */
function Draft() {
  const draft = useCalendarDraft();
  const busy = useBusyResources(draft?.proposed ?? null, { exclude: draft?.eventId });
  return <p data-draft>{draft === null ? "none" : [...busy.keys()].join(",")}</p>;
}

function Reporter() {
  report = useCalendarDraftReporter();
  return null;
}

function Busy() {
  const busy = useBusyResources(instantInterval(at("2026-10-08T09:15"), at("2026-10-08T10:30")));
  return <p data-busy>{[...busy.keys()].join(",")}</p>;
}

const harnesses: ReactRootHarness[] = [];
afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.dispose();
  for (const key of Object.keys(renders)) delete renders[key];
});

const draft = (start: string, end: string, eventId: string | null = null) => ({
  eventId,
  proposed: { end: at(end), kind: "timed" as const, resourceIds: ["cy"], start: at(start) },
});

test("headers follow the draft's time with its events, and only those that change re-render", async () => {
  const harness = await renderWithHarness(
    <Calendar.Root
      availability={{
        weekly: [{ days: [1, 2, 3, 4, 5], end: time("17:00"), start: time("09:00") }],
      }}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      events={meetings}
      locale="en-US"
      resources={resources}
      timeZone="America/New_York"
      weekRules={gateWeekRules}
    >
      <Reporter />
      <Busy />
      <Draft />
      <ul>
        {resources.map(({ id }) => (
          <Header key={id} id={id} />
        ))}
      </ul>
    </Calendar.Root>,
  );
  harnesses.push(harness);
  const statuses = () =>
    [...harness.container.querySelectorAll("li")].map((item) => item.textContent).join(" ");
  expect(harness.container.querySelector("[data-busy]")?.textContent).toBe("ana,ben");
  expect(statuses()).toBe("none none none");

  act(() => report(draft("2026-10-08T09:15", "2026-10-08T09:45")));
  expect(statuses()).toBe("standup free free");
  expect(harness.container.querySelector("[data-draft]")?.textContent).toBe("ana");
  const before = { ...renders };

  // A step that keeps Ana busy and the others free re-renders no header.
  act(() => report(draft("2026-10-08T09:00", "2026-10-08T09:30")));
  expect(renders).toEqual(before);

  // Moving onto Ben's call changes only Ana's and Ben's headers.
  act(() => report(draft("2026-10-08T10:15", "2026-10-08T10:45")));
  expect(statuses()).toBe("free call free");
  expect(renders.cy).toBe(before.cy);

  // Moving the call itself doesn't make Ben busy with it; the evening is outside hours.
  act(() => report(draft("2026-10-08T10:15", "2026-10-08T10:45", "call")));
  expect(statuses()).toBe("free free free");
  act(() => report(draft("2026-10-08T18:00", "2026-10-08T18:30")));
  expect(statuses()).toBe("outside-hours outside-hours outside-hours");

  act(() => report(null));
  expect(statuses()).toBe("none none none");
});

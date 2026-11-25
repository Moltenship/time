// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  timeGridStrategy,
  type CalendarDraft,
  type CalendarEvent,
  type CalendarResource,
  type CalendarWeekRules,
} from "@moltenship/calendar-core";
import { instantInterval } from "@moltenship/calendar-temporal";
import { createComponent, type JSX } from "@solidjs/web";
import { untrack } from "solid-js";
import { afterEach, expect, test } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useBusyResources,
  useCalendarDraft,
  useCalendarDraftReporter,
  useDraftBusy,
} from "../src";
import { element } from "../src/props";
import { mount, settled } from "./harness/render";
import "./setup";

type Meeting = CalendarEvent<null, string, string>;

const Li = element("li");
const P = element("p");
const Ul = element("ul");

const weekRules: CalendarWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] };
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

/** How often each header's text was worked out again. */
const updates: Record<string, number> = {};
let report: (draft: CalendarDraft<string, string> | null) => void = () => {};

function Header(props: { readonly id: string }): JSX.Element {
  const id = untrack(() => props.id);
  const busy = useDraftBusy(id);
  return createComponent(Li, {
    "data-id": id,
    get children() {
      updates[id] = (updates[id] ?? 0) + 1;
      const current = busy();
      return current === null
        ? "none"
        : current.events.length > 0
          ? current.events.map((event) => event.id).join("+")
          : current.outsideHours
            ? "outside-hours"
            : "free";
    },
  });
}

/** An app's own "who's busy" UI, from the draft's range. */
function Draft(): JSX.Element {
  const draft = useCalendarDraft();
  const busy = useBusyResources(
    () => draft()?.proposed ?? null,
    () => ({ exclude: draft()?.eventId }),
  );
  return createComponent(P, {
    "data-draft": "",
    get children() {
      return draft() === null ? "none" : [...busy().keys()].join(",");
    },
  });
}

function Reporter(): JSX.Element {
  report = useCalendarDraftReporter();
  return null;
}

function Busy(): JSX.Element {
  const busy = useBusyResources(instantInterval(at("2026-10-08T09:15"), at("2026-10-08T10:30")));
  return createComponent(P, {
    "data-busy": "",
    get children() {
      return [...busy().keys()].join(",");
    },
  });
}

afterEach(() => {
  for (const key of Object.keys(updates)) delete updates[key];
});

const draft = (start: string, end: string, eventId: string | null = null) => ({
  eventId,
  proposed: { end: at(end), kind: "timed" as const, resourceIds: ["cy"], start: at(start) },
});

test("headers follow the draft's time with its events, and only those that change update", async () => {
  const { container } = mount(() =>
    createComponent(Calendar.Root, {
      availability: {
        weekly: [{ days: [1, 2, 3, 4, 5], end: time("17:00"), start: time("09:00") }],
      },
      defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
      events: meetings,
      locale: "en-US",
      resources,
      timeZone: "America/New_York",
      weekRules,
      get children() {
        return [
          createComponent(Reporter, {}),
          createComponent(Busy, {}),
          createComponent(Draft, {}),
          createComponent(Ul, {
            get children() {
              return resources.map(({ id }) => createComponent(Header, { id }));
            },
          }),
        ];
      },
    }),
  );
  await settled();
  const statuses = () =>
    [...container.querySelectorAll("li")].map((item) => item.textContent).join(" ");
  expect(container.querySelector("[data-busy]")?.textContent).toBe("ana,ben");
  expect(statuses()).toBe("none none none");

  report(draft("2026-10-08T09:15", "2026-10-08T09:45"));
  await settled();
  expect(statuses()).toBe("standup free free");
  expect(container.querySelector("[data-draft]")?.textContent).toBe("ana");
  const before = { ...updates };

  // A step that keeps Ana busy and the others free updates no header.
  report(draft("2026-10-08T09:00", "2026-10-08T09:30"));
  await settled();
  expect(updates).toEqual(before);

  // Moving onto Ben's call changes only Ana's and Ben's headers.
  report(draft("2026-10-08T10:15", "2026-10-08T10:45"));
  await settled();
  expect(statuses()).toBe("free call free");
  expect(updates.cy).toBe(before.cy);

  // Moving the call itself doesn't make Ben busy with it; the evening is outside hours.
  report(draft("2026-10-08T10:15", "2026-10-08T10:45", "call"));
  await settled();
  expect(statuses()).toBe("free free free");
  report(draft("2026-10-08T18:00", "2026-10-08T18:30"));
  await settled();
  expect(statuses()).toBe("outside-hours outside-hours outside-hours");

  report(null);
  await settled();
  expect(statuses()).toBe("none none none");
});

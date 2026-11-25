// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  projectTimelineAvailability,
  timeGridStrategy,
  type CalendarAvailability,
  type CalendarEvent,
  type CalendarResource,
  type CalendarWeekRules,
  type TimeGridColumn,
  type TimeGridProjection,
} from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";
import { createComponent, type JSX } from "@solidjs/web";
import { createSignal, untrack } from "solid-js";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useCalendarAvailability,
  useClosedDates,
  useResourceStatus,
  useTimeGridAvailability,
  useTimelineAvailability,
  type CalendarViewRendererProps,
} from "../src";
import { keyedList } from "../src/flow";
import { element } from "../src/props";
import { mount, settled } from "./harness/render";
import "./setup";

type Meeting = CalendarEvent<null, string, string>;
type RootProps = Parameters<typeof Calendar.Root>[0];

const Ol = element("ol");
const Li = element("li");
const P = element("p");

const weekRules: CalendarWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] };
const time = (value: string) => Temporal.PlainTime.from(value);
const office = (): CalendarAvailability => ({
  exceptions: [{ date: Temporal.PlainDate.from("2026-10-09"), label: "Offsite" }],
  weekly: [{ days: [1, 2, 3, 4, 5], end: time("17:00"), start: time("09:00") }],
});
const resources: readonly CalendarResource<null>[] = [
  { data: null, id: "london", timeZone: "Europe/London", title: "London" },
];

const snapshots: unknown[] = [];

/** Each column's closed bands in hours, then the closed dates, for the calendar and London. */
function Shading(props: { readonly projection: TimeGridProjection<Meeting> }): JSX.Element {
  const availability = useCalendarAvailability();
  const columns = () => props.projection.days.map(({ column }) => column);
  const range = () =>
    plainDateInterval(columns()[0]!.date, columns().at(-1)!.date.add({ days: 1 }));
  const hours = (bands: readonly { readonly height: number; readonly top: number }[]) =>
    bands.map(({ height, top }) => `${top * 24}-${(top + height) * 24}`).join(",");
  const calendar = useTimeGridAvailability(columns);
  const london = useTimeGridAvailability(columns, "london");
  const timeline = useTimelineAvailability(columns, () => "london");
  const closed = useClosedDates(range);
  return createComponent(Ol, {
    "data-shading": "",
    get "data-snapshot"() {
      snapshots.push(availability());
      return String(snapshots.length);
    },
    get "data-timeline"() {
      // London's closed extents across the columns, as the core projects them.
      const expected = projectTimelineAvailability(columns(), availability().forResource("london"));
      return timeline().length > 0 && JSON.stringify(timeline()) === JSON.stringify(expected)
        ? "london"
        : "wrong";
    },
    get children() {
      return keyedList(columns, (column: TimeGridColumn, index: () => number) =>
        createComponent(Li, {
          get children() {
            const date = column.date.toString();
            return `${hours(calendar()[index()]!)} | ${hours(london()[index()]!)} | ${
              closed().get(date)?.label ?? (closed().has(date) ? "closed" : "open")
            }`;
          },
        }),
      );
    },
  });
}

const threeDays = defineCalendarView({
  name: "days",
  strategy: timeGridStrategy<undefined, Meeting>({ count: 3, kind: "days" }),
  Renderer: (props: CalendarViewRendererProps<TimeGridProjection<Meeting>, undefined>) =>
    createComponent(Shading, {
      get projection() {
        return props.projection;
      },
    }),
});

const Calendar = createCalendar<Meeting, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [threeDays],
});

afterEach(() => {
  snapshots.length = 0;
});

/** A root whose props are `props()`'s, so a test can change them. */
async function render(initial: Partial<RootProps> = {}) {
  // In an object, so Solid's setter overloads don't read the props as an updater.
  const [current, setCurrent] = createSignal<{ readonly props: Partial<RootProps> }>({
    props: initial,
  });
  const props = () => current().props;
  const view = mount(() =>
    createComponent(Calendar.Root, {
      get availability() {
        return "availability" in props() ? props().availability : office();
      },
      defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
      events: [],
      get locale() {
        return props().locale ?? "en-US";
      },
      get onDiagnosticsChange() {
        return props().onDiagnosticsChange;
      },
      resources,
      timeZone: "America/New_York",
      weekRules,
      get children() {
        return createComponent(Calendar.ActiveView, {});
      },
    } as RootProps),
  );
  await settled();
  return {
    container: view.container,
    async update(next: Partial<RootProps>) {
      setCurrent({ props: { ...initial, ...next } as Partial<RootProps> });
      await settled();
    },
  };
}

function shading(container: ParentNode): string[] {
  return [...container.querySelectorAll("[data-shading] li")].map((item) =>
    (item.textContent ?? "").replace(/\s+/g, " "),
  );
}

test("views shade the calendar's closed time and each resource's on its own time zone", async () => {
  const { container } = await render();

  expect(shading(container)).toEqual([
    // Thursday: 09:00–17:00 in New York, and 09:00–17:00 London time, 04:00–12:00 here. London's
    // closed time splits at its midnight, 19:00 here, where Friday's offsite takes over.
    "0-9,17-24 | 0-4,12-19,19-24 | open",
    // Friday is an offsite for everyone, then London's Saturday starts.
    "0-24 | 0-19,19-24 | Offsite",
    "0-24 | 0-24 | closed",
  ]);
  expect(container.querySelector("[data-shading]")!.getAttribute("data-timeline")).toBe("london");
});

test("an inline availability equal to the last keeps the snapshot", async () => {
  const view = await render();
  const before = snapshots.at(-1);

  await view.update({ availability: office(), locale: "en-GB" });

  expect(snapshots.at(-1)).toBe(before);
});

test("invalid hours are left out and reported as diagnostics", async () => {
  const onDiagnosticsChange = vi.fn();
  await render({
    availability: { ...office(), timeZone: "Mars/Olympus" },
    onDiagnosticsChange,
  });

  expect(onDiagnosticsChange).toHaveBeenLastCalledWith([
    expect.objectContaining({
      code: "invalid-availability",
      issue: expect.objectContaining({ code: "invalid-time-zone", value: "Mars/Olympus" }),
    }),
  ]);
});

test("invalid entries recreated inline update without throwing", async () => {
  const onDiagnosticsChange = vi.fn();
  const broken = () => ({ exceptions: [null], weekly: [null] }) as unknown as CalendarAvailability;
  const view = await render({ availability: broken(), onDiagnosticsChange });

  await view.update({ availability: broken(), onDiagnosticsChange });

  expect(onDiagnosticsChange).toHaveBeenLastCalledWith([
    expect.objectContaining({
      issue: expect.objectContaining({ code: "invalid-availability-exception" }),
    }),
    expect.objectContaining({
      issue: expect.objectContaining({ code: "invalid-availability-rule" }),
    }),
  ]);
});

test("fixing a rule's days list replaces the hours, holes included", async () => {
  const days: (1 | 4)[] = [];
  days.length = 1;
  const rule = (ruleDays: readonly (1 | 4)[]): CalendarAvailability => ({
    weekly: [{ days: ruleDays, end: time("17:00"), start: time("09:00") }],
  });
  const view = await render({ availability: rule(days) });
  expect(shading(view.container)[0]).toBe("0-24 | 0-24 | closed");

  await view.update({ availability: rule([4]) });

  expect(shading(view.container)[0]).toBe("0-9,17-24 | 0-4,12-19,19-24 | open");
});

const meetings: readonly Meeting[] = [
  ["standup", "2026-10-08T10:00", "2026-10-08T11:00"],
  ["review", "2026-10-08T10:30", "2026-10-08T12:00"],
].map(([id, start, end]) => ({
  data: null,
  end: Temporal.ZonedDateTime.from(`${end}[America/New_York]`).toInstant(),
  id: id!,
  kind: "timed",
  resourceIds: ["london"],
  start: Temporal.ZonedDateTime.from(`${start}[America/New_York]`).toInstant(),
  title: id!,
}));

let statusUpdates = 0;

function StatusProbe(props: { readonly at?: Temporal.Instant }): JSX.Element {
  const status = useResourceStatus("london", () => props.at);
  return createComponent(P, {
    "data-status": "",
    get children() {
      statusUpdates += 1;
      const current = status();
      if (current === null) return "pending";
      const { availability, busy } = current;
      return `${availability.available ? "open" : availability.reason} ${
        busy.busy ? busy.events.map(({ id }) => id).join("+") : "free"
      }`;
    },
  });
}

function createTestClock(initial: Temporal.Instant) {
  let current = initial;
  return {
    instant: () => current,
    set(instant: Temporal.Instant) {
      current = instant;
    },
  };
}

function statusRoot(children: () => JSX.Element, extra: Partial<RootProps> = {}) {
  return mount(() =>
    createComponent(Calendar.Root, {
      availability: office(),
      defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
      events: meetings,
      locale: "en-US",
      resources,
      timeZone: "America/New_York",
      weekRules,
      ...extra,
      get children() {
        return children();
      },
    } as RootProps),
  );
}

test("a resource's status follows the clock and updates only when it changes", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const clock = createTestClock(Temporal.Instant.from("2026-10-08T14:45:00Z"));
    const view = statusRoot(() => createComponent(StatusProbe, {}), { clock });
    await settled();
    const text = () => view.container.querySelector("[data-status]")?.textContent;
    // 10:45 in New York is 15:45 in London, inside its hours.
    expect(text()).toBe("open standup+review");
    const updates = statusUpdates;

    // Minutes pass without a change: no update.
    clock.set(Temporal.Instant.from("2026-10-08T14:50:00Z"));
    await vi.advanceTimersByTimeAsync(60_000);
    await settled();
    expect(statusUpdates).toBe(updates);

    // The standup ends at 11:00; the status changes then, without waiting for a minute's tick.
    clock.set(Temporal.Instant.from("2026-10-08T15:00:00Z"));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    await settled();
    expect(text()).toBe("open review");

    // London closes at 17:00, which is 12:00 in New York, as the review ends.
    clock.set(Temporal.Instant.from("2026-10-08T16:00:00Z"));
    await vi.advanceTimersByTimeAsync(60_000);
    await settled();
    expect(text()).toBe("outside-hours free");

    // Disposing the root clears the clock's timer.
    view.dispose();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test("a resource's status at a given instant, and none for a null resource", async () => {
  const [at, setAt] = createSignal<Temporal.Instant>(Temporal.Instant.from("2026-10-09T15:00:00Z"));
  let off: (() => unknown) | undefined;
  function Off(): JSX.Element {
    off = untrack(() => useResourceStatus(null));
    return null;
  }
  const view = statusRoot(() => [
    createComponent(StatusProbe, {
      get at() {
        return at();
      },
    }),
    createComponent(Off, {}),
  ]);
  await settled();
  // The offsite closes Friday.
  expect(view.container.querySelector("[data-status]")?.textContent).toBe("exception free");
  setAt(Temporal.Instant.from("2026-10-08T15:15:00Z"));
  await settled();
  expect(view.container.querySelector("[data-status]")?.textContent).toBe("open review");
  expect(off!()).toBeNull();
});

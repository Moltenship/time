// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  createFixedClock,
  defineCalendarView,
  plainDateInterval,
  type CalendarEvent,
  type CalendarResource,
} from "@moltenship/calendar-solid";
import { For, Show } from "solid-js";
import { expect, test } from "vite-plus/test";

import {
  draftStatusAttributes,
  ResourceStatusPart,
  useResourceHeaderStatus,
  type ResourceStatusOptions,
} from "../calendar/resource-status";
import { render } from "./render";

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
const resources: readonly CalendarResource<null>[] = ["ana", "ben", "cy"].map((id) => ({
  data: null,
  id,
  title: id,
}));
const environment = { locale: "en-US", timeZone: "America/New_York" } as const;

function Header(props: { readonly id: string; readonly options: ResourceStatusOptions | null }) {
  const status = useResourceHeaderStatus(
    () => environment,
    () => ({
      hasChildren: false,
      id: props.id,
      resource: resources.find((resource) => resource.id === props.id) ?? null,
    }),
    () => props.options,
  );
  return (
    <li data-id={props.id} {...draftStatusAttributes(status())}>
      <Show when={status()}>{(shown) => <ResourceStatusPart status={shown()} />}</Show>
    </li>
  );
}

function calendarWith(options: ResourceStatusOptions | null) {
  return createCalendar<Meeting, CalendarResource<null>>()({
    eventAdapter: createCanonicalEventAdapter<null, string, string>(),
    views: [
      defineCalendarView({
        name: "day",
        strategy: {
          getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 1 })),
          getTitle: () => "Day",
          navigate: (anchor, delta) => anchor.add({ days: delta }),
          project: () => null,
        },
        Renderer: () => (
          <ul>
            <For each={resources}>
              {(resource) => <Header id={resource.id} options={options} />}
            </For>
          </ul>
        ),
      }),
    ],
  });
}

async function renderStatus(options: ResourceStatusOptions | null) {
  const Calendar = calendarWith(options);
  return render(() => (
    <Calendar.Root
      availability={{
        weekly: [
          {
            days: [1, 2, 3, 4, 5],
            end: Temporal.PlainTime.from("17:00"),
            start: Temporal.PlainTime.from("09:00"),
          },
        ],
      }}
      clock={createFixedClock(at("2026-10-08T09:15"))}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      events={[
        meeting("standup", "2026-10-08T09:00", "2026-10-08T09:30", ["ana"]),
        meeting("call", "2026-10-08T10:00", "2026-10-08T11:00", ["ben"]),
      ]}
      locale="en-US"
      resources={resources}
      timeZone="America/New_York"
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  ));
}

const words = (element: Element | null) => element?.textContent?.replace(/\s/g, " ");

test("shows each resource's status now as an outline badge, in words", async () => {
  const { container } = await renderStatus({});
  const badge = (id: string) =>
    container.querySelector(`li[data-id="${id}"] [data-slot="resource-status"]`);

  expect(badge("ana")?.getAttribute("data-state")).toBe("busy");
  expect(words(badge("ana"))).toBe("Busy until 9:30 AM");
  expect(badge("ana")?.getAttribute("title")?.replace(/\s/g, " ")).toBe("Busy until 9:30 AM");
  expect(badge("ana")?.getAttribute("data-variant")).toBe("outline");
  expect(words(badge("ben"))).toBe("Free until 10:00 AM");
  expect(words(badge("cy"))).toBe("Free until 5:00 PM");
});

test("takes words of the app's own", async () => {
  const { container } = await renderStatus({ labels: { busy: () => "Occupé" } });
  expect(words(container.querySelector('li[data-id="ana"] [data-slot="resource-status"]'))).toBe(
    "Occupé",
  );
});

test("renders no status when the option is off", async () => {
  const { container } = await renderStatus(null);
  expect(container.querySelector('[data-slot="resource-status"]')).toBeNull();
});

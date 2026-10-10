// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  resourceColumnsStrategy,
  type CalendarEvent,
  type CalendarResource,
} from "@moltenship/calendar-core";
import { act, memo } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useResourceExpansion,
  useVisibleResources,
} from "@moltenship/calendar-react";

import { gateWeekRules } from "./harness/builders";
import { renderWithHarness, type ReactRootHarness } from "./harness/render-harness";
import "./setup";

type Booking = CalendarEvent<null, string, string>;

const rooms: readonly CalendarResource<null>[] = [
  { data: null, id: "floor-1", title: "Floor 1" },
  { data: null, id: "orchid", parentId: "floor-1", title: "Orchid" },
  { data: null, id: "lotus", parentId: "floor-1", title: "Lotus" },
  { data: null, id: "garage", title: "Garage" },
];

const bookings: readonly Booking[] = [
  {
    data: null,
    end: Temporal.Instant.from("2026-10-08T10:00:00Z"),
    id: "pairing",
    kind: "timed",
    resourceIds: ["orchid", "lotus"],
    start: Temporal.Instant.from("2026-10-08T09:00:00Z"),
    title: "Pairing",
  },
  {
    data: null,
    end: Temporal.Instant.from("2026-10-08T12:00:00Z"),
    id: "lunch",
    kind: "timed",
    start: Temporal.Instant.from("2026-10-08T11:00:00Z"),
    title: "Lunch",
  },
];

const columnsView = defineCalendarView({
  defaultOptions: { unassigned: "bucket" as "bucket" | "hide" },
  name: "rooms",
  strategy: resourceColumnsStrategy<{ readonly unassigned: "bucket" | "hide" }, Booking>({
    count: 1,
    kind: "days",
  }),
  Renderer: ({ projection }) => (
    <ol data-view>
      {projection.resources.map(({ days, resource }) => (
        <li data-depth={resource.depth} key={resource.key}>
          {`${resource.id ?? "unassigned"}:${days[0]!.events.map(({ fragment }) => fragment.event.id).join(",")}`}
        </li>
      ))}
    </ol>
  ),
});

const RoomCalendar = createCalendar<Booking, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [columnsView],
});

const renders = new Map<string, number>();

const ResourceToggle = memo(function ResourceToggle({ id }: { readonly id: string }) {
  const { expanded, toggle } = useResourceExpansion(id);
  renders.set(id, (renders.get(id) ?? 0) + 1);
  return (
    <button data-toggle={id} onClick={toggle} type="button">
      {expanded ? "collapse" : "expand"}
    </button>
  );
});

function VisibleList() {
  const visible = useVisibleResources();
  return <output data-visible>{visible.map(({ id }) => id).join(",")}</output>;
}

const harnesses: ReactRootHarness[] = [];

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.dispose();
  document.body.replaceChildren();
  renders.clear();
  vi.restoreAllMocks();
});

async function render(
  props: Partial<React.ComponentProps<typeof RoomCalendar.Root>> = {},
): Promise<ReactRootHarness> {
  const harness = await renderWithHarness(
    <RoomCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      events={bookings}
      locale="en-US"
      resources={rooms}
      timeZone="UTC"
      weekRules={gateWeekRules}
      {...props}
    >
      <ResourceToggle id="floor-1" />
      <ResourceToggle id="garage" />
      <VisibleList />
      <RoomCalendar.ActiveView />
    </RoomCalendar.Root>,
  );
  harnesses.push(harness);
  return harness;
}

function columns(container: ParentNode): string[] {
  return [...container.querySelectorAll("[data-view] li")].map((item) => item.textContent ?? "");
}

async function click(container: ParentNode, id: string): Promise<void> {
  await act(async () =>
    container.querySelector<HTMLButtonElement>(`[data-toggle="${id}"]`)!.click(),
  );
}

test("a resource view projects the root's resources and their expansion", async () => {
  const { container } = await render({ defaultExpandedResourceIds: ["floor-1"] });

  // The multi-resource event shows in each of its rooms; the unassigned one gets the bucket.
  expect(columns(container)).toEqual([
    "floor-1:",
    "orchid:pairing",
    "lotus:pairing",
    "garage:",
    "unassigned:lunch",
  ]);
  expect(container.querySelector("[data-visible]")!.textContent).toBe(
    "floor-1,orchid,lotus,garage",
  );

  await click(container, "floor-1");

  expect(columns(container)).toEqual(["floor-1:", "garage:", "unassigned:lunch"]);
  expect(container.querySelector("[data-visible]")!.textContent).toBe("floor-1,garage");
  expect(container.querySelector('[data-toggle="floor-1"]')!.textContent).toBe("expand");
});

test("toggling a resource re-renders only that resource's subscribers", async () => {
  const { container } = await render();
  const before = new Map(renders);

  await click(container, "floor-1");

  expect(renders.get("floor-1")).toBeGreaterThan(before.get("floor-1")!);
  expect(renders.get("garage")).toBe(before.get("garage"));
  expect(columns(container)).toEqual([
    "floor-1:",
    "orchid:pairing",
    "lotus:pairing",
    "garage:",
    "unassigned:lunch",
  ]);
});

test("expansion follows a controlled expandedResourceIds and reports each request", async () => {
  const onExpandedResourceIdsChange = vi.fn();
  const harness = await render({ expandedResourceIds: [], onExpandedResourceIdsChange });

  await click(harness.container, "floor-1");

  expect(onExpandedResourceIdsChange).toHaveBeenCalledWith(
    ["floor-1"],
    expect.objectContaining({ controlled: true, previous: [], slice: "expandedResourceIds" }),
  );
  // The owner has not applied it yet.
  expect(columns(harness.container)).toEqual(["floor-1:", "garage:", "unassigned:lunch"]);
});

test("expand and collapse commands in one handler compose", async () => {
  let commands: ReturnType<typeof useResourceExpansion>[] = [];
  function Commands() {
    commands = [useResourceExpansion("floor-1"), useResourceExpansion("garage")];
    return null;
  }
  const harness = await renderWithHarness(
    <RoomCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      events={bookings}
      locale="en-US"
      resources={rooms}
      timeZone="UTC"
      weekRules={gateWeekRules}
    >
      <Commands />
      <VisibleList />
    </RoomCalendar.Root>,
  );
  harnesses.push(harness);

  await act(async () => {
    commands[0]!.expand();
    commands[1]!.toggle();
    commands[0]!.expand();
  });
  expect(commands.map(({ expanded }) => expanded)).toEqual([true, true]);
  expect(harness.container.querySelector("[data-visible]")!.textContent).toBe(
    "floor-1,orchid,lotus,garage",
  );

  await act(async () => commands[0]!.collapse());
  expect(commands.map(({ expanded }) => expanded)).toEqual([false, true]);
});

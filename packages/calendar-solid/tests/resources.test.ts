// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  resourceColumnsStrategy,
  type CalendarEvent,
  type CalendarResource,
  type CalendarWeekRules,
  type ResourceColumnsProjection,
} from "@moltenship/calendar-core";
import { createComponent, type JSX } from "@solidjs/web";
import { untrack } from "solid-js";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useResourceExpansion,
  useVisibleResources,
  type CalendarResourceExpansion,
  type CalendarViewRendererProps,
} from "../src";
import { keyedList } from "../src/flow";
import { element } from "../src/props";
import { mount, settled } from "./harness/render";
import "./setup";

type Booking = CalendarEvent<null, string, string>;
type RootProps = Parameters<typeof RoomCalendar.Root>[0];
type Options = { readonly unassigned: "bucket" | "hide" };

const Ol = element("ol");
const Li = element("li");
const Button = element("button");
const Output = element("output");

const weekRules: CalendarWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] };

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

type Projection = ResourceColumnsProjection<Booking>;

const columnsView = defineCalendarView({
  defaultOptions: { unassigned: "bucket" } as Options,
  name: "rooms",
  strategy: resourceColumnsStrategy<Options, Booking>({ count: 1, kind: "days" }),
  Renderer: (props: CalendarViewRendererProps<Projection, Options>) =>
    createComponent(Ol, {
      "data-view": "",
      get children() {
        return keyedList(
          () => props.projection.resources,
          (row: Projection["resources"][number]) =>
            createComponent(Li, {
              get children() {
                return `${row.resource.id ?? "unassigned"}:${row.days[0]!.events.map(
                  ({ fragment }) => fragment.event.id,
                ).join(",")}`;
              },
            }),
        );
      },
    }),
});

const RoomCalendar = createCalendar<Booking, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [columnsView],
});

/** How often each toggle's label was worked out again. */
const updates = new Map<string, number>();

function ResourceToggle(props: { readonly id: string }): JSX.Element {
  const id = untrack(() => props.id);
  const { expanded, toggle } = useResourceExpansion(id);
  return createComponent(Button, {
    "data-toggle": id,
    onClick: toggle,
    type: "button",
    get children() {
      updates.set(id, (updates.get(id) ?? 0) + 1);
      return expanded() ? "collapse" : "expand";
    },
  });
}

function VisibleList(): JSX.Element {
  const visible = useVisibleResources();
  return createComponent(Output, {
    "data-visible": "",
    get children() {
      return visible()
        .map(({ id }) => id)
        .join(",");
    },
  });
}

afterEach(() => {
  updates.clear();
  vi.restoreAllMocks();
});

function rootProps(props: Partial<RootProps>, children: () => JSX.Element): RootProps {
  return {
    defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
    events: bookings,
    locale: "en-US",
    resources: rooms,
    timeZone: "UTC",
    weekRules,
    ...props,
    get children() {
      return children();
    },
  } as RootProps;
}

async function render(props: Partial<RootProps> = {}) {
  const view = mount(() =>
    createComponent(
      RoomCalendar.Root,
      rootProps(props, () => [
        createComponent(ResourceToggle, { id: "floor-1" }),
        createComponent(ResourceToggle, { id: "garage" }),
        createComponent(VisibleList, {}),
        createComponent(RoomCalendar.ActiveView, {}),
      ]),
    ),
  );
  await settled();
  return view.container;
}

function columns(container: ParentNode): string[] {
  return [...container.querySelectorAll("[data-view] li")].map((item) => item.textContent ?? "");
}

async function click(container: ParentNode, id: string): Promise<void> {
  container.querySelector<HTMLButtonElement>(`[data-toggle="${id}"]`)!.click();
  await settled();
}

test("a resource view projects the root's resources and their expansion", async () => {
  const container = await render({ defaultExpandedResourceIds: ["floor-1"] });

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

test("toggling a resource updates only that resource's subscribers", async () => {
  const container = await render();
  const before = new Map(updates);

  await click(container, "floor-1");

  expect(updates.get("floor-1")).toBeGreaterThan(before.get("floor-1")!);
  expect(updates.get("garage")).toBe(before.get("garage"));
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
  const container = await render({ expandedResourceIds: [], onExpandedResourceIdsChange });

  await click(container, "floor-1");

  expect(onExpandedResourceIdsChange).toHaveBeenCalledWith(
    ["floor-1"],
    expect.objectContaining({ controlled: true, previous: [], slice: "expandedResourceIds" }),
  );
  // The owner has not applied it yet.
  expect(columns(container)).toEqual(["floor-1:", "garage:", "unassigned:lunch"]);
});

test("a toggle's click reaches the handler as a resource toggle, with the click behind it", async () => {
  const heard: string[] = [];
  const container = await render({
    onExpandedResourceIdsChange: (_next, detail) =>
      heard.push(`${detail.reason} ${detail.event?.type ?? "no-event"}`),
  });

  // `onClick={toggle}`, as the registry's headers pass it.
  await click(container, "floor-1");

  expect(heard).toEqual(["resource-toggle click"]);
});

test("expand and collapse commands in one handler compose", async () => {
  let commands: CalendarResourceExpansion[] = [];
  function Commands(): JSX.Element {
    commands = [useResourceExpansion("floor-1"), useResourceExpansion("garage")];
    return null;
  }
  const { container } = mount(() =>
    createComponent(
      RoomCalendar.Root,
      rootProps({}, () => [createComponent(Commands, {}), createComponent(VisibleList, {})]),
    ),
  );
  await settled();

  commands[0]!.expand();
  commands[1]!.toggle();
  commands[0]!.expand();
  await settled();
  expect(commands.map(({ expanded }) => expanded())).toEqual([true, true]);
  expect(container.querySelector("[data-visible]")!.textContent).toBe(
    "floor-1,orchid,lotus,garage",
  );

  commands[0]!.collapse();
  await settled();
  expect(commands.map(({ expanded }) => expanded())).toEqual([false, true]);
});

test("an expansion command ignores an argument that isn't a cause, as a switch's boolean", async () => {
  const heard: string[] = [];
  let commands: CalendarResourceExpansion | null = null;
  function Commands(): JSX.Element {
    commands = useResourceExpansion("floor-1");
    return null;
  }
  mount(() =>
    createComponent(
      RoomCalendar.Root,
      rootProps(
        {
          onExpandedResourceIdsChange: (next, detail) =>
            heard.push(`${next.join(",") || "none"} ${detail.reason} ${detail.source}`),
        },
        () => createComponent(Commands, {}),
      ),
    ),
  );
  await settled();

  // What `onCheckedChange={toggle}` and other callbacks hand over.
  const onCheckedChange: (checked: boolean) => void = commands!.toggle;
  onCheckedChange(true);
  await settled();
  commands!.collapse(null);
  await settled();
  commands!.expand("floor-1");
  await settled();
  commands!.collapse({ reason: 7, source: {} });
  await settled();

  expect(heard).toEqual([
    "floor-1 resource-toggle programmatic",
    "none resource-toggle programmatic",
    "floor-1 resource-toggle programmatic",
    "none resource-toggle programmatic",
  ]);
});

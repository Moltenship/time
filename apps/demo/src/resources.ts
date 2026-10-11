import type { CalendarResource } from "@moltenship/calendar";

interface DemoResourceData {
  /** Seats, for rooms. */
  readonly capacity?: number;
  readonly kind: "person" | "room" | "team";
}

/**
 * Bookable rooms at the top level, and people grouped under their team. Alex works from Los
 * Angeles and Lee from Bengaluru, so their hours follow those clocks.
 */
export const demoResources = [
  { data: { capacity: 8, kind: "room" }, id: "room-orchid", title: "Orchid" },
  { data: { capacity: 4, kind: "room" }, id: "room-lotus", title: "Lotus" },
  { data: { capacity: 14, kind: "room" }, id: "room-cedar", title: "Cedar" },
  { data: { kind: "team" }, id: "team-design", title: "Design" },
  { data: { kind: "person" }, id: "person-maya", parentId: "team-design", title: "Maya" },
  {
    data: { kind: "person" },
    id: "person-alex",
    parentId: "team-design",
    timeZone: "America/Los_Angeles",
    title: "Alex",
  },
  { data: { kind: "team" }, id: "team-engineering", title: "Engineering" },
  { data: { kind: "person" }, id: "person-sam", parentId: "team-engineering", title: "Sam" },
  {
    data: { kind: "person" },
    id: "person-lee",
    parentId: "team-engineering",
    timeZone: "Asia/Kolkata",
    title: "Lee",
  },
  { data: { kind: "person" }, id: "person-jordan", parentId: "team-engineering", title: "Jordan" },
] as const satisfies readonly CalendarResource<DemoResourceData>[];

export type DemoResource = CalendarResource<DemoResourceData, DemoResourceId>;
export type DemoResourceId = (typeof demoResources)[number]["id"];

/** The teams, which start expanded so their people show. */
export const demoResourceGroups: readonly DemoResourceId[] = ["team-design", "team-engineering"];

export function isDemoResourceId(value: unknown): value is DemoResourceId {
  return demoResources.some((resource) => resource.id === value);
}

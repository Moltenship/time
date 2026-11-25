import type { CalendarResource } from "@moltenship/calendar-core";

export interface DemoResourceData {
  readonly kind: "person" | "room" | "team";
}

/**
 * The rooms and people the resource views show: rooms at the top level, and people under their
 * team. Alex works from Los Angeles and Lee from Bengaluru, so their headers show their own clocks.
 * A small set of the React demo's (apps/demo/src/resources.ts).
 */
export const demoResources: readonly CalendarResource<DemoResourceData>[] = [
  { data: { kind: "room" }, id: "room-orchid", title: "Orchid" },
  { data: { kind: "room" }, id: "room-lotus", title: "Lotus" },
  { data: { kind: "room" }, id: "room-cedar", title: "Cedar" },
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
];

/** The teams, which start expanded so their people show. */
export const demoResourceGroups: readonly string[] = ["team-design", "team-engineering"];

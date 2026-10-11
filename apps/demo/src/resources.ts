import type { CalendarResource } from "@moltenship/calendar";

interface DemoResourceData {
  /** Seats, for rooms. */
  readonly capacity?: number;
  readonly kind: "person" | "room" | "team";
}

const room = <const TId extends string>(id: TId, title: string, capacity: number) =>
  ({ data: { capacity, kind: "room" }, id, title }) as const;
const person = <const TId extends string, const TTeam extends string>(
  id: TId,
  parentId: TTeam,
  title: string,
) => ({ data: { kind: "person" }, id, parentId, title }) as const;

/**
 * Bookable rooms at the top level, and people grouped under their team: 31 in all, so booking a
 * meeting has many people and rooms to check. Alex works from Los Angeles, Lee from Bengaluru and
 * Inès from Paris, so their hours follow those clocks.
 */
export const demoResources = [
  room("room-orchid", "Orchid", 8),
  room("room-lotus", "Lotus", 4),
  room("room-cedar", "Cedar", 14),
  room("room-maple", "Maple", 6),
  room("room-birch", "Birch", 2),
  room("room-willow", "Willow", 10),
  room("room-aspen", "Aspen", 4),
  room("room-juniper", "Juniper", 20),
  { data: { kind: "team" }, id: "team-design", title: "Design" },
  person("person-maya", "team-design", "Maya"),
  {
    data: { kind: "person" },
    id: "person-alex",
    parentId: "team-design",
    timeZone: "America/Los_Angeles",
    title: "Alex",
  },
  person("person-noor", "team-design", "Noor"),
  person("person-kai", "team-design", "Kai"),
  person("person-zoe", "team-design", "Zoe"),
  person("person-ravi", "team-design", "Ravi"),
  { data: { kind: "team" }, id: "team-engineering", title: "Engineering" },
  person("person-sam", "team-engineering", "Sam"),
  {
    data: { kind: "person" },
    id: "person-lee",
    parentId: "team-engineering",
    timeZone: "Asia/Kolkata",
    title: "Lee",
  },
  person("person-jordan", "team-engineering", "Jordan"),
  person("person-mia", "team-engineering", "Mia"),
  person("person-omar", "team-engineering", "Omar"),
  person("person-ivy", "team-engineering", "Ivy"),
  person("person-theo", "team-engineering", "Theo"),
  person("person-yuki", "team-engineering", "Yuki"),
  { data: { kind: "team" }, id: "team-sales", title: "Sales" },
  person("person-ana", "team-sales", "Ana"),
  person("person-ben", "team-sales", "Ben"),
  person("person-cleo", "team-sales", "Cleo"),
  {
    data: { kind: "person" },
    id: "person-ines",
    parentId: "team-sales",
    timeZone: "Europe/Paris",
    title: "Inès",
  },
  person("person-leo", "team-sales", "Leo"),
  person("person-rosa", "team-sales", "Rosa"),
] as const satisfies readonly CalendarResource<DemoResourceData>[];

export type DemoResource = CalendarResource<DemoResourceData, DemoResourceId>;
export type DemoResourceId = (typeof demoResources)[number]["id"];

/** The teams, which start expanded so their people show. */
export const demoResourceGroups: readonly DemoResourceId[] = [
  "team-design",
  "team-engineering",
  "team-sales",
];

export function isDemoResourceId(value: unknown): value is DemoResourceId {
  return demoResources.some((resource) => resource.id === value);
}

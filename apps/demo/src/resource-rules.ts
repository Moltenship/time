import type { ConflictMode, OverlapLayout } from "@moltenship/calendar";

import { demoResources, type DemoResource, type DemoResourceId } from "./resources";

/**
 * The resource columns' layout under the "Rooms and people" setting: a room stacks its bookings,
 * so a busy room stays readable at a glance, and a person's events sit side by side. Teams keep
 * the "Overlapping events" setting.
 */
export function demoResourceOverlapLayout(resource: DemoResource): OverlapLayout | undefined {
  switch (resource.data.kind) {
    case "room":
      return "stack";
    case "person":
      return "columns";
    case "team":
      return undefined;
  }
}

const kinds = new Map<DemoResourceId, DemoResource["data"]["kind"]>(
  demoResources.map(({ data, id }) => [id, data.kind]),
);

/**
 * What double-booking does under the "Rooms and people" setting: a room can't be double-booked,
 * and a person can, with a warning. Teams keep the warning.
 */
export function demoResourceConflictMode(resourceId: DemoResourceId): ConflictMode | undefined {
  switch (kinds.get(resourceId)) {
    case "room":
      return "block";
    case "person":
      return "warn";
    default:
      return undefined;
  }
}

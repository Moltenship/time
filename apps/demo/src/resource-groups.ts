import {
  fitsAvailability,
  useBusyResources,
  useCalendarAvailability,
  type CalendarEventInterval,
} from "@moltenship/calendar";

import { demoResources, type DemoResourceId } from "./resources";

/** Rooms and people, without the teams that group them. */
const bookable = demoResources.filter(({ data }) => data.kind !== "team");

/**
 * What a "find a room" picker shows, built on `useBusyResources` rather than shipped as a part:
 * rooms and people split into Available and Busy at the event's time, free first, those inside
 * their hours first within a group, with the events keeping them busy.
 */
export function useResourceGroups(interval: CalendarEventInterval | null, eventId?: string) {
  const busy = useBusyResources(interval, { exclude: eventId });
  const availability = useCalendarAvailability();
  const outsideHours = (resourceId: DemoResourceId) =>
    interval !== null &&
    !fitsAvailability(
      { ...interval, resourceIds: [] },
      availability.forResource(resourceId),
      availability.timeZone,
    );
  return [
    { busy: false, title: "Available" },
    { busy: true, title: "Busy" },
  ].flatMap(({ busy: isBusy, title }) => {
    const members = bookable
      .filter((resource) => busy.has(resource.id) === isBusy)
      // Within a group, those inside their hours first.
      .toSorted((left, right) => Number(outsideHours(left.id)) - Number(outsideHours(right.id)))
      .map((resource) => ({
        events: busy.get(resource.id) ?? [],
        outsideHours: outsideHours(resource.id),
        resource,
      }));
    return members.length === 0 ? [] : [{ members, title }];
  });
}

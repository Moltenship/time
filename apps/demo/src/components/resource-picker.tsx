import {
  fitsAvailability,
  useBusyResources,
  useCalendarAvailability,
  type CalendarEventInterval,
} from "@moltenship/calendar";
import { useId } from "react";

import { Badge } from "@registry/ui/badge";
import { Checkbox } from "@registry/ui/checkbox";
import { Label } from "@registry/ui/label";

import { demoResources, type DemoResourceId } from "../resources";

/** Rooms and people, without the teams that group them. */
const bookable = demoResources.filter(({ data }) => data.kind !== "team");

export interface ResourcePickerProps {
  /** The event's time; without one, nothing says who's busy. */
  readonly interval: CalendarEventInterval | null;
  /** The event being edited, which never conflicts with itself. */
  readonly eventId?: string;
  readonly onChange: (resourceIds: readonly DemoResourceId[]) => void;
  readonly value: readonly DemoResourceId[];
}

/**
 * A "find a room" picker, built on `useBusyResources` rather than shipped as a part: rooms and
 * people split into Available and Busy at the event's time, free first. Busy ones stay
 * selectable, since a double booking can be on purpose, and say so in words; so does a time
 * outside someone's hours.
 */
export function ResourcePicker({ eventId, interval, onChange, value }: ResourcePickerProps) {
  const id = useId();
  const busy = useBusyResources(interval, { exclude: eventId });
  const availability = useCalendarAvailability();
  const outsideHours = (resourceId: DemoResourceId) =>
    interval !== null &&
    !fitsAvailability(
      { ...interval, resourceIds: [] },
      availability.forResource(resourceId),
      availability.timeZone,
    );
  const groups = [
    { busy: false, title: "Available" },
    { busy: true, title: "Busy" },
  ] as const;

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Rooms and people</legend>
      <div className="grid max-h-56 gap-3 overflow-y-auto rounded-lg border p-2">
        {groups.map((group) => {
          const members = bookable
            .filter((resource) => busy.has(resource.id) === group.busy)
            // Within a group, those inside their hours first.
            .toSorted(
              (left, right) => Number(outsideHours(left.id)) - Number(outsideHours(right.id)),
            );
          if (members.length === 0) return null;
          const heading = `${id}-${group.title}`;
          return (
            <div key={group.title} role="group" aria-labelledby={heading} className="grid gap-1">
              <div id={heading} className="px-1 text-xs font-medium text-muted-foreground">
                {group.title}
              </div>
              {members.map((resource) => {
                const events = busy.get(resource.id) ?? [];
                return (
                  <Label
                    key={resource.id}
                    className="flex items-center gap-2 rounded-md px-1 py-1 font-normal hover:bg-muted"
                  >
                    <Checkbox
                      checked={value.includes(resource.id)}
                      onCheckedChange={(checked) =>
                        onChange(
                          checked === true
                            ? [...value, resource.id]
                            : value.filter((other) => other !== resource.id),
                        )
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {resource.title}
                      {resource.data.kind === "room" && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {resource.data.capacity} seats
                        </span>
                      )}
                    </span>
                    {events.length > 0 && (
                      <Badge
                        title={events.map((event) => event.title).join(", ")}
                        variant="outline"
                      >
                        Busy
                      </Badge>
                    )}
                    {outsideHours(resource.id) && <Badge variant="outline">Outside hours</Badge>}
                  </Label>
                );
              })}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

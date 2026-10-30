import type { CalendarEventInterval } from "@moltenship/calendar";
import { useId } from "react";

import { Badge } from "@registry/ui/badge";
import { Checkbox } from "@registry/ui/checkbox";
import { Label } from "@registry/ui/label";

import { useResourceGroups } from "../resource-groups";
import type { DemoResourceId } from "../resources";

export interface ResourcePickerProps {
  /** The event's time; without one, nothing says who's busy. */
  readonly interval: CalendarEventInterval | null;
  /** The event being edited, which never conflicts with itself. */
  readonly eventId?: string;
  readonly onChange: (resourceIds: readonly DemoResourceId[]) => void;
  readonly value: readonly DemoResourceId[];
}

/**
 * A "find a room" picker. Busy ones stay selectable, since a double booking can be on purpose, and
 * say so in words; so does a time outside someone's hours. When "Rooms and people" blocks
 * double-booking rooms, saving with a busy room says so instead.
 */
export function ResourcePicker({ eventId, interval, onChange, value }: ResourcePickerProps) {
  const id = useId();
  const groups = useResourceGroups(interval, eventId);

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Rooms and people</legend>
      <div className="grid max-h-56 gap-3 overflow-y-auto rounded-lg border p-2">
        {groups.map((group) => {
          const heading = `${id}-${group.title}`;
          return (
            <div key={group.title} role="group" aria-labelledby={heading} className="grid gap-1">
              <div id={heading} className="px-1 text-xs font-medium text-muted-foreground">
                {group.title}
              </div>
              {group.members.map(({ events, outsideHours, resource }) => {
                return (
                  <Label
                    key={resource.id}
                    className="group/resource flex items-center gap-2 rounded-md px-1 py-1 font-normal hover:bg-muted"
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
                        // Muted on the hover fill falls short of 4.5:1.
                        <span className="text-muted-foreground group-hover/resource:text-foreground">
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
                    {outsideHours && <Badge variant="outline">Outside hours</Badge>}
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

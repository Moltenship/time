import { Badge } from "@registry/calendar-ui/badge";
import {
  useBusyResources,
  useCalendarAvailability,
  type CalendarEventInterval,
} from "@moltenship/calendar-solid";
import { createMemo, createUniqueId, For, Show } from "solid-js";

import { resourceGroups } from "@demo/resource-groups";
import type { DemoResourceId } from "@demo/resources";

import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";

const capacityOf = (data: object) =>
  "capacity" in data && typeof data.capacity === "number" ? data.capacity : undefined;

/**
 * A "find a room" picker, as in React, on `useBusyResources`. Busy ones stay selectable, since a
 * double booking can be on purpose, and say so in words; so does a time outside someone's hours.
 */
export function ResourcePicker(props: {
  /** The event being edited, which never conflicts with itself. */
  readonly eventId?: string;
  /** The event's time; without one, nothing says who's busy. */
  readonly interval: CalendarEventInterval | null;
  readonly onChange: (resourceIds: readonly DemoResourceId[]) => void;
  readonly value: readonly DemoResourceId[];
}) {
  const id = createUniqueId();
  const busy = useBusyResources(
    () => props.interval,
    () => ({ exclude: props.eventId }),
  );
  const availability = useCalendarAvailability();
  const groups = createMemo(() => resourceGroups(busy(), availability(), props.interval));

  return (
    <fieldset class="grid gap-2">
      <legend class="mb-2 text-sm font-medium">Rooms and people</legend>
      <div class="grid max-h-56 gap-3 overflow-y-auto rounded-lg border p-2">
        <For each={groups()} keyed={(group) => group.title}>
          {(group) => {
            const heading = () => `${id}-${group().title}`;
            return (
              <div role="group" aria-labelledby={heading()} class="grid gap-1">
                <div id={heading()} class="px-1 text-xs font-medium text-muted-foreground">
                  {group().title}
                </div>
                <For each={group().members} keyed={(member) => member.resource.id}>
                  {(member) => (
                    <Label class="group/resource flex items-center gap-2 rounded-md px-1 py-1 font-normal hover:bg-muted">
                      <Checkbox
                        checked={props.value.includes(member().resource.id)}
                        onCheckedChange={(checked) =>
                          props.onChange(
                            checked
                              ? [...props.value, member().resource.id]
                              : props.value.filter((other) => other !== member().resource.id),
                          )
                        }
                      />
                      <span class="min-w-0 flex-1 truncate">
                        {member().resource.title}
                        <Show when={capacityOf(member().resource.data)}>
                          {(capacity) => (
                            // Muted on the hover fill falls short of 4.5:1.
                            <span class="text-muted-foreground group-hover/resource:text-foreground">
                              {" "}
                              · {capacity()} seats
                            </span>
                          )}
                        </Show>
                      </span>
                      <Show when={member().events.length > 0}>
                        <Badge
                          title={member()
                            .events.map((event) => event.title)
                            .join(", ")}
                          variant="outline"
                        >
                          Busy
                        </Badge>
                      </Show>
                      <Show when={member().outsideHours}>
                        <Badge variant="outline">Outside hours</Badge>
                      </Show>
                    </Label>
                  )}
                </For>
              </div>
            );
          }}
        </For>
      </div>
    </fieldset>
  );
}

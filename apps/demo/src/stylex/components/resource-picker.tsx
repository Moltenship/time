import type { CalendarEventInterval } from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";

import { Badge } from "@registry/stylex-calendar-ui/badge";

import { useResourceGroups } from "../../use-resource-groups";
import type { DemoResourceId } from "../../resources";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/field";

const styles = stylex.create({
  fieldset: {
    display: "grid",
    gap: "0.5rem",
  },
  legend: {
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: "calc(1.25 / 0.875)",
    marginBottom: "0.5rem",
  },
  list: {
    borderColor: "var(--border)",
    borderRadius: "var(--radius)",
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gap: "0.75rem",
    maxHeight: "14rem",
    overflowY: "auto",
    padding: "0.5rem",
  },
  group: {
    display: "grid",
    gap: "0.25rem",
  },
  groupTitle: {
    color: "var(--muted-foreground)",
    fontSize: "0.75rem",
    fontWeight: 500,
    lineHeight: "calc(1 / 0.75)",
    paddingInline: "0.25rem",
  },
  resource: {
    backgroundColor: { default: null, ":hover": "var(--muted)" },
    borderRadius: "calc(var(--radius) * 0.8)",
    fontWeight: 400,
    paddingBlock: "0.25rem",
    paddingInline: "0.25rem",
  },
  name: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  // Muted on the hover fill falls short of 4.5:1.
  seats: {
    color: {
      default: "var(--muted-foreground)",
      [stylex.when.ancestor(":hover")]: "var(--foreground)",
    },
  },
});

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
    <fieldset {...stylex.props(styles.fieldset)}>
      <legend {...stylex.props(styles.legend)}>Rooms and people</legend>
      <div {...stylex.props(styles.list)}>
        {groups.map((group) => {
          const heading = `${id}-${group.title}`;
          return (
            <div
              key={group.title}
              aria-labelledby={heading}
              role="group"
              {...stylex.props(styles.group)}
            >
              <div id={heading} {...stylex.props(styles.groupTitle)}>
                {group.title}
              </div>
              {group.members.map(({ events, outsideHours, resource }) => (
                <Label key={resource.id} xstyle={[styles.resource, stylex.defaultMarker()]}>
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
                  <span {...stylex.props(styles.name)}>
                    {resource.title}
                    {resource.data.kind === "room" && (
                      <span {...stylex.props(styles.seats)}> · {resource.data.capacity} seats</span>
                    )}
                  </span>
                  {events.length > 0 && (
                    <Badge title={events.map((event) => event.title).join(", ")} variant="outline">
                      Busy
                    </Badge>
                  )}
                  {outsideHours && <Badge variant="outline">Outside hours</Badge>}
                </Label>
              ))}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

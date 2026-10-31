import { Badge } from "@astryxdesign/core/Badge";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Text } from "@astryxdesign/core/Text";
import type { CalendarEventInterval } from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";

import { useResourceGroups } from "../../resource-groups";
import type { DemoResourceId } from "../../resources";

const styles = stylex.create({
  field: {
    display: "grid",
    gap: "0.5rem",
    minWidth: 0,
  },
  group: {
    display: "grid",
    gap: "0.25rem",
  },
  groups: {
    borderColor: calendarVars["--border"],
    borderRadius: "var(--radius)",
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gap: "0.75rem",
    maxHeight: "14rem",
    overflowY: "auto",
    padding: "0.5rem",
  },
  legend: {
    paddingBlockEnd: "0.5rem",
  },
  resource: {
    alignItems: "center",
    display: "flex",
    gap: "0.5rem",
    justifyContent: "space-between",
    minHeight: "1.75rem",
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
    <fieldset {...stylex.props(styles.field)}>
      <legend {...stylex.props(styles.legend)}>
        <Text type="label">Rooms and people</Text>
      </legend>
      <div {...stylex.props(styles.groups)}>
        {groups.map((group) => {
          const heading = `${id}-${group.title}`;
          return (
            <div
              key={group.title}
              role="group"
              aria-labelledby={heading}
              {...stylex.props(styles.group)}
            >
              <Text id={heading} type="supporting">
                {group.title}
              </Text>
              {group.members.map(({ events, outsideHours, resource }) => (
                <div key={resource.id} {...stylex.props(styles.resource)}>
                  <CheckboxInput
                    label={
                      resource.data.kind === "room"
                        ? `${resource.title} · ${resource.data.capacity} seats`
                        : resource.title
                    }
                    onChange={(checked) =>
                      onChange(
                        checked
                          ? [...value, resource.id]
                          : value.filter((other) => other !== resource.id),
                      )
                    }
                    size="sm"
                    value={value.includes(resource.id)}
                  />
                  {events.length > 0 && (
                    <span title={events.map((event) => event.title).join(", ")}>
                      <Badge label="Busy" variant="warning" />
                    </span>
                  )}
                  {outsideHours && <Badge label="Outside hours" />}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

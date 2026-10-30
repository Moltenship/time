import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import * as stylex from "@stylexjs/stylex";
import { useId } from "react";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import { eventColorStyles } from "@registry/stylex-calendar-theme/event-color-styles";

import { demoAnnotationSources, type DemoAnnotationSourceId } from "../../annotations";
import { listProps, SectionHeading } from "./section";

const styles = stylex.create({
  icon: {
    color: calendarVars["--calendar-event-border"],
    height: "1rem",
    width: "1rem",
  },
});

export interface ActivityListProps {
  readonly hidden: ReadonlySet<DemoAnnotationSourceId>;
  readonly onToggle: (sourceId: DemoAnnotationSourceId) => void;
}

/** The annotation sources, shown or hidden like calendars. */
export function ActivityList({ hidden, onToggle }: ActivityListProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <SectionHeading id={headingId}>Activity</SectionHeading>
      <ul {...listProps}>
        {demoAnnotationSources.map((source) => (
          <li key={source.id}>
            <CheckboxInput
              label={source.label}
              labelIcon={
                <source.Icon
                  aria-hidden
                  data-color={source.color}
                  {...stylex.props(styles.icon, eventColorStyles[source.color])}
                />
              }
              onChange={() => onToggle(source.id)}
              value={!hidden.has(source.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

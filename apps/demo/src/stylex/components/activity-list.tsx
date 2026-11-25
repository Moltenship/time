import * as stylex from "@stylexjs/stylex";
import { useId } from "react";

import { eventColorStyles } from "@registry/stylex-calendar-theme/event-color-styles";

import { demoAnnotationSources, type DemoAnnotationSourceId } from "../../annotations";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/field";
import { sectionStyles } from "./section";

const styles = stylex.create({
  icon: {
    color: "var(--muted-foreground)",
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
      <h2 id={headingId} {...stylex.props(sectionStyles.heading)}>
        Activity
      </h2>
      <ul>
        {demoAnnotationSources.map((source) => (
          <li key={source.id}>
            <Label xstyle={sectionStyles.row}>
              <Checkbox
                checked={!hidden.has(source.id)}
                colored
                data-color={source.color}
                onCheckedChange={() => onToggle(source.id)}
                xstyle={eventColorStyles[source.color]}
              />
              <source.Icon aria-hidden {...stylex.props(styles.icon)} />
              {source.label}
            </Label>
          </li>
        ))}
      </ul>
    </section>
  );
}

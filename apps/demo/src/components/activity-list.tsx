import { useId } from "react";

import { Checkbox } from "@registry/ui/checkbox";
import { Label } from "@registry/ui/label";

import { demoAnnotationSources, type DemoAnnotationSourceId } from "../annotations";

export interface ActivityListProps {
  readonly hidden: ReadonlySet<DemoAnnotationSourceId>;
  readonly onToggle: (sourceId: DemoAnnotationSourceId) => void;
}

/** The annotation sources, shown or hidden like calendars. */
export function ActivityList({ hidden, onToggle }: ActivityListProps) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="px-2 pb-1 text-sm font-medium">
        Activity
      </h2>
      <ul>
        {demoAnnotationSources.map((source) => (
          <li key={source.id}>
            <Label className="h-8 cursor-pointer gap-3 rounded-md px-2 font-normal hover:bg-accent">
              <Checkbox
                checked={!hidden.has(source.id)}
                className="border-2 border-calendar-event-border data-checked:border-calendar-event-border data-checked:bg-calendar-event-border data-checked:text-background dark:data-checked:bg-calendar-event-border"
                data-color={source.color}
                onCheckedChange={() => onToggle(source.id)}
              />
              <source.Icon aria-hidden className="size-4 text-muted-foreground" />
              {source.label}
            </Label>
          </li>
        ))}
      </ul>
    </section>
  );
}

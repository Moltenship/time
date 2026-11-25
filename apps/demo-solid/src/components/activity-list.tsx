import { createUniqueId, For } from "solid-js";

import type { DemoAnnotationSourceId } from "@demo/annotations";

import { activitySources } from "../activity";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";

/** The annotation sources, shown or hidden like calendars. */
export function ActivityList(props: {
  readonly hidden: ReadonlySet<DemoAnnotationSourceId>;
  readonly onToggle: (sourceId: DemoAnnotationSourceId) => void;
}) {
  const headingId = createUniqueId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} class="px-2 pb-1 text-sm font-medium">
        Activity
      </h2>
      <ul>
        <For each={activitySources}>
          {(source) => (
            <li>
              <Label class="h-8 cursor-pointer gap-3 rounded-md px-2 font-normal hover:bg-accent">
                <Checkbox
                  checked={!props.hidden.has(source.id)}
                  class="border-2 border-calendar-event-border data-checked:border-calendar-event-border data-checked:bg-calendar-event-border data-checked:text-background dark:data-checked:bg-calendar-event-border"
                  data-color={source.color}
                  onCheckedChange={() => props.onToggle(source.id)}
                />
                <source.Icon class="size-4 text-muted-foreground" />
                {source.label}
              </Label>
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}

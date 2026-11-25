// Interactions' two drag previews, on the Month page's calendar: a button for each sets the
// month's `dragPreview` option.

// #region drag-preview
import { createSignal, For } from "solid-js";

import { Button } from "@/components/calendar/ui/button";

import { applyChange, seed } from "./month-events";
import { Calendar } from "./month-page";

const previews = [
  { label: "Snapped", value: "snapped" },
  { label: "Free", value: "free" },
] as const;

export default function DragPreviewPage() {
  const [events, setEvents] = createSignal(seed);
  const [dragPreview, setDragPreview] = createSignal<"free" | "snapped">("snapped");
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      defaultView="month"
      events={events()}
      locale="en-US"
      onEventChange={(change) => {
        setEvents((current) => applyChange(current, change));
      }}
      viewOptions={{ month: { dragPreview: dragPreview() } }}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.Frame class="flex h-dvh flex-col">
        <div aria-label="Drag preview" class="flex items-center gap-2 border-b p-3" role="group">
          <For each={previews}>
            {(preview) => (
              <Button
                aria-pressed={dragPreview() === preview.value ? "true" : "false"}
                onClick={() => {
                  setDragPreview(preview.value);
                }}
                size="sm"
                variant={dragPreview() === preview.value ? "default" : "outline"}
              >
                {preview.label}
              </Button>
            )}
          </For>
        </div>
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion drag-preview

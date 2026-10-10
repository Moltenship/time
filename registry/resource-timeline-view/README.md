# Resource timeline view

Resources as rows and days as columns, for a week or a month, built on the resource model in
`@moltenship/calendar`.

```tsx
import {
  createTimelineMonthView,
  createTimelineWeekView,
} from "@/components/calendar/resource-timeline-view/resource-timeline-view";

const views = [
  createTimelineWeekView<Booking>({ getEventColor: (booking) => booking.color }),
  createTimelineMonthView<Booking>({ unassigned: "bucket" }),
] as const;

<Calendar.Root resources={rooms} defaultExpandedResourceIds={["floor-1"]} …>
```

- Rows are the root's `resources`, nested by `parentId` and indented by depth. A group's toggle
  (`aria-expanded`) expands or collapses it through `useResourceExpansion`, which updates the
  root's `expandedResourceIds`. `unassigned: "bucket"` adds an "Unassigned" row for events with no
  resources; by default they are hidden.
- Events are bars packed into lanes, laid out like a month row: a timed event within one day shows
  its title and then, if there's room, its start time; longer events span their days, and ends cut off by the range are
  squared. Rows grow to fit their lanes. An event with several resources shows in each of their
  rows, and its accessible name ends with the row's resource.
- The header is sticky: days under their month, with today highlighted and weekends tinted. A
  now-line crosses today at the current time.
- The resource column is sticky at the inline start. Days share the width it leaves, down to
  48px; past that the timeline scrolls sideways. The column narrows on phones.
- Only the rows and days in view render, plus a few beyond: two TanStack Virtual virtualizers
  share the one scrolling viewport (`use-timeline-virtualizer.ts`). At 1024 × 640, 500 resources
  over a month render 18 rows of 19 days.
- The server and the first client render lay out against a fixed 1024 × 640 viewport, so markup
  hydrates without a mismatch; the real size takes over once the browser measures it.
- ARIA: a `grid` whose header row has a column header per day, and a row per resource named by
  the resource, with a row header and a cell per day ("Room 101, Monday, October 5, 2026, 2
  events"). `aria-rowcount`, `aria-colcount` and the indexes count every resource and day, not
  just the rendered ones.
- RTL: pass `direction="rtl"` to `Root`. The time axis runs from the right, and switching
  direction keeps the same days in view.

Pointer hooks for `@moltenship/calendar-dnd`: each row carries `resourceIdAttributes(resource.id)`,
each day cell carries `data-date`, events are buttons with `data-event-id`, and editable events
have `data-resize="start"` and `data-resize="end"` handles. Dragging a bar moves it by whole days,
keeping its time, and onto another row swaps that resource into its `resourceIds`; dragging its
ends resizes it by days; dragging across empty days creates an all-day event in that row.

## Why the axes are sticky, not synchronized

The spike behind ADR 0020 kept the header and resource column in sibling scrollers and copied
the viewport's offsets to them every frame. Here they are `position: sticky` inside the one
viewport instead:

- a row's header cell sits inside its `role="row"`, as the grid pattern requires;
- the browser moves sticky elements with the scroll itself, so the axes never trail the content.

ADR 0020 kept the axes out of the virtual canvas because transforms on virtual items break sticky
positioning. Rows and days here are placed with `top` and `inset-inline-start`, never transforms,
so sticky elements inside them still stick to the viewport.

# Resource timeline view

Resources as rows and time as columns: a day in hours, or a week or a month in days. Built on
`resourceTimelineStrategy` and the resource model in `@moltenship/calendar`.

```tsx
import {
  createTimelineDayView,
  createTimelineMonthView,
  createTimelineWeekView,
} from "@/components/calendar/resource-timeline-view/resource-timeline-view";

const views = [
  createTimelineDayView<Booking>({ getEventColor: (booking) => booking.color }),
  createTimelineWeekView<Booking>({ getEventColor: (booking) => booking.color }),
  createTimelineMonthView<Booking>({ unassigned: "bucket" }),
] as const;

<Calendar.Root resources={rooms} defaultExpandedResourceIds={["floor-1"]} …>
```

- Rows are the root's `resources`, nested by `parentId` and indented by depth. A group's toggle
  (`aria-expanded`) expands or collapses it through `useResourceExpansion`, which updates the
  root's `expandedResourceIds`. `unassigned: "bucket"` adds an "Unassigned" row for events with no
  resources; by default they are hidden.
- Events are bars packed into lanes, and rows grow to fit them. Over days they're laid out like a
  month row: a timed event within one day shows its title and then, if there's room, its start
  time; longer events span their days. Over hours a bar spans its exact times. Ends cut off by the
  range are squared. An event with several resources shows in each of their rows, and its
  accessible name ends with the row's resource. `slotUnit: "hour"` or `"day"` overrides the
  default: hours for one day, days for longer ranges.
- The header is sticky: hours under their date, or days under their month, with today
  highlighted and weekends tinted. A now-line crosses today at the current time, and a day in
  hours opens scrolled to it (or to 08:00 when today isn't shown). Hours a clock change skips are
  hatched and hours it repeats are tinted.
- The resource column is sticky at the inline start. Slots share the width it leaves, down to
  56px for an hour and 48px for a day; past that the timeline scrolls sideways. The column
  narrows on phones.
- Only the rows and slots in view render, plus a few beyond and the focused ones: two TanStack
  Virtual virtualizers share the one scrolling viewport (`use-timeline-virtualizer.ts`). At
  1024 × 640, 500 resources over a month render 18 rows of 19 days.
- The server and the first client render lay out against a fixed 1024 × 640 viewport, so markup
  hydrates without a mismatch; the real size takes over once the browser measures it.
- Keyboard: the grid is one tab stop, entered on today in the first row. ←/→ move along the row
  by a day or half an hour, ↑/↓ to the same time in the next row, Home/End to the range's ends,
  Page Up/Down by a range, Enter into the events of a cell (Escape back out), and on an event
  ←/→ walk the row's events. Space picks an event up to move it, also across rows (Shift+Space
  to resize), or drafts a new one on the cell. Shift+Enter on a group's cell expands or collapses
  it. Focus is the calendar's focus, a resource and a time, so it survives virtualization: the
  entry and the focused row and slot always render, so there's always a tab stop, and the browser
  scrolls them into view clear of the sticky header and column (`scroll-padding`). Focus from a
  view without resources lands on the first row, and a time grid's slot becomes its whole day in
  a timeline of days.
- ARIA: a `grid` whose header row has a column header per slot, and a row per resource named by
  the resource, with a row header and a cell per slot ("Room 101, Monday, October 5, 2026, 2
  events"). `aria-rowcount`, `aria-colcount` and the indexes count every resource and slot, not
  just the rendered ones.
- RTL: pass `direction="rtl"` to `Root`. The time axis runs from the right, the arrow keys follow
  it, and switching direction keeps the same time in view.

Pointer hooks for `@moltenship/calendar-dnd`: each row carries `resourceIdAttributes(resource.id)`.
Over days, each day cell has an inner `data-date` beside the bars, so a bar grabbed by a later
day moves from that day; drags step whole days and keep the time. Over hours, each row has a
`data-axis="inline"` strip per date with `data-date`, mapped through the projection's `columns`;
drags step by half an hour. Events are buttons with `data-event-id`, and editable events have
`data-resize="start"` and `data-resize="end"` handles. Dropping on another row swaps that
resource into the event's `resourceIds`. The sticky header and each row's name carry
`data-occludes`, so a drag can't start on, or land in, the cells scrolled beneath them.

## Why the axes are sticky, not synchronized

The spike behind ADR 0020 kept the header and resource column in sibling scrollers and copied
the viewport's offsets to them every frame. Here they are `position: sticky` inside the one
viewport instead:

- a row's header cell sits inside its `role="row"`, as the grid pattern requires;
- the browser moves sticky elements with the scroll itself, so the axes never trail the content.

ADR 0020 kept the axes out of the virtual canvas because transforms on virtual items break sticky
positioning. Rows and slots here are placed with `top` and `inset-inline-start`, never transforms,
so sticky elements inside them still stick to the viewport.

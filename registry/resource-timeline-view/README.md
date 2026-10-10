# Resource timeline view

Resources as rows and time as columns, for a day, a week or a month. This first part is the grid
the view renders into; the view definition, events and interactions arrive with the resource
projection from #39.

```tsx
import { ResourceTimelineGrid } from "@/components/calendar/resource-timeline-view/resource-timeline-grid";

<ResourceTimelineGrid
  environment={environment}
  label="Oct 5 – 11, 2026"
  onToggleResource={(resourceId) => toggle(resourceId)}
  range={range}
  rows={[
    { depth: 0, expanded: true, id: "floor-1", title: "Floor 1" },
    { depth: 1, id: "room-101", title: "Room 101" },
  ]}
  today={today}
/>;
```

- The header is sticky. A day shows its 24 nominal wall-clock hours under the date; a week or a
  month shows its days under the month, with today highlighted and weekends tinted.
- The resource column is sticky at the inline start. Rows indent by depth, and a group's toggle
  (`aria-expanded`) calls `onToggleResource`.
- Slots share the width the resource column leaves, down to 56px for an hour and 48px for a day;
  past that the timeline scrolls sideways. The column narrows on phones.
- Only the rows and slots in view render, plus a few beyond: two TanStack Virtual virtualizers
  share the one scrolling viewport (`use-timeline-virtualizer.ts`). At 1024 × 640, 500 resources
  over a month render 18 rows of 19 days.
- The server and the first client render lay out against a fixed 1024 × 640 viewport, so markup
  hydrates without a mismatch; the real size takes over once the browser measures it.
- ARIA: a `grid` whose header row has a column header per slot, and a row per resource named by
  the resource, with a row header and a cell per slot. `aria-rowcount`, `aria-colcount` and the
  rows' and cells' indexes count every resource and slot, not just the rendered ones.
- RTL: pass `direction: "rtl"` in the calendar environment. The time axis runs from the right,
  and switching direction keeps the same time in view.

## Why the axes are sticky, not synchronized

The spike behind ADR 0020 kept the header and resource column in sibling scrollers and copied
the viewport's offsets to them every frame. Here they are `position: sticky` inside the one
viewport instead:

- a row's header cell sits inside its `role="row"`, as the grid pattern requires;
- the browser moves sticky elements with the scroll itself, so the axes never trail the content.

ADR 0020 kept the axes out of the virtual canvas because transforms on virtual items break sticky
positioning. Rows and slots here are placed with `top` and `inset-inline-start`, never transforms,
so sticky elements inside them still stick to the viewport.

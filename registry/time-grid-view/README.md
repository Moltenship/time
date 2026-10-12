# Time-grid view

Week and day views in the style of Google Calendar, built on `timeGridStrategy` from
`@moltenship/calendar`.

```tsx
import { createDayView, createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";

const views = [
  createWeekView<Meeting>({ dayView: "day", getEventColor: (meeting) => meeting.color }),
  createDayView<Meeting>({ getEventColor: (meeting) => meeting.color }),
] as const;
```

- The header shows the weekday and date and highlights today. Pass `dayView: "day"` to the week
  view to make each date open that registered view.
- Overlapping events sit side by side, each widening into free lanes. Set `overlapLayout:
  "equal"` for lanes of equal width, or `"stack"` to cascade them, each indented past the events
  it overlaps by `stackIndent` (a fraction of the column) and drawn on top. A stacked event rises
  to the top while hovered or focused, so its title stays readable, and a title too long for its
  event shows in full in a tooltip.
- All-day events and events of 24 hours or more sit in the all-day row, which collapses busy days
  to three lanes with "+N more".
- Columns use a nominal 24-hour wall clock. Spring-forward hours are hatched, repeated fall-back
  hours are tinted, and the two occurrences of a repeated hour sit side by side.
- Changes still being saved (`isPending` from `onEventChange`) render at reduced opacity with
  `data-pending`.
- With `secondaryTimeZones` on the root, the gutter adds an hour column per zone, named in the
  header (`label`, or the zone's short name from `Intl`). Each line is read on its own date, with
  minutes where the offset isn't whole hours and "+1" or "-1" where it's another date there. The
  gutter follows the first visible day on which neither zone changes its clocks; a day whose times
  differ after a daylight saving change says so under its date. The labels are hidden from
  assistive technology, and a focused slot names its time in each zone. Each zone's column is
  `--calendar-zone-width` wide (4rem); set it to a rem or px length on an element around the
  calendar for locales with longer times. The parts are in `time-grid-zones.tsx`.
- The now-line follows `useNow()` in today's column. The body opens on the current time, or on
  08:00 when today is not visible.
- The grid is one tab stop, entered on today's all-day cell. Arrow keys move between all-day
  cells, 15-minute slots (one focused slot renders at a time), and events; Space picks up an
  event to move it (Shift+Space to resize) or drafts an hour-long event on a slot. Pointer and
  keyboard share the `snap` in `time-grid-view.tsx`.

Pointer hooks for `@moltenship/calendar-dnd`: each day column carries `data-date` over its full
height, all-day cells carry `data-date` and `data-all-day`, events are buttons with
`data-event-id`, and editable events have `data-resize="start"` and `data-resize="end"` handles.
Map a pointer to a time with `timeGridDateTimeAt(column, y)` from `@moltenship/calendar`.

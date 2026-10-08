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
- All-day events and events of 24 hours or more sit in the all-day row, which collapses busy days
  to three lanes with "+N more".
- Columns use a nominal 24-hour wall clock. Spring-forward hours are hatched, repeated fall-back
  hours are tinted, and the two occurrences of a repeated hour sit side by side.
- The now-line follows `useNow()` in today's column. The body opens on the current time, or on
  08:00 when today is not visible.

Pointer hooks for `@moltenship/calendar-dnd`: each day column carries `data-date` over its full
height, all-day cells carry `data-date` and `data-all-day`, events are buttons with
`data-event-id`, and editable events have `data-resize="start"` and `data-resize="end"` handles.
Map a pointer to a time with `timeGridDateTimeAt(column, y)` from `@moltenship/calendar`.

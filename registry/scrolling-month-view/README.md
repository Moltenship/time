# Scrolling month view

A month of weeks that swipes up and down without end, a month at a time. Built on
`scrollingMonthStrategy` from `@moltenship/calendar` and the parts of `registry/month-view`.

```tsx
import { createScrollingMonthView } from "@/components/calendar/scrolling-month-view/scrolling-month-view";

const views = [createScrollingMonthView<Meeting>({ dayView: "scrolling-day", getEventColor })];
```

- The view is named `scrolling-month`. Six weeks share the height, which every month fits (pass
  a second argument for more, up to twelve). The rows always fill the viewport, so a short one
  shows fewer event lanes rather than fewer weeks.
- It shows the anchor's month from the week that holds its first day, and keeps that month's days
  bright. A swipe comes to rest on the next month with its first week on top, four or five
  weeks on; Previous and Next move a month, and Today shows today's month.
- A page of weeks above and below renders with its events, and `onVisibleRangeChange` reports it
  as the load range.
- Clicking a date opens `dayView`, `"day"` by default. A week whose hidden events have keyboard
  focus grows over the weeks below instead of moving them.

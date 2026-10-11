# Scrolling month view

A month of weeks that scrolls up and down without end, as a feed does. Built on
`scrollingMonthStrategy` from `@moltenship/calendar` and the parts of `registry/month-view`.

```tsx
import { createScrollingMonthView } from "@/components/calendar/scrolling-month-view/scrolling-month-view";

const views = [createScrollingMonthView<Meeting>({ dayView: "scrolling-day", getEventColor })];
```

- The view is named `scrolling-month`. Six weeks share the height (pass a second argument for
  another count), and rows never shrink below 80px.
- The month scrolls freely and comes to rest wherever it's left; the week nearest the top counts
  as the first row. Snapping each week made a fast fling feel stuck. A week the view rests partly
  on stays readable by screen readers, though keys keep to the six weeks and scroll past them.
- The anchor's week is the third row. The month most of that week falls in names the view and
  keeps its days bright. Previous and Next go to the middle of the neighbouring month, so the
  whole of it shows; Today puts today's week in the third row.
- A page of weeks above and below renders with its events, and `onVisibleRangeChange` reports it
  as the load range.
- Clicking a date opens `dayView`, `"day"` by default. A week whose hidden events have keyboard
  focus grows over the weeks below instead of moving them.

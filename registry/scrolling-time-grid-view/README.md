# Scrolling time-grid view

Week and day views that scroll sideways without end and come to rest on a day, as in Apple's
Calendar on iPad. Built on `scrollingTimeGridStrategy` from `@moltenship/calendar` and the parts
of `registry/time-grid-view`.

```tsx
import {
  createScrollingDayView,
  createScrollingWeekView,
} from "@/components/calendar/scrolling-time-grid-view/scrolling-time-grid-view";

const views = [
  createScrollingWeekView<Meeting>({ dayView: "scrolling-day", getEventColor }),
  createScrollingDayView<Meeting>({ getEventColor }),
] as const;
```

- The views are named `scrolling-week` and `scrolling-day` and take the week and day views'
  options. Register them beside `week` and `day` or instead of them.
- The anchor date is the first visible day, so the week shows seven days from any day. A scroll
  that comes to rest moves the anchor there; Previous and Next scroll a whole page, and Today
  scrolls today to the first column. From the keyboard, or with reduced motion, the view jumps
  instead of animating.
- A page of days either side renders with its events, and the strategy's `getLoadRange` reports
  it through `onVisibleRangeChange`, so an app can fetch the next week before it scrolls in.
  During a long swipe the anchor follows every half page, keeping the loaded days ahead.
- The header, all-day row, and hour gutter are sticky inside one scrolling element, so they move
  with the days without lag. Days rendered around the visible ones are hidden from assistive
  technology; keys move through the visible days and page past them, as in the week view.
- Dragging works across the scroll: snapping pauses while a gesture is under way, and dragging
  to an edge scrolls into the next days.

The scroll position lives in `useScrollingAxis` from `registry/calendar/scrolling-axis.tsx`: an
axis of numbered days thousands of days long, of which only the days near the range render.
Server markup puts the visible range at the start; once laid out, the axis extends before it.
Pass the calendar's `direction` to `Root` in right-to-left layouts.

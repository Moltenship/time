# Scrolling time-grid view

Week and day views that swipe sideways without end, a page at a time, as in Apple's Calendar on
iPad: a week comes to rest on the next week, and a day on the next day. Built on `scrollingTimeGridStrategy` from `@moltenship/calendar` and the parts
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
  options. Register them beside `week` and `day` or instead of them. `createScrollingThreeDayView`
  adds `scrolling-3-day`, which swipes three days at a time.
- For another number of days, define a view with
  `scrollingTimeGridStrategy({ count, kind: "days" })` and `ScrollingTimeGridView`, as
  `createScrollingThreeDayView` does; it swipes that many days at a time.
- The week is the anchor's calendar week, starting on `weekRules.firstDay`; the day and other
  spans start at the anchor. A swipe comes to rest on the next page, or back on this one if it
  went less than halfway, and moves the anchor there; Previous and Next scroll a whole page, and
  Today scrolls to today's week, or today. From the keyboard, or with reduced motion, the view jumps
  instead of animating.
- A page of days either side renders with its events, and the strategy's `getLoadRange` reports
  it through `onVisibleRangeChange`, so an app can fetch the next week before it scrolls in.
  During a long swipe the anchor follows every half page, keeping the loaded days ahead.
- The hours scroll in one element and the days sideways in another inside it, so a swipe moves
  one of them, whichever way it starts; in an element that scrolls both ways, Safari on iOS lets a
  swipe down page the days too. The hour gutter scrolls with the hours. The header and all-day row
  are sticky above them, and their days follow the days' scroll by a transform on a scroll
  timeline, which the browser runs with the scroll itself, falling back to scroll events where
  there are no scroll timelines. All-day titles stay at the start of the days on screen while
  their bars' starts are scrolled past, on the same timeline. A swipe over the header scrolls
  nothing. Days rendered around
  the visible ones are hidden from assistive technology; keys move through the visible days and
  page past them, as in the week view.
- Dragging works across the scroll: snapping pauses while a gesture is under way, and dragging
  to an edge scrolls into the next days, or the hours at the top and bottom.

The scroll position lives in `useScrollingAxis` from `registry/calendar/scrolling-axis.tsx`: an
axis of numbered days thousands of days long, of which only the days near the range render.
Server markup puts the visible range at the start; once laid out, the axis extends before it.
Pass the calendar's `direction` to `Root` in right-to-left layouts.

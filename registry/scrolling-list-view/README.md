# Scrolling agenda view

An agenda that scrolls through months or years without end. Built on `scrollingListStrategy`
from `@moltenship/calendar` and the parts of `registry/list-view`.

```tsx
import { createScrollingAgendaView } from "@/components/calendar/scrolling-list-view/scrolling-agenda-view";

const views = [createScrollingAgendaView<Meeting>({ dayView: "scrolling-day", getEventColor })];
```

- The view is named `scrolling-agenda`. Its range is `weeks` from the anchor date, four by
  default, which the title names; a page of weeks either way is its load range, which
  `onVisibleRangeChange` reports. Only the days in view render.
- The anchor date is the day on top. When a scroll comes to rest, the anchor moves there, and on
  a long scroll every half page on the way, so the next weeks load before they come into view.
  Today, Previous, Next, and any other anchor jump the list to that date at once, and hold it on top
  while its events load, until the user scrolls. A controlled anchor that hasn't taken the latest
  scroll keeps the list where it is, and Today still brings it back.
- Days that load in above or below, or change between, keep the day on top in place. Past the
  last loaded day, the end of the list fills the view and says "Loading events…" while `loading`
  is set, or that nothing more is scheduled. When the weeks shown have no events, the empty state
  stands in for them: as the end of the list, or as an item among the days after them, and keys
  page on from it.
  Scrolling on past either end moves a page that way, once per gesture, so the list crosses weeks
  without events.
- Keys work as in the agenda over the range's events. Moving past its ends pages the calendar and
  focus moves on to the next event, scrolling it into view; the focused day stays rendered while
  focus is in the list.
- Clicking a date opens `dayView`, `"day"` by default.

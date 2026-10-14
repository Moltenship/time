# Changelog

All published `@moltenship/*` packages share one version until after 1.0. A PR that changes a
published package adds a line under "Unreleased". `vp run release:version <version>` turns that
section into the release's. See [docs/internal/releasing.md](./docs/internal/releasing.md).

## Unreleased

- First public release of `@moltenship/calendar`, `calendar-core`, `calendar-dnd`,
  `calendar-dnd-kit`, `calendar-react`, `calendar-recurrence`, `calendar-temporal`,
  `calendar-testing` and `ics`.
- Hooks for animating the calendar from the app, as the new "Animate with Motion" guide does. A
  `monitorCalendarDrags` follower hears `preview(preview)` whenever the view's preview changes,
  with its boxes in viewport coordinates, the time range it shows and what the policies would say,
  and `end(dropped, landing)` gets the preview a release proposed the move at, or `null`. A follower
  without `claims` only watches: the drag behaves as if no one followed, with no copy off the view
  and the usual auto-scroll. Every view marks an event's title `data-slot="calendar-event-title"`.
- `@moltenship/calendar-testing` tests apps' calendars: `createTestEnvironment` fixes `now`, the
  time zone, locale and week rules through `Root`'s props; `buildEvent`, `buildAllDayEvent`,
  `buildResource`, `buildRecurringEvent` and `buildAvailability` make typed records;
  `renderCalendar` renders a `Root` with controlled events and records every `onEventChange` and
  `onEventChangeResult`; `hydrateCalendar` renders on the server, hydrates and fails on a mismatch.
  React DOM 19 is a peer (#45).
- `@moltenship/calendar-testing` finds and drives what a calendar shows: `getEvent`, `getDayCell`,
  `getTimeColumn` and `getResource` query by the calendar's own events and the pointer layer's
  attributes; `calendar.keyboard` grabs, steps, resizes, creates, drops and cancels through the
  keyboard grab mode; `calendar.pointer` drags with a mouse, pen or finger in a browser and throws a
  `PointerLayoutError` in jsdom; `settled()`, `announcements()` and `placementOf()` wait for saves
  and read what the calendar said and shows (#45).
- `@moltenship/calendar-testing` has fixtures for contract tests: `denseDayFixture`,
  `dstWeekFixture("fall" | "spring")`, `multiZoneSeriesFixture` and `resourceDayFixture`, each with
  the environment, resources and `Root` props it's meant for (#45).
- `@moltenship/ics` is licensed `MIT AND Unicode-3.0`: its Windows time zone mapping comes from
  Unicode CLDR. The license text ships in the package's `THIRD-PARTY-NOTICES.md` and, as a legal
  comment that bundlers keep, in its built code.
- A `Root` without `onEventChange` is read-only in its views too: they start no drags or keyboard
  grabs and draw no resize handles. Renderers get `isReadOnly` to tell (#201).
- Touch drags start after a 450 ms press instead of 250 ms, so a finger that rests before it
  scrolls still scrolls. The pointer layer listens for `touchmove` from the touch's start, so iOS
  Safari lets a drag hold the page still. On touch screens, editable built-in views select no text
  and show no callout (#217).
- The registry has 3-day views, `createThreeDayView` and `createScrollingThreeDayView`. On touch
  screens month events and "+N more" are 24 px tall, and the toolbar's title wraps on a phone
  instead of being cut (#217).
- `Root`'s `events` takes a `CalendarEventSource<TEvent>` as well as an array: events in an
  external store, read through `useSyncExternalStore`, with `getServerSnapshot` for server rendering
  and hydration. Its getters return event arrays (#200).
- `Root`'s `onEventChangeResult` hears how each proposal ended, from a pointer, the keyboard or
  `proposeEventChange`, with the `input` that made it. Your calendar's
  `useCalendarPendingChanges(selector?)` lists the changes still validating, saving, or waiting for
  `events`. `proposeEventChange` takes an optional `{ input }`, and the pointer layer's `onPropose`
  gets `{ input: "pointer" }`. A `Root` without `onEventChange` rejects with the change, as a
  policy does (#199).
- `@moltenship/calendar-recurrence` expands a year of 200 series about 18% faster.
  `createOccurrenceAdapter` shares its revision work between adapters, so one made on every render
  gives the same revisions and core's snapshot keeps its records (#160).
- `expandRecurrenceRule` ends a rule whose INTERVAL never reaches its BY values, such as
  `FREQ=MINUTELY;INTERVAL=2;BYMINUTE=1` from an even minute, after its first occurrence instead of
  running to `maxIterations` and reporting `truncated` (#160).
- `recurringEventsFromIcs` applies `RANGE=THISANDFUTURE`: it splits the series at the override, as
  a "this and following" edit does, so Apple's "this and future" changes reach later occurrences.
  It reads Outlook's `X-MICROSOFT-CDO-ALLDAYEVENT:TRUE` midnight-to-midnight events as all-day, and,
  without `timeZone`, reads UTC dates on all-day and floating series in the zone most of the feed's
  TZIDs name rather than UTC; pass `timeZone: "UTC"` for the old reading. A series whose DTSTART
  falls in a DST gap keeps the length written up to DTEND (#160).
- `resolveRecurrenceEdit` replays a change on the series' own clock when it gets the calendar's
  `timeZone`, for drags that also change the time of day, resizes and editor updates as well as
  drags by days, and for `"following"` as well as `"all"`. An occurrence a DST gap moved forward,
  dragged by days, keeps the series' written time. With `"all"`, an occurrence dropped on the later
  of two equal wall times at DST's end gets an override there. A new `overrides` option takes the
  series' overrides, so cancelled ones count as hiding occurrences and `"following"` from the first
  one left to show is `"all"` (#160).
- Overlap layouts vary per resource and per calendar. The time-grid views take
  `getEventOverlapLayout`, an event's own layout, such as its calendar's. The resource columns
  view also takes `getResourceOverlapLayout`, a resource's layout in its columns, such as `"stack"`
  for rooms. A group of overlapping events takes its events' own layout when they all agree, and
  otherwise its column's: the resource's, then `overlapLayout`. `ResourceOverlapLayoutOptions`
  and `TimeGridLayoutOptions` are new, `layoutTimeGrid` takes `getEventOverlapLayout`, and an
  invalid `stackIndent` now throws whatever the layout (#230).
- Undo and redo, opt-in: `createEventHistory(options?)` records committed changes from `Root`'s
  `onEventChangeResult` and undoes and redoes them by proposing the inverse through the same
  pipeline, so policies run and `onEventChange` saves it.
  `useCalendarHistory(history, { messages? })` binds a history to a `Root` and speaks outcomes
  through its `Announcer`. A step whose event changed elsewhere is dropped, and an undo waits for a
  change still saving; recurring events aren't supported yet. A calendar without a history bundles
  none of it. A create proposal can carry a record as `event`, which its change hands on, and
  `onEventChangeResult` gets the detail a proposal was made with, which an event history's
  inverses mark with `history` (#227).
- `conflictPolicy` takes a mode per resource, `getResourceMode(resourceId)`, such as `"block"` for
  rooms and `"warn"` for people, and a third mode, `"allow"`. The strictest mode among the
  resources a change double-books decides, and the reason stays `"resource-conflict"`. Existing
  calls work as before. `ConflictMode` is new (#230).
- The resource timeline's hour rows can stack overlapping events. `overlapLayout`,
  `getResourceOverlapLayout` and `getEventOverlapLayout` work as in resource columns: `"stack"`
  cascades a row's bars a third of a lane apart, never more than two lanes tall, and the other
  layouts keep a lane per level of overlap. Back-to-back events of a quarter hour or less no longer
  take a second lane at some times of day, such as 10:00. Bars get `top` and rows `height`, both
  in lanes; `ResourceTimelineLayoutOptions` is new, and the timeline views take the root's resource
  type as `TResource` (#230).
- `useCalendarHistoryShortcuts(history, { scope })` adds undo and redo keys to a calendar: Mod+Z,
  and Shift+Mod+Z or Ctrl+Y, rebindable, never in text fields or dialogs. The registry's
  `calendar-history-toast` offers Undo after each change and Redo after an undo, with the keys,
  and the demo uses it (#227).
- Drags from outside the calendar: `startCalendarDrop(source, { input })` follows an item dragged
  in from a list over every view that uses `useCalendarPointer`, previews and checks where it would
  land, scrolls the view near its edges, and proposes once on drop: a create carrying the item's
  record as `event`, `duration` long over a time column or `days` long over day cells, in the
  resource it's dropped in, or with `eventId` a move. Read-only views take no part.
  `monitorCalendarDrags(monitor)` offers each event a view starts to move to drop zones outside
  the calendar, which can claim the pointer and take the drop; while one follows, a copy of the
  event follows the pointer outside the view. `observeCalendarRegions` lists the views on the
  page. Announcement updates carry `outside: { title? }` for such drags, which the registry's
  English messages name.
  The pointer layer's `onPropose` and `check` take `CalendarEventProposal<TEventId, TResourceId,
  TEvent>`, and a view's `actions` a create with `event`, so a dropped item's record reaches
  `onEventChange` (#237).
- `@moltenship/calendar-dnd-kit`, an optional dnd-kit adapter for `@dnd-kit/react` and
  `@dnd-kit/dom` 0.5. `<CalendarDndKit />` inside a `DragDropProvider` makes each view a droppable
  with an opaque ID (`isCalendarTarget`), which wins where the view is on top: a draggable whose
  `data` carries `calendarDropData(source)` previews in the view under it and becomes an event when
  dropped. An event a view moves becomes a dnd-kit drag of type `calendarEventType` once it leaves
  the view, which your droppables can take, read with `calendarEventOf`; moves that stay in the
  view never reach dnd-kit. `connectCalendarDragDrop(manager)` does the same without React, and
  every connection to a manager shares one. `@moltenship/calendar` doesn't re-export it. A drag
  from outside, or an event dragged back in, scrolls a view's edges once the pointer has been clear
  of them or rested near one for a quarter of a second, so crossing an edge on the way in doesn't
  scroll the view (#237).

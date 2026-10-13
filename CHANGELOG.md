# Changelog

All published `@moltenship/*` packages share one version until after 1.0. A PR that changes a
published package adds a line under "Unreleased". `vp run release:version <version>` turns that
section into the release's. See [docs/internal/releasing.md](./docs/internal/releasing.md).

## Unreleased

- First public release of `@moltenship/calendar`, `calendar-core`, `calendar-dnd`,
  `calendar-react`, `calendar-recurrence`, `calendar-temporal` and `ics`.
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
  drags by days, and for `"following"` as well as `"all"`. With `"all"`, an occurrence dropped on
  the later of two equal wall times at DST's end gets an override there. A new `overrides` option
  takes the series' overrides, so cancelled ones count as hiding occurrences and `"following"` from
  the first one left to show is `"all"` (#160).

# Compose a calendar

A calendar is three things: an adapter that reads your records, a `Calendar` made from the views you want, and a `Root` that renders it. The full walk-through is `docs/quick-start.md`.

## 1. Add the views

The views are source files, added with the shadcn CLI from the registry at `https://time.molten.sh/r/`. They're built on shadcn/ui with Base UI primitives, so `style` in the app's `components.json` must start with `base-`. Check for existing files in `components/calendar/` before adding: the app may already have them.

```bash
npx shadcn@latest add \
  https://time.molten.sh/r/time-grid-view.json \
  https://time.molten.sh/r/month-view.json \
  https://time.molten.sh/r/list-view.json
```

| Registry item              | Factories                                                                 | Import from `@/components/calendar/…`                    | Docs page                         |
| -------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------- |
| `time-grid-view`           | `createWeekView`, `createDayView`, `createThreeDayView`                   | `time-grid-view/time-grid-view`                          | `docs/views/week-and-day.md`      |
| `month-view`               | `createMonthView`                                                         | `month-view/month-view`                                  | `docs/views/month.md`             |
| `year-view`                | `createYearView`                                                          | `year-view/year-view`                                    | `docs/views/year.md`              |
| `list-view`                | `createAgendaView`                                                        | `list-view/agenda-view`                                  | `docs/views/agenda.md`            |
| `resource-columns-view`    | `createResourceColumnsView`                                               | `resource-columns-view/resource-columns-view`            | `docs/views/resource-columns.md`  |
| `resource-timeline-view`   | `createTimelineDayView`, `createTimelineWeekView`, `createTimelineMonthView` | `resource-timeline-view/resource-timeline-view`       | `docs/views/resource-timeline.md` |
| `scrolling-time-grid-view` | `createScrollingWeekView`, `createScrollingDayView`, `createScrollingThreeDayView` | `scrolling-time-grid-view/scrolling-time-grid-view` | `docs/views/scrolling.md`      |
| `scrolling-month-view`     | `createScrollingMonthView`                                                | `scrolling-month-view/scrolling-month-view`              | `docs/views/scrolling.md`         |
| `scrolling-list-view`      | `createScrollingAgendaView`                                               | `scrolling-list-view/scrolling-agenda-view`              | `docs/views/agenda.md`            |
| `calendar-full`            | Every other item in this table                                            |                                                          | `docs/installation.md`            |
| `calendar-history-toast`   | `CalendarHistoryToast` (an Undo toast)                                    | `calendar-history-toast/calendar-history-toast`          | `docs/undo-redo.md`               |
| `recurrence-scope-dialog`  | "This event, following, or all?"                                          | `recurrence-scope-dialog/use-recurrence-scope-prompt`    | `docs/guides/recurring-events.md` |

Every view item brings the shared `calendar` item: `calendar-toolbar`, `view-switcher`, `event-colors`, `announcements`, the theme, and `calendar-ui`, the calendar's own buttons, badges, tooltips and selects on ui-sdk (they don't use the app's `components/ui`). They're a default the app owns: to use the app's own control, make its file in `components/calendar/ui/` render it with the same exports and props (theming docs, "Use your own controls"). Each item also has a `stylex-` twin for apps on StyleX (`docs/stylex.md`).

`shadcn add` installs `@moltenship/calendar`, and `calendar-ui` adds `@ui-sdk/core` and `@ui-sdk/react` when the app has none. Keep every `@ui-sdk/*` package on the calendar's version.

ui-sdk adds CSS in a layer named `ui-sdk`. The app's global CSS names that layer before Tailwind, or the layer wins over Tailwind's utilities:

```css title="globals.css"
@layer ui-sdk;
@import "tailwindcss";
```

Read a view's docs page for its options before you set any. Options differ between views.

## 2. The adapter and the calendar

```tsx title="calendar.tsx"
"use client";

import { createCalendar, defineEventAdapter } from "@moltenship/calendar";

import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { createMonthView } from "@/components/calendar/month-view/month-view";
import { createDayView, createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";

export interface Meeting {
  readonly id: string;
  readonly title: string;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly color: CalendarEventColor;
}

// Called twice on purpose: the first call fixes the record type, the second infers the ID types.
export const eventAdapter = defineEventAdapter<Meeting>()({
  getId: (meeting) => meeting.id,
  getTitle: (meeting) => meeting.title,
  getInterval: (meeting) => ({ kind: "timed", start: meeting.start, end: meeting.end }),
  getResourceIds: () => [],
});

const getEventColor = (meeting: Meeting) => meeting.color;

// Also called twice: type arguments first, then the options.
export const Calendar = createCalendar<Meeting>()({
  eventAdapter,
  views: [
    createWeekView<Meeting>({ dayView: "day", getEventColor }),
    createDayView<Meeting>({ getEventColor }),
    createMonthView<Meeting>({ getEventColor }),
  ],
});

export const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;
```

- `getInterval` returns `{ kind: "timed", start, end }` with instants, `{ kind: "all-day", start, end }` with plain dates, or `{ kind: "floating", start, end }` with plain date-times. The end is exclusive.
- Optional adapter fields: `isReadOnly`, `isBusy`, `getRevision` (`docs/api/events.md`).
- The first view in `views` is shown first. View names must be unique, and TypeScript learns them from the list, so `setView("yaer")` is a type error.
- Records already in the library's shape (`{ id, title, start, end, data }`) can use `createCanonicalEventAdapter<TData>()` instead of writing an adapter.
- Create `Calendar` and the adapter at module scope, never inside a component.

## 3. Render it

```tsx title="team-calendar.tsx"
"use client";

import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { ViewSwitcher } from "@/components/calendar/view-switcher";

import { Calendar, weekRules, type Meeting } from "./calendar";

const viewLabels = { week: "Week", day: "Day", month: "Month" };
const viewOptions = Calendar.views.map(({ name }) => ({ value: name, label: viewLabels[name] }));

function CalendarViewSwitcher() {
  const view = Calendar.useCalendarSelector((state) => state.view);
  const { setView } = Calendar.useCalendarActions();
  return <ViewSwitcher value={view} onValueChange={setView} options={viewOptions} />;
}

export function TeamCalendar({ meetings }: { readonly meetings: readonly Meeting[] }) {
  return (
    <Calendar.Root
      label="Team calendar"
      events={meetings}
      defaultAnchorDate={Temporal.Now.plainDateISO("Europe/Berlin")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame className="flex h-[640px] flex-col rounded-xl border">
        <CalendarToolbar calendar={Calendar}>
          <CalendarViewSwitcher />
        </CalendarToolbar>
        <Calendar.Viewport className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
```

`Root` requires `events`, `locale`, `weekRules`, a date (`defaultAnchorDate` or `anchorDate`) and a time zone (`defaultTimeZone` or `timeZone`). It renders no element of its own.

The week and day views' event tooltips use shadcn's `Tooltip`: with `time-grid-view`, the app needs one `TooltipProvider` from `@/components/ui/tooltip` around it. The toolbar's tooltips come from `calendar-ui` and need no provider.

With server rendering, the server and the browser must agree on the date and time. Pass `now` (a `Temporal.Instant` made on the server) and a fixed date instead of `Temporal.Now` in the component (`docs/guides/nextjs.md`).

## The parts

Each part renders one element with a `data-calendar-part` attribute and takes that element's props.

| Part                                              | Renders     | Notes                                                              |
| ------------------------------------------------- | ----------- | ------------------------------------------------------------------ |
| `Calendar.Root`                                   | nothing     | Holds the state. Everything else goes inside                       |
| `Calendar.Frame`                                  | `<section>` | Named by `Root`'s `label`, or else by the title. Agents find the calendar by it |
| `Calendar.Toolbar`                                | `<header>`  | A wrapper for controls                                             |
| `Calendar.Title`                                  | `<span>`    | The active view's title                                            |
| `Calendar.PreviousTrigger`, `NextTrigger`, `TodayTrigger` | `<button>` | Give each text or an `aria-label`                           |
| `Calendar.ViewSwitcher`                           | `<select>`  | Needs `getViewLabel(name)`                                         |
| `Calendar.Viewport`                               | `<div>`     | Wraps the view                                                     |
| `Calendar.ActiveView`                             | the view    | Renders the active view's `Renderer`                               |
| `Calendar.Event`                                  | your output | Looks one event up by `eventId` and calls `children` with it       |
| `Calendar.Announcer`                              | `<div>`     | A live region for screen readers. Needs `messages`, as `calendarAnnouncements` from `@/components/calendar/announcements` |

The registry's `CalendarToolbar` composes `Toolbar`, the three triggers and `Title`. Use the bare parts when the app has its own toolbar.

`Frame`, `Title` and `Viewport` don't take `id`. Set `id` on `Root`.

## Resources

Rooms or people that events belong to are `resources` on `Root`, and `getResourceIds` in the adapter says which ones an event is on. The resource views need them: `docs/views/resource-columns.md`, `docs/views/resource-timeline.md`, `docs/concepts/events.md#resources`.

## Recurring events

Recurrence is a layer over ordinary events, in `@moltenship/calendar-recurrence`: you expand series into occurrences and pass those as `events`. Read `docs/concepts/recurrence.md` and `docs/guides/recurring-events.md` before writing any of it. Don't expand RRULEs by hand.

## A view of your own

`defineCalendarView({ name, defaultOptions, strategy, Renderer })` from `@moltenship/calendar`. Write `strategy` before `Renderer` in the object, so the Renderer's `projection` gets its type from `strategy.project`. Read `docs/views/custom-views.md` first, and `docs/interactions.md#in-your-own-views` if people should drag events in it.

## Styling

The views are styled with Tailwind classes and CSS variables from the `calendar-theme` item. Change tokens in your own CSS rules, not in the block `shadcn add` writes (`docs/theming.md`). Event colors come from `getEventColor` and the palette in `event-colors`.

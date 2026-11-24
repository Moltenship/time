# State

`Root` keeps six values. Each is uncontrolled (the calendar owns it) or controlled (the app owns it), independently of the others. The full page is `docs/concepts/state.md`.

| Value                 | Type                   | Uncontrolled prop            | Controlled prop       | Handler                       |
| --------------------- | ---------------------- | ---------------------------- | --------------------- | ----------------------------- |
| `view`                | one of your view names | `defaultView`                | `view`                | `onViewChange`                |
| `anchorDate`          | `Temporal.PlainDate`   | `defaultAnchorDate`          | `anchorDate`          | `onAnchorDateChange`          |
| `timeZone`            | IANA name              | `defaultTimeZone`            | `timeZone`            | `onTimeZoneChange`            |
| `selection`           | your type, or `null`   | `defaultSelection`           | `selection`           | `onSelectionChange`           |
| `focus`               | your type, or `null`   | `defaultFocus`               | `focus`               | `onFocusChange`               |
| `expandedResourceIds` | resource IDs           | `defaultExpandedResourceIds` | `expandedResourceIds` | `onExpandedResourceIdsChange` |

## Rules

- **Start uncontrolled.** Control a value only when something outside the calendar must set it or stay in sync with it: a date picker beside the calendar, the URL, a saved preference.
- **A controlled value needs its handler.** The calendar never changes a controlled value itself. It calls the handler, and nothing moves until the app stores the new value.
- **`undefined` means uncontrolled.** To control `selection` or `focus` with nothing selected, pass `null`.
- **Defaults are read once**, when `Root` mounts.
- **Handlers run for uncontrolled values too**, after the calendar updates them.
- **`Root` needs a date, a time zone and a view on its first render**, or it throws `calendar-root-requires-anchor-date`, `calendar-root-requires-time-zone` or `calendar-root-requires-view`.

```tsx title="controlled-date.tsx"
"use client";

import { useState } from "react";

import { Calendar, weekRules, type Meeting } from "./calendar";

export function ControlledCalendar({ meetings }: { readonly meetings: readonly Meeting[] }) {
  const [anchorDate, setAnchorDate] = useState(() => Temporal.PlainDate.from("2026-10-08"));

  return (
    <Calendar.Root
      events={meetings}
      anchorDate={anchorDate}
      onAnchorDateChange={setAnchorDate}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame className="flex h-[640px] flex-col">
        <Calendar.Viewport className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
```

## Reading and changing it

Inside `Root`, use the hooks on your `Calendar`:

| Hook                                    | Returns                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `Calendar.useCalendarSelector(selector)` | One derived value. The component re-renders only when it changes. Prefer this one |
| `Calendar.useCalendarState()`           | All six values                                                                     |
| `Calendar.useCalendarActions()`         | The actions below. Stable: safe in dependency lists                                |
| `Calendar.useCalendarMeta()`            | The event snapshot, resources, environment, active view, diagnostics, `label`      |
| `Calendar.useVisibleRange()`            | The dates the active view shows                                                    |

The actions: `setView`, `setAnchorDate`, `setTimeZone`, `setSelection`, `setFocus`, `setExpandedResourceIds`, `navigateNext`, `navigatePrevious`, `navigateToday`, `proposeEventChange`, `checkEventChange`.

```tsx title="skip-a-week.tsx"
"use client";

import { Calendar } from "./calendar";

export function SkipAWeek() {
  const anchorDate = Calendar.useCalendarSelector((state) => state.anchorDate);
  const actions = Calendar.useCalendarActions();

  return (
    <button type="button" onClick={() => actions.setAnchorDate(anchorDate.add({ weeks: 1 }))}>
      Skip a week
    </button>
  );
}
```

Actions called one after another build on each other: `navigateNext()` twice in one click moves two steps, controlled or not.

## What a handler hears

Every state handler is `(next, detail)`:

| `detail` field | Contents                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------- |
| `previous`     | The value before                                                                             |
| `controlled`   | Whether the app controls this value                                                          |
| `slice`        | Which value: `"view"`, `"anchorDate"`, …                                                     |
| `reason`       | `"next-press"`, `"previous-press"`, `"today-press"`, `"input-change"` (the view switcher part), `"keyboard-navigation"` (a view's keys), `"focus-change"` (focus a person moved), `"resource-toggle"`, or `"imperative"` (an action call) |
| `source`       | `"mouse"`, `"touch"`, `"pen"`, `"keyboard"`, `"virtual"`, `"programmatic"`, or `"agent"`     |
| `event`        | The DOM event, when a part's own control caused the change                                   |
| `cancel()`     | Keeps the value as it was                                                                    |
| `canceled`     | Whether a handler cancelled                                                                  |

```tsx
<Calendar.Root
  onViewChange={(view, detail) => {
    // An agent may look around the week and day views, and not switch to the month.
    if (detail.source === "agent" && view === "month") detail.cancel();
  }}
/>
```

An action takes options last, `{ event?, reason?, source? }`, to say why and how the app called it: `actions.navigateNext({ event: event.nativeEvent })`. Without them a call reads `reason: "imperative"`, `source: "programmatic"`.

`"keyboard"` is a person's keys, on a toolbar button and in a view: arrow-key navigation, moving focus between cells and events, and expanding a resource report it. `"agent"` is anything an agent's step causes, including an action the app's own button calls when an agent presses it.

A click dispatched by a script reads `source: "programmatic"`. Only a real pointer reads `"mouse"`, so don't assert `"mouse"` in a jsdom test.

## Selection and focus

The app chooses their shape: the third and fourth type arguments of `createCalendar`, after the event and resource types.

```tsx
type Selection = { readonly eventId: string } | { readonly date: Temporal.PlainDate };

const Calendar = createCalendar<Meeting, never, Selection>()({ eventAdapter, views });
```

The calendar stores the values as they are. Keep them serializable if agents should read them: both are in the agent's snapshot.

## State outside `Root`

`createCalendarStore` holds the six values outside React, for a toolbar in another part of the page or state that outlives a `Root`. Pass it as `store` on `Root`. Read `docs/api/store.md` before using it; most apps don't need one.

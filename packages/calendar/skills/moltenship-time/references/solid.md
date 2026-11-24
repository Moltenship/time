# Solid

`@moltenship/calendar-solid` is the SolidJS 2 integration, a preview. It renders the same primitive as React, so state, actions, event changes, policies and the agent surface are the same. Much of what React has isn't in it yet. Read `docs/api/solid.md` before you write Solid code, and check the package's own types: the preview changes between releases.

## What it has, and what it doesn't

| Has                                                                 | Doesn't have yet                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `createCalendar`, `defineCalendarView`                              | Ready-made views. The registry's views are React source                |
| `Root` with the same props as React's                               | Keyboard navigation inside a view, roving focus                        |
| `Frame`, `Toolbar`, `Title`, `Viewport`, `ActiveView`               | Dragging, resizing or creating with a pointer                          |
| `PreviousTrigger`, `NextTrigger`, `TodayTrigger`, `ViewSwitcher`    | Gesture previews (`useCalendarDraft`, `useCalendarInteraction`)        |
| `useCalendarState`, `useCalendarSelector`, `useCalendarActions`     | Undo bindings (`useCalendarHistory`, `useCalendarHistoryShortcuts`)    |
| `useCalendarMeta`, `useVisibleRange`, `useViewProjection`           | `Calendar.Announcer`, `Calendar.Event`                                 |
| `useCalendarPendingChanges`, `useCalendar`                          | Hooks for selection, annotations, availability, resources, the clock   |
| `createStateSelector`, `createCalendarStore`, `resolveViewOptions`  | A testing package: `@moltenship/calendar-testing` is React only        |
| The fifteen agent actions, through `@ui-sdk/solid/agent`            |                                                                        |

If the user asks for something in the right column, say it isn't in the Solid preview. Don't import a React hook's name from the Solid package: it isn't exported.

## Install

```bash
pnpm add @moltenship/calendar-solid @moltenship/calendar-core solid-js @solidjs/web @ui-sdk/core @ui-sdk/solid
```

- The adapter and the view functions come from `@moltenship/calendar-core`. The Solid package doesn't re-export them.
- Don't install `@moltenship/calendar` in a Solid app. It's the React package.
- With Vite, use `@solidjs/vite-plugin`, and set `"jsx": "preserve"` and `"jsxImportSource": "@solidjs/web"` in `tsconfig.json`. Exclude `@ui-sdk/core` from `optimizeDeps` so the dev server loads one copy.

## A calendar

A view is a strategy from the engine and a Solid component that draws its projection. The engine has projections for a month (`getMonthRange`, `getMonthTitle`, `navigateMonth`, `projectMonth`) and a list (`getListRange`, `getListTitle`, `navigateList`, `projectList`), among others.

```tsx title="calendar.tsx"
import {
  defineEventAdapter,
  getListRange,
  getListTitle,
  navigateList,
  projectList,
  type CalendarEventInterval,
  type ListProjection,
  type ListViewOptions,
} from "@moltenship/calendar-core";
import {
  createCalendar,
  defineCalendarView,
  type CalendarViewRendererProps,
} from "@moltenship/calendar-solid";
import { For } from "solid-js";

export interface Meeting {
  readonly id: string;
  readonly title: string;
  readonly interval: CalendarEventInterval;
}

const eventAdapter = defineEventAdapter<Meeting>()({
  getId: (meeting) => meeting.id,
  getTitle: (meeting) => meeting.title,
  getInterval: (meeting) => meeting.interval,
  getResourceIds: () => [],
});

type List = ListProjection<Meeting, string, string>;

// Props are getters: read `props.projection` in the JSX. Don't destructure it.
function Agenda(props: CalendarViewRendererProps<List, ListViewOptions>) {
  return (
    <For each={props.projection.days} fallback={<p>Nothing in these weeks.</p>}>
      {(entry) => (
        <section>
          <h3>{entry.date.toLocaleString(props.environment.locale, { dateStyle: "full" })}</h3>
          <ul>
            <For each={entry.items}>
              {(item) => <li data-event-id={item.event.id}>{item.event.title}</li>}
            </For>
          </ul>
        </section>
      )}
    </For>
  );
}

const listView = defineCalendarView({
  name: "list",
  defaultOptions: { weeks: 2 } as ListViewOptions,
  strategy: {
    getRange: (anchor, environment, options) => getListRange(anchor, environment, options),
    getTitle: (range, environment) => getListTitle(range, environment),
    navigate: (anchor, delta, options) => navigateList(anchor, delta, options),
    project: (input) => projectList(input) as List,
  },
  Renderer: Agenda,
});

export const Calendar = createCalendar<Meeting>()({ eventAdapter, views: [listView] });
```

```tsx title="app.tsx"
import type { CalendarWeekRules } from "@moltenship/calendar-core";
import { createSignal } from "solid-js";

import { Calendar, type Meeting } from "./calendar";

const timeZone = "Europe/Berlin";
const at = (value: string) =>
  Temporal.PlainDateTime.from(value).toZonedDateTime(timeZone).toInstant();

const seed: readonly Meeting[] = [
  {
    id: "standup",
    title: "Standup",
    interval: { kind: "timed", start: at("2026-10-08T09:00"), end: at("2026-10-08T09:30") },
  },
];

const weekRules: CalendarWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] };

export function App() {
  const [meetings, setMeetings] = createSignal<readonly Meeting[]>(seed);

  return (
    <Calendar.Root
      label="Team calendar"
      events={meetings()}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone={timeZone}
      locale="en-US"
      weekRules={weekRules}
      onEventChange={(change, detail) => {
        // A title an agent sent with `createEvent` or `updateEvent`. A person's change has none.
        const sent = detail.fields?.title;
        const title = typeof sent === "string" && sent.trim() !== "" ? sent.trim() : undefined;
        if (change.cause === "delete") {
          setMeetings((current) => current.filter((meeting) => meeting.id !== change.eventId));
        } else if (change.cause === "create") {
          setMeetings((current) => [
            ...current,
            { id: crypto.randomUUID(), title: title ?? "New meeting", interval: change.proposed },
          ]);
        } else {
          setMeetings((current) =>
            current.map((meeting) =>
              meeting.id === change.eventId
                ? { ...meeting, title: title ?? meeting.title, interval: change.proposed }
                : meeting,
            ),
          );
        }
      }}
    >
      <Calendar.Frame>
        <Calendar.Toolbar>
          <Calendar.PreviousTrigger>Previous</Calendar.PreviousTrigger>
          <Calendar.TodayTrigger>Today</Calendar.TodayTrigger>
          <Calendar.NextTrigger>Next</Calendar.NextTrigger>
          <Calendar.Title />
        </Calendar.Toolbar>
        <Calendar.Viewport>
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
```

## Rules that differ from React

- **Hooks return accessors.** `const state = Calendar.useCalendarState()`, then `state().view`. `useCalendarActions()` returns the actions object itself.
- **Don't destructure.** A `Renderer`'s props, and `useCalendar()`'s `meta` and `state`, are getters. Read them in JSX, a memo or an effect.
- **Pass a signal's value to a prop that changes:** `events={meetings()}`, `view={view()}`.
- **Don't read a prop in a component's body** to seed a signal: Solid 2 warns, and the value never updates. Read props in JSX or a memo.
- **`class`, not `className`**, on the parts.
- **A trigger needs children or an `aria-label`.** TypeScript requires one of them.
- **An accessor has the new value once Solid flushes**, a microtask after the action.
- **The store's view type has to be the calendar's:** `createCalendarStore<View>(...)`. A calendar without resources takes a store made without the resource ID type.

The rest is in the other references and applies as written: `state.md` for controlled and uncontrolled state, `changes.md` for `onEventChange`, policies and pending changes. Skip their parts on history hooks, dragging and the registry.

## Agents

```ts title="agent.ts"
import { createAgent } from "@ui-sdk/solid/agent";

// One bridge for the page. Import this module before the one that calls `render`.
export const agent = createAgent({
  allow: (step) => step.action !== "deleteEvent",
});
```

Everything in `agent-ready.md` holds: `label` on `Root`, `Calendar.Frame` rendered, `detail.fields` read in `onEventChange`, `allowAgentDelete` for deletes, the same fifteen actions with one object each, the same results and errors. Only the import path differs.

## Changing an event without a drag

There's no pointer layer yet, so a person changes an event through your own controls. Call `actions.proposeEventChange(proposal)` from `Calendar.useCalendarActions()`: it runs the policies and `onEventChange` and resolves with the result. `changes.md` has the proposal's shape.

## Testing

`@moltenship/calendar-testing` doesn't render Solid. The package's own tests show a pattern that works with Vitest and jsdom: render with `render` from `@solidjs/web`, call `flush()` from `solid-js` after an action, and assert on the DOM. For an agent's step, create a bridge with `createAgent` from `@ui-sdk/solid/agent` before anything renders, and `await agent.act(...)`. Those tests build components with `createComponent` instead of JSX, so they need no compiler; a test file with JSX needs the Solid plugin in the test config.

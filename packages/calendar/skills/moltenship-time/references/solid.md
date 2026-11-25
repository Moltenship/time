# Solid

`@moltenship/calendar-solid` is the SolidJS 2 integration. It renders the same primitive as React, so state, actions, event changes, policies and the agent surface are the same. It has every hook React has. The Solid registry has ready-made views for the week and day, the month, the year and the agenda, each but the year also as a scrolling view, the resource columns and the resource timeline, with a toolbar, a view switcher, a mini month, the recurring-event dialog, the undo toast and a kit of controls. `calendar-full` installs all of them. `https://time.molten.sh/docs/solid/frameworks.md` says what Solid doesn't have. Read the Solid docs before you write Solid code, and check the package's own types. The docs in the package are React's. Solid's are on the site: `https://time.molten.sh/llms.txt` lists them, and `https://time.molten.sh/docs/solid/api/components.md` is the reference.

## What it has, and what it doesn't

| Has                                                                                                   | Doesn't have                                                        |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `createCalendar`, `defineCalendarView`, `Root` with the same props as React's                         | A testing package: `@moltenship/calendar-testing` is React only     |
| Every part: the structural ones, `Event` and `Announcer`                                              | `@moltenship/calendar-dnd-kit`, which has React as a peer           |
| The read hooks: state, selector, actions, meta, range, projection, pending changes                    | The registry's views in StyleX: Solid's are Tailwind CSS            |
| `useCalendarKeyboard`, `useRovingFocus`, `useCalendarFocus`, `useCalendarSelection`                   |                                                                     |
| `useCalendarPointer`, `eventIdAttributes`, `resourceIdAttributes`                                     |                                                                     |
| `useCalendarInteraction`, `useCalendarDraft`, `useCalendarDraftReporter`, `useDraftBusy`              |                                                                     |
| `useCalendarAnnouncer`, `useCalendarHistory`, `useCalendarHistoryShortcuts`                           |                                                                     |
| `useNow`, resources, status, availability, closed dates, annotations, `useAnchorDateRequests`         |                                                                     |
| `createStateSelector`, `createCalendarStore`, `resolveViewOptions`; the agent actions                 |                                                                     |
| The registry's week and day, month, year, agenda, their scrolling versions, resource columns and resource timeline, its dialog and toast |                                                                     |

Every hook React's integration exports has a Solid one with the same name. If the user asks for something in the right column, say Solid doesn't have it.

## Install

```bash
pnpm add @moltenship/calendar-solid@next solid-js @solidjs/web @ui-sdk/core @ui-sdk/solid
```

Time 2.0 is a pre-release on npm's `next` tag, so the command installs `@next`.

- `@moltenship/calendar-solid` is the one package to import. It re-exports the engine and the Temporal helpers, so the adapter and the view functions come from it too.
- The views install with the shadcn CLI from the Solid registry: `npx shadcn@latest add https://time.molten.sh/r/solid/calendar-full.json` adds every Solid item but `base-tokens`, `list-view.json` the agenda alone, and `time-grid-view`, `month-view` and `year-view` the week and day, the month and the year. `scrolling-time-grid-view`, `scrolling-month-view` and `scrolling-list-view` add the scrolling week and day, month and agenda (`https://time.molten.sh/docs/solid/views/scrolling.md`), `resource-columns-view` the resource columns (`https://time.molten.sh/docs/solid/views/resource-columns.md`), and `resource-timeline-view` the resource timeline (`https://time.molten.sh/docs/solid/views/resource-timeline.md`). `https://time.molten.sh/docs/solid/installation.md` has the setup, and `https://time.molten.sh/docs/solid/views.md` links each view's page.
- The same registry's `calendar` item has the toolbar, the view switcher and the mini month (`https://time.molten.sh/docs/solid/views/toolbar.md`), and `calendar-ui` the controls they're built from (`https://time.molten.sh/docs/solid/views/controls.md`). `recurrence-scope-dialog` is the recurring-event dialog (`https://time.molten.sh/docs/solid/recurrence/calendar.md`), and `calendar-history-toast` the undo toast (`https://time.molten.sh/docs/solid/undo-redo.md`).
- Don't install `@moltenship/calendar` in a Solid app. It's the React package.
- With Vite, use `@solidjs/vite-plugin`, and set `"jsx": "preserve"` and `"jsxImportSource": "@solidjs/web"` in `tsconfig.json`. Exclude `@ui-sdk/core` from `optimizeDeps` so the dev server loads one copy.

## A calendar

A view is a strategy from the engine and a Solid component that draws its projection. The engine has projections for a month (`getMonthRange`, `getMonthTitle`, `navigateMonth`, `projectMonth`) and a list (`getListRange`, `getListTitle`, `navigateList`, `projectList`), among others.

```tsx title="calendar.tsx"
import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  getListRange,
  getListTitle,
  navigateList,
  projectList,
  type CalendarEventInterval,
  type CalendarViewRendererProps,
  type ListProjection,
  type ListViewOptions,
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
import type { CalendarWeekRules } from "@moltenship/calendar-solid";
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
- **`useCalendarKeyboard()` and `useCalendarPointer(options)` return refs**, not handlers: `<div ref={[keyboard, pointer]}>`. Spread `useRovingFocus(target)` on each day, slot and event.
- **Pass an accessor where an argument changes:** `useRovingFocus(() => ({ date: props.day.date, kind: "day" }))`. A plain value is read once.
- **Key a `For` by identity** so an element keeps its focus across projections: `keyed={(segment) => segment.event.id}`. The children then get accessors.
- **The store's view type has to be the calendar's:** `createCalendarStore<View>(...)`. A calendar without resources takes a store made without the resource ID type.

The rest is in the other references and applies as written: `state.md` for controlled and uncontrolled state, `changes.md` for `onEventChange`, policies and pending changes. The history hooks apply too, from `@moltenship/calendar-solid`. What they say about the registry's views is React's: in Solid, check the view's own page.

## Agents

```ts title="agent.ts"
import { createAgent } from "@ui-sdk/solid/agent";

// One bridge for the page. Import this module before the one that calls `render`.
export const agent = createAgent({
  allow: (step) => step.action !== "deleteEvent",
});
```

Everything in `agent-ready.md` holds: `label` on `Root`, `Calendar.Frame` rendered, `detail.fields` read in `onEventChange`, `allowAgentDelete` for deletes, the same fifteen actions with one object each, the same results and errors. Only the import path differs.

## Keyboard, dragging and undo

`https://time.molten.sh/docs/solid/accessibility.md` has a month view with the keyboard ref, `https://time.molten.sh/docs/solid/interactions.md` a week view with the pointer ref, and `https://time.molten.sh/docs/solid/undo-redo.md` the undo buttons. In short:

- Give the strategy a `getSpatialNavigation`, such as `monthSpatialNavigation`, or the keys move nothing.
- Pass `useCalendarPointer` the Renderer's `events`, `actions.proposeEventChange` as `onPropose`, `isReadOnly` as `disabled` and the environment's `timeZone`. Three more options are optional: `actions.checkEventChange` as `check` marks a preview a policy would reject, `useCalendarAnnouncer()` as `announcer` says each drag to a screen reader, and `useCalendarDraftReporter()` as `onPreview` lets `useCalendarDraft` and `useDraftBusy` follow the drag. Render `data-date` on each day, `eventIdAttributes(id)` on each event and `data-resize="start"` or `"end"` on its handles.
- Render `<Calendar.Announcer messages={...} />` inside `Root`. The registry's `calendar/announcements.ts` has English messages; the packages ship none.
- Record results in `Root`'s `onEventChangeResult` with `history.record`, then bind `useCalendarHistory(history)` and `useCalendarHistoryShortcuts(controls, () => ({ scope: meta().refs.frame }))`. Pass `createdEventId` to `createEventHistory` so creates can be undone.

A person can also change an event through your own controls: call `actions.proposeEventChange(proposal)` from `Calendar.useCalendarActions()`. It runs the policies and `onEventChange` and resolves with the result. `changes.md` has the proposal's shape.

## Testing

`@moltenship/calendar-testing` doesn't render Solid. The package's own tests show a pattern that works with Vitest and jsdom: render with `render` from `@solidjs/web`, call `flush()` from `solid-js` after an action, and assert on the DOM. For an agent's step, create a bridge with `createAgent` from `@ui-sdk/solid/agent` before anything renders, and `await agent.act(...)`. Those tests build components with `createComponent` instead of JSX, so they need no compiler; a test file with JSX needs the Solid plugin in the test config.

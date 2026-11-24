# Event changes

The calendar never edits your events. A drag, a keyboard move, a button of yours or an agent's step **proposes a change**. Policies check it, `onEventChange` saves it, and the app updates the `events` it passes. The full pages are `docs/interactions.md` and `docs/api/changes.md`.

```text
drag · keys · proposeEventChange · agent step
        │
        ▼
   policies ──reject──▶ result: rejected, with the policy's reason
        │ accept / adjust / warn
        ▼
 onEventChange(change, detail) ──throws or rejects──▶ rolled back: handler-error
        │ returns, or its promise resolves
        ▼
 onEventChangeResult(result, detail)        how it ended, once per proposal
```

## Save a change

```tsx title="editable-calendar.tsx"
"use client";

import {
  minimumDurationPolicy,
  snapPolicy,
  type CalendarEventChange,
  type CalendarPolicy,
} from "@moltenship/calendar";
import { useState } from "react";

import { Calendar, weekRules, type Meeting } from "./calendar";

type MeetingChange = CalendarEventChange<Meeting, string, never>;

function applyChange(meetings: readonly Meeting[], change: MeetingChange): readonly Meeting[] {
  if (change.cause === "delete") {
    return meetings.filter((meeting) => meeting.id !== change.eventId);
  }
  if (change.proposed.kind !== "timed") return meetings;

  const { start, end } = change.proposed;
  if (change.cause === "create") {
    // A create brings times and no record: the app makes the record and its ID.
    const meeting = change.event ?? {
      id: crypto.randomUUID(),
      title: "New meeting",
      color: "blue" as const,
    };
    return [...meetings, { ...meeting, start, end }];
  }
  return meetings.map((meeting) =>
    meeting.id === change.eventId ? { ...meeting, start, end } : meeting,
  );
}

// Meetings always have a time, so a drop on the all-day row is refused with a reason.
const timedOnly: CalendarPolicy<Meeting, string, never> = ({ proposed }) =>
  proposed === null || proposed.kind === "timed"
    ? { type: "accept" }
    : { type: "reject", reason: "meetings-need-a-time" };

export function EditableCalendar({ initial }: { readonly initial: readonly Meeting[] }) {
  const [meetings, setMeetings] = useState(initial);

  return (
    <Calendar.Root
      events={meetings}
      onEventChange={(change) => setMeetings((current) => applyChange(current, change))}
      policies={[timedOnly, snapPolicy({ minutes: 15 }), minimumDurationPolicy({ minutes: 15 })]}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
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

## The change object

| Field      | Contents                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `cause`    | `"move"`, `"resize-start"`, `"resize-end"`, `"create"`, `"delete"` or `"update"`               |
| `eventId`  | The event's ID, or `null` for a create                                                         |
| `event`    | Your record. `null` for a create, unless an undo restores a deleted record or a drop brings one |
| `original` | Where the event was, or `null` for a create                                                    |
| `proposed` | Where it should go: `{ kind, start, end, resourceIds }`, or `null` for a delete                |
| `id`       | The change's own ID, such as `change-3`. Not an event ID                                       |
| `warnings` | Reasons policies flagged and let through. Absent when there are none                           |

Narrow before you read: check `cause === "delete"` before `proposed`, and `proposed.kind` before treating `start` as an instant.

`onEventChange`'s second argument is `{ input, history?, fields? }`. `input` is `"pointer"`, `"keyboard"`, `"api"` or `"agent"`. `"agent"` is anything an agent's step causes: the calendar's own actions, and a proposal the app's own button makes when an agent presses it. `history` is `"undo"` or `"redo"` for a change the event history proposes. `fields` is what the proposer sent beside the placement: an agent's `createEvent` and `updateEvent` put the title and the app's own fields there, with nothing inside them checked, and the handler stores what it accepts (`agent-ready.md#save-what-the-agent-sent`). A drag has none.

## Saving that takes time

- A handler that returns nothing commits the change at once. Update the events in that handler.
- A handler that returns a promise keeps the change **pending** until it settles. The event shows in its new place meanwhile, with `isPending: true`, `data-pending` and `aria-busy`.
  - Resolved: the calendar keeps showing the change until `events` next changes, so include the saved change in that update.
  - Rejected, or the handler throws: the change is rolled back.
- Two changes to one event can save in either order. Number them as they start and apply a result only if no newer one was applied, as `docs/interactions.md#pending-changes` shows. Copy that pattern for a real backend.

`Calendar.useCalendarPendingChanges()` lists changes still on their way, for a "Saving…" indicator.

## Policies

A policy is `(change, context) => decision`. `context` is `{ events, timeZone, availability?, detail? }`. A decision is `{ type: "accept" }`, `{ type: "adjust", proposed }`, `{ type: "reject", reason }` or `{ type: "warn", reason }`. Policies run in order, each on the change as the ones before adjusted it, and can be `async`.

| Built in                                    | Does                                                           |
| ------------------------------------------- | -------------------------------------------------------------- |
| `snapPolicy({ minutes: 15 })`               | Rounds to a grid in the calendar's time zone                   |
| `minimumDurationPolicy({ minutes: 15 })`    | Lengthens what would be too short                              |
| `boundsPolicy({ start, end })`              | Rejects what lands outside two instants: `out-of-bounds`       |
| `availabilityPolicy({ mode })`              | Blocks or warns outside working hours: `outside-availability`  |
| `conflictPolicy({ mode, getResourceMode })` | Blocks or warns on double booking: `resource-conflict`         |
| `readOnlyResourcesPolicy(isReadOnly)`       | Rejects changes on marked resources: `read-only-resource`      |
| `readOnlyPolicy()`                          | Always runs first. Don't pass it                               |

- **Put rules in policies, not in the handler.** A policy's `reason` reaches the person (as a refused drop) and an agent (as the step's error). An error thrown from `onEventChange` reads `handler-error`, for a person and an agent alike.
- **Keep policies free of side effects.** They also run to preview a drop or a keyboard move, with the `input` the commit will have, so a rule on `detail?.input` marks the preview the way it decides the drop.
- **Read `context.detail` as `detail?.input`.** It's `undefined` when code calls a policy outside a proposal.

## Propose from your own UI

```tsx title="push-back-button.tsx"
"use client";

import { Calendar, type Meeting } from "./calendar";

export function PushBackButton({ meeting }: { readonly meeting: Meeting }) {
  const actions = Calendar.useCalendarActions();

  async function pushBack() {
    // Resolves with how it ended. It never rejects.
    const result = await actions.proposeEventChange({
      cause: "move",
      eventId: meeting.id,
      proposed: {
        kind: "timed",
        start: meeting.start.add({ hours: 1 }),
        end: meeting.end.add({ hours: 1 }),
      },
    });
    if (result.status === "rejected") console.warn(`Not moved: ${result.reason}`);
  }

  return (
    <button type="button" onClick={pushBack}>
      Push back an hour
    </button>
  );
}
```

Create with `{ cause: "create", proposed: { kind, start, end } }`. Delete with `{ cause: "delete", eventId }`. A change to anything but time and resources, such as a title, is the app's own state update: the calendar isn't involved.

Rejection reasons: a policy's own reason, `read-only`, `invalid-placement` (an empty or reversed range), `handler-error`, `policy-error`, `superseded` (a newer change to the same event replaced it), `unknown-event`, and `agent-delete-not-allowed` (an agent caused a delete on a `Root` without `allowAgentDelete`).

## How a change ended

`onEventChangeResult(result, detail)` hears every proposal once it settles: `result.status` is `"committed"` or `"rejected"` with a `reason`, and `detail.input` says who proposed it. Use it for a toast on a failed save, for logging, and for undo.

## Undo and redo

```tsx
import { createEventHistory, useCalendarHistory } from "@moltenship/calendar";

const [history] = useState(() => createEventHistory<Meeting, string, never>({ limit: 50 }));

<Calendar.Root onEventChangeResult={history.record} … />;

// Anywhere inside Root:
const { canRedo, canUndo, redo, undo } = useCalendarHistory(history);
```

An undo is a proposal like any other: it goes through the policies and `onEventChange`. Undoing a create or a delete needs the history to find the record a create became (`createdEventId`). Read `docs/undo-redo.md#creates-and-deletes` before wiring that. The history records every input by default, an agent's included.

## Dragging

With `onEventChange` set, the registry views let people move, resize and create with a mouse, a pen, touch and the keyboard. There is nothing to turn on. Each finished drag sends exactly one change. Clicking an empty slot creates nothing: creating needs a drag, or keys.

To drag the app's own items into the calendar, use `@moltenship/calendar-dnd-kit` (`docs/guides/dnd-kit.md`).

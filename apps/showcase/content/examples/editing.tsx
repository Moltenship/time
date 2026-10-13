"use client";

// #region apply
import {
  eventPlacement,
  minimumDurationPolicy,
  moveEventPlacement,
  snapPolicy,
  type CalendarEventChange,
  type CalendarPolicy,
  type CalendarProposalDetail,
  type CalendarTransactionResult,
} from "@moltenship/calendar";
import { useEffect, useRef, useState } from "react";

import { Calendar, meetings as initialMeetings, weekRules, type Meeting } from "./quick-start";

type MeetingChange = CalendarEventChange<Meeting, string, never>;

function applyChange(meetings: readonly Meeting[], change: MeetingChange): readonly Meeting[] {
  if (change.cause === "delete") {
    return meetings.filter((meeting) => meeting.id !== change.eventId);
  }
  if (change.proposed.kind !== "timed") return meetings;

  const { start, end } = change.proposed;
  if (change.cause === "create") {
    const id = crypto.randomUUID();
    return [...meetings, { id, title: "New meeting", color: "blue", start, end }];
  }
  return meetings.map((meeting) =>
    meeting.id === change.eventId ? { ...meeting, start, end } : meeting,
  );
}
// #endregion apply

// #region save
async function saveToServer(change: MeetingChange): Promise<void> {
  const response = await fetch("/api/meeting-changes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(change),
  });
  if (!response.ok) throw new Error(`Saving failed with ${response.status}`);
}
// #endregion save

// #region policies
// Meetings always have a time, so refuse drops onto the all-day row.
const timedOnly: CalendarPolicy<Meeting, string, never> = ({ proposed }) =>
  proposed === null || proposed.kind === "timed"
    ? { type: "accept" }
    : { type: "reject", reason: "meetings-need-a-time" };
// #endregion policies

// #region root
export function EditableCalendar() {
  const [meetings, setMeetings] = useState(initialMeetings);
  // Number changes as they start, and remember the newest one applied to each event, so a slow
  // save never replaces a newer saved edit.
  const nextOrder = useRef(0);
  const lastApplied = useRef(new Map<string, number>());

  return (
    <Calendar.Root
      events={meetings}
      onEventChange={async (change) => {
        const order = ++nextOrder.current;
        await saveToServer(change);
        if (change.eventId !== null) {
          if ((lastApplied.current.get(change.eventId) ?? 0) > order) return;
          lastApplied.current.set(change.eventId, order);
        }
        setMeetings((current) => applyChange(current, change));
      }}
      policies={[timedOnly, snapPolicy({ minutes: 15 }), minimumDurationPolicy({ minutes: 15 })]}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}
// #endregion root

// #region propose
export function PushBackButton({ meeting }: { readonly meeting: Meeting }) {
  const actions = Calendar.useCalendarActions();
  const [message, setMessage] = useState("");

  async function pushBack() {
    const result = await actions.proposeEventChange({
      cause: "move",
      eventId: meeting.id,
      proposed: {
        kind: "timed",
        start: meeting.start.add({ hours: 1 }),
        end: meeting.end.add({ hours: 1 }),
      },
    });
    setMessage(result.status === "committed" ? "Moved" : `Not moved: ${result.reason}`);
  }

  return (
    <>
      <button type="button" onClick={pushBack}>
        Push back an hour
      </button>
      <output>{message}</output>
    </>
  );
}
// #endregion propose

// #region outcomes
// <Calendar.Root onEventChangeResult={reportOutcome} … />
export function reportOutcome(
  result: CalendarTransactionResult<Meeting, string, never>,
  { input }: CalendarProposalDetail,
) {
  if (result.status === "committed") return;
  // An AbortError is your own handler cancelling the change, not a failed save.
  if (result.error instanceof DOMException && result.error.name === "AbortError") return;
  console.warn(`A ${input} change wasn't saved: ${result.reason}`, result.error);
}
// #endregion outcomes

// #region saving
// Anywhere inside Root, such as in the toolbar.
export function SavingStatus() {
  // Saved changes that only wait for your events don't count.
  const saving = Calendar.useCalendarPendingChanges((changes) =>
    [...changes.values()].some(({ phase }) => phase !== "awaiting-events"),
  );

  useEffect(() => {
    if (!saving) return;
    // Ask before the page closes while a change is still on its way.
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);

  return <output>{saving ? "Saving…" : "All changes saved"}</output>;
}
// #endregion saving

// #region placement
export function useMoveToTomorrow() {
  const actions = Calendar.useCalendarActions();
  const { eventSnapshot } = Calendar.useCalendarMeta();
  const { timeZone } = Calendar.useCalendarState();

  return (eventId: string) => {
    const event = eventSnapshot.get(eventId);
    if (event === undefined) return;
    return actions.proposeEventChange({
      cause: "move",
      eventId,
      proposed: moveEventPlacement(eventPlacement(event), { days: 1 }, { timeZone }),
    });
  };
}
// #endregion placement

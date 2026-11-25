import {
  createEventHistory,
  useCalendarHistory,
  useCalendarHistoryShortcuts,
  type CalendarEventChange,
  type CalendarPolicy,
  type EventHistory,
} from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";

import { announcements, historyAnnouncements } from "./announcements";
import { seed, weekRules } from "./app";
import { Calendar, type Meeting } from "./calendar";

type MeetingChange = CalendarEventChange<Meeting, string, never>;
type MeetingHistory = EventHistory<Meeting, string, never>;

// Meetings always have a time, so drops onto an all-day cell are refused rather than saved as
// nothing, which the history would record.
const timedOnly: CalendarPolicy<Meeting, string, never> = ({ proposed }) =>
  proposed === null || proposed.kind === "timed"
    ? { type: "accept" }
    : { type: "reject", reason: "meetings-need-a-time" };

// #region apply
function applyChange(
  meetings: readonly Meeting[],
  change: MeetingChange,
  id: string = crypto.randomUUID(),
): readonly Meeting[] {
  if (change.cause === "delete") {
    return meetings.filter((meeting) => meeting.id !== change.eventId);
  }
  if (change.proposed.kind !== "timed") return meetings;

  const interval = change.proposed;
  if (change.cause === "create") {
    // Undoing a delete proposes a create with the deleted meeting: bring it back as it was.
    const meeting = change.event ?? { id, title: "New meeting" };
    return [...meetings, { ...meeting, interval }];
  }
  return meetings.map((meeting) =>
    meeting.id === change.eventId ? { ...meeting, interval } : meeting,
  );
}
// #endregion apply

// #region root
export function UndoableCalendar() {
  const [meetings, setMeetings] = createSignal(seed);
  // The meeting each create became, by change ID, so the history can find it to undo.
  const createdIds = new Map<string, string>();
  const history = createEventHistory<Meeting, string, never>({
    limit: 50,
    // Once the meetings show it.
    createdEventId: (change, events) => {
      const id = createdIds.get(change.id);
      return id !== undefined && events.get(id) !== undefined ? id : undefined;
    },
  });

  return (
    <Calendar.Root
      events={meetings()}
      onEventChange={(change) => {
        // A restored meeting keeps its ID; one made from a range gets a new one.
        const id =
          change.cause === "create" ? (change.event?.id ?? crypto.randomUUID()) : undefined;
        if (id !== undefined) createdIds.set(change.id, id);
        setMeetings((current) => applyChange(current, change, id));
      }}
      onEventChangeResult={(result, detail) => history.record(result, detail)}
      policies={[timedOnly]}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame>
        <Calendar.Toolbar>
          <Calendar.Title />
          <UndoButtons history={history} />
        </Calendar.Toolbar>
        <Calendar.Viewport>
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
      <Calendar.Announcer messages={announcements} />
    </Calendar.Root>
  );
}
// #endregion root

// #region buttons
// Anywhere inside Root.
function UndoButtons(props: { readonly history: MeetingHistory }) {
  const controls = useCalendarHistory(props.history, { messages: historyAnnouncements });

  return (
    <>
      <button type="button" disabled={!controls().canUndo} onClick={() => void controls().undo()}>
        Undo
      </button>
      <button type="button" disabled={!controls().canRedo} onClick={() => void controls().redo()}>
        Redo
      </button>
    </>
  );
}
// #endregion buttons

// #region shortcuts
// Anywhere inside Root. It renders nothing, and adds the keys to the calendar's frame.
export function UndoShortcuts(props: { readonly history: MeetingHistory }) {
  const controls = useCalendarHistory(props.history, { messages: historyAnnouncements });
  const meta = Calendar.useCalendarMeta();
  useCalendarHistoryShortcuts(controls, () => ({ scope: meta().refs.frame }));
  return null;
}
// #endregion shortcuts

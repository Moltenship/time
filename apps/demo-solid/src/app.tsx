import { createEventHistory, type CalendarWeekRules } from "@moltenship/calendar-core";
import { useCalendarHistory, useCalendarHistoryShortcuts } from "@moltenship/calendar-solid";
import { createEffect, createSignal } from "solid-js";

import { AgentPanel } from "./agent-panel";
import { announcements, historyAnnouncements } from "./announcements";
import { Calendar, type Meeting } from "./calendar";
import { FrameworkSwitch } from "./framework-switch";
import { readSolidLocation, writeSolidLocation } from "./url-state";

const timeZone = Temporal.Now.timeZoneId();
const today = Temporal.Now.plainDateISO(timeZone);
const at = (date: Temporal.PlainDate, time: string) =>
  date.toZonedDateTime({ plainTime: Temporal.PlainTime.from(time), timeZone }).toInstant();
const timed = (date: Temporal.PlainDate, start: string, end: string) =>
  ({ end: at(date, end), kind: "timed", start: at(date, start) }) as const;

const seed: readonly Meeting[] = [
  { id: "design-review", interval: timed(today, "10:00", "11:00"), title: "Design review" },
  { id: "team-lunch", interval: timed(today.add({ days: 1 }), "12:30", "13:30"), title: "Lunch" },
  {
    id: "board-meeting",
    interval: timed(today.add({ days: 2 }), "09:00", "10:30"),
    locked: true,
    title: "Board meeting",
  },
  {
    id: "offsite",
    interval: { end: today.add({ days: 7 }), kind: "all-day", start: today.add({ days: 5 }) },
    title: "Offsite",
  },
];

// ISO weeks: they start on Monday, and the first has four days of the new year.
const weekRules: CalendarWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] };

// The Solid integration's docs, which say what the preview has and what comes next.
const docsUrl = "https://time.molten.sh/docs/solid";

const local = (date: Temporal.PlainDate, time: string) => `${date.toString()}T${time}`;

/** What the agent panel runs, each one step through the bridge. */
const steps = [
  { action: "describeCalendar", args: [], label: "Read the calendar" },
  { action: "listEvents", args: [], label: "List the visible events" },
  { action: "navigateNext", args: [], label: "Next period" },
  { action: "navigateToday", args: [], label: "Back to today" },
  { action: "setView", args: [{ view: "agenda" }], label: "Switch to the agenda" },
  { action: "setView", args: [{ view: "month" }], label: "Switch to the month" },
  {
    action: "moveEvent",
    args: [{ eventId: "design-review", start: local(today.add({ days: 1 }), "14:00") }],
    label: "Move the design review to tomorrow 14:00",
  },
  {
    action: "createEvent",
    args: [
      {
        end: local(today.add({ days: 3 }), "16:00"),
        start: local(today.add({ days: 3 }), "15:00"),
        title: "Agent's event",
      },
    ],
    label: "Create an event in three days",
  },
  {
    action: "moveEvent",
    args: [{ eventId: "board-meeting", start: local(today.add({ days: 3 }), "09:00") }],
    label: "Move the locked board meeting (refused)",
  },
  { action: "selectEvent", args: [{ eventId: "team-lunch" }], label: "Select the lunch" },
  { action: "deleteEvent", args: [{ eventId: "team-lunch" }], label: "Delete the lunch" },
] as const;

/** The event each create became, by change ID, so undo finds it. */
const createdIds = new Map<string, string>();

/** Every saved change, from a drag, a key or the agent, for undo and redo. */
const changes = createEventHistory<Meeting, string, string>({
  // Once the events show it.
  createdEventId: (change, events) => {
    const id = createdIds.get(change.id);
    return id !== undefined && events.get(id) !== undefined ? id : undefined;
  },
});

/** Undo and redo, as buttons and as Ctrl+Z and Ctrl+Y, or ⌘Z and ⇧⌘Z, inside the calendar. */
function HistoryControls() {
  const controls = useCalendarHistory(changes, { messages: historyAnnouncements });
  const meta = Calendar.useCalendarMeta();
  useCalendarHistoryShortcuts(controls, () => ({ scope: meta().refs.frame }));
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

export function App() {
  const [events, setEvents] = createSignal<readonly Meeting[]>(seed);
  // The view and date come from the URL and go back into it, so the framework switch keeps them.
  const [location, setLocation] = createSignal(
    readSolidLocation(window.location.search, { date: today, view: "month" }),
  );
  // What the URL says for them, which the effect writes and the framework switch's links carry.
  const href = () => writeSolidLocation(window.location.href, location());
  createEffect(href, (next) => {
    history.replaceState(history.state, "", next);
  });
  const [allowDelete, setAllowDelete] = createSignal(false);
  const [lastChange, setLastChange] = createSignal("none yet");
  let created = 0;

  return (
    <main>
      <header class="header">
        <h1>Calendar</h1>
        <FrameworkSwitch search={new URL(href()).search} />
      </header>
      <p class="preview">
        This page runs <code>@moltenship/calendar-solid</code>, a preview. The agenda is the
        registry's Solid list view, the files <code>shadcn add</code> installs into a Solid app: up
        and down move between events, Page Up and Page Down between days. The month grid is this
        page's own view on the package's hooks: arrow keys move through days and events, Space picks
        an event up or starts a new one, a pointer drags an event to move it, its ends to resize it,
        or across days to create one, and Undo and Redo take changes back.{" "}
        <a href={docsUrl}>The Solid docs</a>
      </p>
      <p class="hint">
        A Solid 2.0 calendar on the engine's month and list projections, with an agent driving it
        through ui-sdk. Last change: <output data-last-change="">{lastChange()}</output>
      </p>
      <Calendar.Root
        allowAgentDelete={allowDelete()}
        anchorDate={location().date}
        defaultTimeZone={timeZone}
        events={events()}
        label="Team calendar"
        locale={navigator.language}
        onEventChange={(change, detail) => {
          setLastChange(`${change.cause} by ${detail.input}`);
          if (change.cause === "delete") {
            setEvents((current) => current.filter((event) => event.id !== change.eventId));
          } else if (change.cause === "create") {
            // Undoing a delete proposes a create with the deleted record: it comes back as it was.
            // An agent names a new event; the calendar passes the title on as a field.
            const title =
              typeof detail.fields?.title === "string" ? detail.fields.title : "New event";
            const event = change.event ?? { id: `created-${(created += 1)}`, title };
            createdIds.set(change.id, event.id);
            setEvents((current) => [...current, { ...event, interval: change.proposed }]);
          } else {
            setEvents((current) =>
              current.map((event) =>
                event.id === change.eventId ? { ...event, interval: change.proposed } : event,
              ),
            );
          }
        }}
        onEventChangeResult={(result, detail) => changes.record(result, detail)}
        onAnchorDateChange={(date) => setLocation((current) => ({ ...current, date }))}
        onViewChange={(view) => setLocation((current) => ({ ...current, view }))}
        policies={[
          // A locked event stays where it is: the change fails, and an agent hears the reason.
          (change) =>
            change.cause !== "create" && change.event.locked === true
              ? { reason: "locked-event", type: "reject" }
              : { type: "accept" },
        ]}
        view={location().view}
        weekRules={weekRules}
      >
        <div class="layout">
          <Calendar.Frame class="calendar">
            <Calendar.Toolbar class="toolbar">
              <Calendar.PreviousTrigger aria-label="Previous">‹</Calendar.PreviousTrigger>
              <Calendar.TodayTrigger>Today</Calendar.TodayTrigger>
              <Calendar.NextTrigger aria-label="Next">›</Calendar.NextTrigger>
              <Calendar.Title class="title" />
              <HistoryControls />
              <Calendar.ViewSwitcher
                aria-label="View"
                getViewLabel={(name) => (name === "month" ? "Month" : "Agenda")}
              />
            </Calendar.Toolbar>
            <Calendar.Viewport class="viewport">
              <Calendar.ActiveView />
            </Calendar.Viewport>
          </Calendar.Frame>
          <Calendar.Announcer messages={announcements} />
          <AgentPanel
            allowDelete={allowDelete()}
            onAllowDeleteChange={setAllowDelete}
            steps={steps}
          />
        </div>
      </Calendar.Root>
    </main>
  );
}

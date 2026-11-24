import type { CalendarWeekRules } from "@moltenship/calendar-core";
import { createSignal } from "solid-js";

import { AgentPanel } from "./agent-panel";
import { Calendar, type Meeting, type View } from "./calendar";

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

const local = (date: Temporal.PlainDate, time: string) => `${date.toString()}T${time}`;

/** What the agent panel runs, each one step through the bridge. */
const steps = [
  { action: "describeCalendar", args: [], label: "Read the calendar" },
  { action: "listEvents", args: [], label: "List the visible events" },
  { action: "navigateNext", args: [], label: "Next period" },
  { action: "navigateToday", args: [], label: "Back to today" },
  { action: "setView", args: [{ view: "list" }], label: "Switch to the list" },
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

export function App() {
  const [events, setEvents] = createSignal<readonly Meeting[]>(seed);
  const [view, setView] = createSignal<View>("month");
  const [allowDelete, setAllowDelete] = createSignal(false);
  const [lastChange, setLastChange] = createSignal("none yet");
  let created = 0;

  return (
    <main>
      <h1>calendar-solid</h1>
      <p class="hint">
        A Solid 2.0 calendar on the engine's month and list projections, with an agent driving it
        through ui-sdk. Last change: <output data-last-change="">{lastChange()}</output>
      </p>
      <Calendar.Root
        allowAgentDelete={allowDelete()}
        defaultAnchorDate={today}
        defaultTimeZone={timeZone}
        events={events()}
        label="Team calendar"
        locale={navigator.language}
        onEventChange={(change, detail) => {
          setLastChange(`${change.cause} by ${detail.input}`);
          if (change.cause === "delete") {
            setEvents((current) => current.filter((event) => event.id !== change.eventId));
          } else if (change.cause === "create") {
            created += 1;
            // An agent names its event; the calendar passes the title on as a field.
            const title =
              typeof detail.fields?.title === "string" ? detail.fields.title : "New event";
            setEvents((current) => [
              ...current,
              { id: `created-${created}`, interval: change.proposed, title },
            ]);
          } else {
            setEvents((current) =>
              current.map((event) =>
                event.id === change.eventId ? { ...event, interval: change.proposed } : event,
              ),
            );
          }
        }}
        onViewChange={(next) => setView(next)}
        policies={[
          // A locked event stays where it is: the change fails, and an agent hears the reason.
          (change) =>
            change.cause !== "create" && change.event.locked === true
              ? { reason: "locked-event", type: "reject" }
              : { type: "accept" },
        ]}
        view={view()}
        weekRules={weekRules}
      >
        <div class="layout">
          <Calendar.Frame class="calendar">
            <Calendar.Toolbar class="toolbar">
              <Calendar.PreviousTrigger aria-label="Previous">‹</Calendar.PreviousTrigger>
              <Calendar.TodayTrigger>Today</Calendar.TodayTrigger>
              <Calendar.NextTrigger aria-label="Next">›</Calendar.NextTrigger>
              <Calendar.Title class="title" />
              <Calendar.ViewSwitcher
                aria-label="View"
                getViewLabel={(name) => (name === "month" ? "Month" : "List")}
              />
            </Calendar.Toolbar>
            <Calendar.Viewport class="viewport">
              <Calendar.ActiveView />
            </Calendar.Viewport>
          </Calendar.Frame>
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

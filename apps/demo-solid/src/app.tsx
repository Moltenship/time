import { createEventHistory, type CalendarWeekRules } from "@moltenship/calendar-core";
import { useCalendarHistory } from "@moltenship/calendar-solid";
import { createEffect, createSignal, For } from "solid-js";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { MiniMonth } from "@registry/calendar/mini-month";
import { ViewSwitcher } from "@registry/calendar/view-switcher";
import { CalendarHistoryToast } from "@registry/calendar-history-toast/calendar-history-toast";
import { Button } from "@registry/calendar-ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@registry/calendar-ui/select";
import { useRecurrenceScopePrompt } from "@registry/recurrence-scope-dialog/use-recurrence-scope-prompt";

import { AgentPanel } from "./agent-panel";
import { announcements, historyAnnouncements } from "./announcements";
import { Calendar, type Meeting } from "./calendar";
import {
  dragPreviewOptions,
  readDragPreview,
  writeDragPreview,
  type DragPreview,
} from "./drag-preview";
import { FrameworkSwitch } from "./framework-switch";
import { applyToSeries, seriesScopes } from "./series";
import { readSolidLocation, writeSolidLocation, type SolidView } from "./url-state";

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
  // A sync every day for five days, at 16:00: changing one asks which ones it applies to.
  ...Array.from({ length: 5 }, (_, day) => ({
    id: `sync-${day + 1}`,
    interval: timed(today.add({ days: day }), "16:00", "16:30"),
    series: "sync",
    title: "Team sync",
  })),
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
  { action: "setView", args: [{ view: "week" }], label: "Switch to the week" },
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
  // A step holds one event, so undo can't take back a change to the Team sync's other occurrences.
  filter: (change) => change.cause === "create" || change.event.series === undefined,
  // Once the events show it.
  createdEventId: (change, events) => {
    const id = createdIds.get(change.id);
    return id !== undefined && events.get(id) !== undefined ? id : undefined;
  },
});

/** Undo and redo as buttons. The registry's undo toast adds Ctrl+Z and Ctrl+Y, or ⌘Z and ⇧⌘Z. */
function HistoryControls() {
  const controls = useCalendarHistory(changes, { messages: historyAnnouncements });
  return (
    <>
      <Button disabled={!controls().canUndo} onClick={() => controls().undo()} variant="outline">
        Undo
      </Button>
      <Button disabled={!controls().canRedo} onClick={() => controls().redo()} variant="outline">
        Redo
      </Button>
    </>
  );
}

const viewOptions = [
  { label: "Day", value: "day" },
  { label: "3 days", value: "3-day" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Year", value: "year" },
  { label: "Agenda", value: "agenda" },
] as const satisfies readonly { readonly label: string; readonly value: SolidView }[];

/** How a pointer drag previews where it lands, as the React demo's settings choose it. */
function DragPreviewSelect(props: {
  readonly onValueChange: (preview: DragPreview) => void;
  readonly value: DragPreview;
}) {
  return (
    <Select
      items={dragPreviewOptions}
      value={props.value}
      onValueChange={(next) => {
        const option = dragPreviewOptions.find((candidate) => candidate.value === next);
        if (option !== undefined) props.onValueChange(option.value);
      }}
    >
      <SelectTrigger aria-label="Dragging">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        <For each={dragPreviewOptions} keyed={(option) => option.value}>
          {(option) => (
            <SelectItem label={option().label} value={option().value}>
              {option().label}
            </SelectItem>
          )}
        </For>
      </SelectContent>
    </Select>
  );
}

/** The registry's mini month, following the calendar: it shows the range the view shows. */
function Sidebar(props: {
  readonly date: Temporal.PlainDate;
  readonly onSelectDate: (date: Temporal.PlainDate) => void;
}) {
  const visibleRange = Calendar.useVisibleRange();
  return (
    <MiniMonth
      locale={navigator.language}
      onSelectDate={props.onSelectDate}
      selectedDate={props.date}
      today={today}
      visibleRange={visibleRange() ?? undefined}
      weekStartsOn={weekRules.firstDay}
    />
  );
}

export function App() {
  const [events, setEvents] = createSignal<readonly Meeting[]>(seed);
  // The view and date come from the URL and go back into it, so the framework switch keeps them.
  const [location, setLocation] = createSignal(
    readSolidLocation(window.location.search, { date: today, view: "month" }),
  );
  const [dragPreview, setDragPreview] = createSignal(readDragPreview(window.location.search));
  // What the URL says for them, which the effect writes and the framework switch's links carry.
  const href = () =>
    writeDragPreview(writeSolidLocation(window.location.href, location()), dragPreview());
  createEffect(href, (next) => {
    history.replaceState(history.state, "", next);
  });
  const [allowDelete, setAllowDelete] = createSignal(false);
  const { ask, dialog } = useRecurrenceScopePrompt();
  const [lastChange, setLastChange] = createSignal("none yet");
  let created = 0;

  return (
    <main>
      <header class="header">
        <h1>Calendar</h1>
        <FrameworkSwitch search={new URL(href()).search} />
      </header>
      <p class="preview">
        This page runs <code>@moltenship/calendar-solid</code>, a preview. The toolbar, the view
        switcher, the mini month, the week, day, month, year and agenda, the recurrence dialog and
        the undo toast are the registry's Solid items, the files <code>shadcn add</code> installs
        into a Solid app. Arrow keys move through the week's and day's 15-minute slots and the
        month's days, Enter moves into the events there, and Space picks an event up or starts a new
        one. A pointer drags an event to another time or day, or its edges, or across empty time or
        days to create one. In the year, arrow keys move through days and Enter or a click lists a
        day's events. In the agenda, up and down move between events, Page Up and Page Down between
        days. A change to a Team sync asks which of the series it applies to, and every other change
        shows a toast to undo it; F6 reaches it. <a href={docsUrl}>The Solid docs</a>
      </p>
      <p class="hint">
        A Solid 2.0 calendar on the engine's time grid, month, year and list projections, with an
        agent driving it through ui-sdk. Last change:{" "}
        <output data-last-change="">{lastChange()}</output>
      </p>
      <Calendar.Root
        allowAgentDelete={allowDelete()}
        anchorDate={location().date}
        defaultTimeZone={timeZone}
        events={events()}
        label="Team calendar"
        locale={navigator.language}
        onEventChange={async (change, detail) => {
          setLastChange(`${change.cause} by ${detail.input}`);
          if (change.cause !== "create" && change.event.series !== undefined) {
            const scope = await ask({
              action: change.cause === "delete" ? "delete" : "edit",
              eventTitle: change.event.title,
              scopes: seriesScopes(change, events()),
            });
            // Rejecting rolls the change back; an `AbortError` is announced as a cancel.
            if (scope === null) throw new DOMException("Cancelled", "AbortError");
            setEvents((current) => applyToSeries(current, change, scope));
          } else if (change.cause === "delete") {
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
        viewOptions={{
          "3-day": { dragPreview: dragPreview() },
          day: { dragPreview: dragPreview() },
          month: { dragPreview: dragPreview() },
          week: { dragPreview: dragPreview() },
        }}
        weekRules={weekRules}
      >
        <div class="layout">
          <Calendar.Frame class="calendar">
            <CalendarToolbar calendar={Calendar} class="toolbar">
              <HistoryControls />
              <DragPreviewSelect onValueChange={setDragPreview} value={dragPreview()} />
              <ViewSwitcher
                onValueChange={(view) => setLocation((current) => ({ ...current, view }))}
                options={viewOptions}
                value={location().view}
              />
            </CalendarToolbar>
            <Calendar.Viewport class="viewport">
              <Calendar.ActiveView />
            </Calendar.Viewport>
          </Calendar.Frame>
          <Calendar.Announcer messages={announcements} />
          <CalendarHistoryToast
            announcements={historyAnnouncements}
            calendar={Calendar}
            history={changes}
          />
          <div class="side">
            <Sidebar
              date={location().date}
              onSelectDate={(date) => setLocation((current) => ({ ...current, date }))}
            />
            <AgentPanel
              allowDelete={allowDelete()}
              onAllowDeleteChange={setAllowDelete}
              steps={steps}
            />
          </div>
        </div>
      </Calendar.Root>
      {dialog}
    </main>
  );
}

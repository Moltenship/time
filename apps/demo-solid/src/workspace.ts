import {
  availabilityPolicy,
  conflictPolicy,
  createEventHistory,
  eventIdOf,
  useNow,
  type CalendarEventUpdateChange,
  type CalendarFocus,
  type CalendarSelection,
  type CalendarVisibleRange,
  type CalendarWeekRules,
  type EventId,
} from "@moltenship/calendar-solid";
import {
  createOccurrenceExpander,
  isRecurringChange,
  occurrenceId,
  recurrenceEditScopes,
  resolveRecurrenceEdit,
  type RecurrenceEditScope,
  type RecurrenceRule,
} from "@moltenship/calendar-recurrence";
import { createEffect, createMemo, createSignal, untrack } from "solid-js";

import {
  createDemoAnnotations,
  hiddenSourcesStorageKey,
  parseHiddenSources,
  serializeHiddenSources,
  type DemoAnnotationSourceId,
} from "@demo/annotations";
import { demoAvailability, demoResourcesWithHours } from "@demo/availability";
import { busyNowEvents } from "@demo/busy-now";
import type { DemoCalendarId } from "@demo/calendars";
import { demoAdapters, type DemoEvent, type DemoOccurrence, type DemoView } from "@demo/demo-model";
import { readDragPreview, writeDragPreview } from "@demo/drag-preview";
import { eventsStorageKey, seedAroundToday } from "@demo/demo-events";
import {
  draftForNewEvent,
  draftForTask,
  draftFromOccurrence,
  draftFromPlacement,
  type EventDraft,
} from "@demo/event-draft";
import { findEventElement } from "@demo/event-element";
import type { EventDialogSave } from "@demo/event-form";
import { applyEventChange, demoEventPolicy, type DemoEventChange } from "@demo/event-changes";
import { parseEvents, serializeEvents } from "@demo/event-storage";
import {
  hiddenCalendarsStorageKey,
  parseHiddenCalendars,
  serializeHiddenCalendars,
  toggleHidden,
} from "@demo/hidden-calendars";
import { around, covering } from "@demo/load-range";
import { demoResourceConflictMode, demoResourceOverlapLayout } from "@demo/resource-rules";
import { demoResourceGroups, demoResources, type DemoResourceId } from "@demo/resources";
import { applySeriesEdit, type DemoSeriesEdit, type SeriesEditExtras } from "@demo/series-edits";
import {
  defaultSettings,
  parseSettings,
  serializeSettings,
  settingsStorageKey,
  type DemoSettings,
} from "@demo/settings";
import {
  focusTask,
  loadTasks,
  seedTasks,
  serializeTasks,
  tasksStorageKey,
  type DemoTask,
  type DemoTaskList,
} from "@demo/tasks";
import { isUnscheduling } from "@demo/unschedule";

import { Calendar, type SolidView } from "./calendar";
import { activitySources } from "./activity";
import { createNotice, createPersistentSignal } from "./persisted";
import { viewFor } from "./scrolling";
import { readSolidLocation, writeSolidLocation } from "./url-state";

// The React demo's workspace (apps/demo/src/use-demo-workspace.ts) as Solid signals: the same
// saved state under the same keys, the same seed, policies and history, so the framework switch
// keeps the events, the settings and the theme, and the URL the view and the date.

/** The views this page registers, under the React demo's names for them. */
export const viewNames: readonly SolidView[] = Calendar.views.map(({ name }) => name);
export const hasView = (view: string): view is SolidView => viewNames.includes(view as SolidView);

/** How long a simulated save takes, so the pending state is visible. */
const saveDelayMs = 600;
const flagConflicts = conflictPolicy<DemoOccurrence, string, DemoResourceId>({ mode: "warn" });
const conflictsByKind = conflictPolicy<DemoOccurrence, string, DemoResourceId>({
  getResourceMode: demoResourceConflictMode,
  mode: "warn",
});
const hoursPolicies = {
  block: availabilityPolicy<DemoOccurrence, string, DemoResourceId>({ mode: "block" }),
  warn: availabilityPolicy<DemoOccurrence, string, DemoResourceId>({ mode: "warn" }),
};
const createId = () => crypto.randomUUID();

function warningNotice(warnings: readonly string[] | undefined): string | null {
  const outside = warnings?.includes("outside-availability") === true;
  const conflict = warnings?.includes("resource-conflict") === true;
  if (outside && conflict) return "Saved outside working hours, double-booking someone.";
  if (outside) return "Saved outside working hours.";
  return conflict ? "Saved, double-booking someone who's busy then." : null;
}

/**
 * Where an editor change sends the edited occurrence's ID, as in React: a rule change starts the
 * series over, so the edit's map gives way to the series' own ID or the occurrence where it went.
 */
function renamedIds(
  edit: DemoSeriesEdit,
  change: CalendarEventUpdateChange<DemoOccurrence, string, DemoResourceId>,
  rule: RecurrenceRule | null | undefined,
): ReadonlyMap<EventId, string> {
  if (rule === undefined) return edit.occurrenceIds;
  const seriesId = edit.scope === "all" ? edit.seriesId : (edit.newSeries?.id ?? edit.seriesId);
  const id = rule === null ? seriesId : occurrenceId(seriesId, change.proposed.start);
  return new Map([[change.eventId, id]]);
}

interface OpenEvent {
  readonly anchor: HTMLElement;
  /** Cleared on close while the anchor stays, so focus can return to it. */
  readonly eventId: EventId | null;
}

/** Asks which occurrences a change to a series applies to: the recurrence scope dialog. */
export type AskRecurrenceScope = (question: {
  readonly action: "delete" | "edit";
  readonly eventTitle: string;
  readonly scopes: readonly RecurrenceEditScope[];
}) => Promise<RecurrenceEditScope | null>;

const samePlainDate = (left: Temporal.PlainDate, right: Temporal.PlainDate) => left.equals(right);

export function createDemoWorkspace(askScope: AskRecurrenceScope) {
  const systemTimeZone = Temporal.Now.timeZoneId();
  const [settings, setSettings] = createPersistentSignal<DemoSettings>(
    settingsStorageKey,
    (stored) => parseSettings(stored, defaultSettings()),
    serializeSettings,
  );
  const timeZone = () => settings().timeZone;
  const now = useNow();
  const today = createMemo(
    () => (now() ?? Temporal.Now.instant()).toZonedDateTimeISO(timeZone()).toPlainDate(),
    { equals: samePlainDate },
  );

  // The view and date come from the URL and go back into it, so the framework switch keeps them.
  // Without a view in the URL, phones (under 640px) start on the day view, as in React.
  const [location, setLocation] = createSignal(
    untrack(() =>
      readSolidLocation(
        window.location.search,
        { date: today(), view: matchMedia("(max-width: 639px)").matches ? "day" : "week" },
        viewNames,
      ),
    ),
  );
  const [dragPreview, setDragPreview] = createSignal(readDragPreview(window.location.search));
  createEffect(
    () =>
      writeDragPreview(
        writeSolidLocation(window.location.href, location(), viewNames),
        dragPreview(),
      ),
    (href) => window.history.replaceState(window.history.state, "", href),
  );
  const scrolling = () => settings().scrolling;
  const view = () => viewFor(location().view, scrolling(), viewNames);
  const changeSettings = (next: DemoSettings) => {
    setSettings(next);
    setLocation((current) => ({
      ...current,
      view: viewFor(current.view, next.scrolling, viewNames),
    }));
  };
  const showView = (next: DemoView) => {
    if (hasView(next)) setLocation((current) => ({ ...current, view: next }));
  };

  const [events, setEvents] = createPersistentSignal<readonly DemoEvent[]>(
    eventsStorageKey,
    (stored) => parseEvents(stored) ?? seedAroundToday(timeZone()),
    serializeEvents,
  );
  const [taskItems, setTasks] = createPersistentSignal(tasksStorageKey, loadTasks, serializeTasks);
  const tasks: DemoTaskList = {
    addTask: (task: DemoTask) =>
      setTasks((current) => [task, ...current.filter(({ id }) => id !== task.id)]),
    removeTask: (id: string) => setTasks((current) => current.filter((task) => task.id !== id)),
    resets: { current: 0 },
    resetTasks: () => {
      tasks.resets.current += 1;
      setTasks(seedTasks);
    },
    get tasks() {
      return taskItems();
    },
  };

  // Moves, resizes and deletes can be undone; series edits and unschedules can't, as in React.
  const history = createEventHistory<DemoOccurrence, string, DemoResourceId>({
    filter: (change) =>
      !isRecurringChange(change) && !(change.cause === "delete" && isUnscheduling(change.eventId)),
  });
  const [failSaves, setFailSaves] = createSignal(false);
  const [notice, showNotice] = createNotice();
  const [hiddenCalendars, setHiddenCalendars] = createPersistentSignal(
    hiddenCalendarsStorageKey,
    parseHiddenCalendars,
    serializeHiddenCalendars,
  );
  const toggleCalendar = (calendarId: DemoCalendarId) =>
    setHiddenCalendars((current) => toggleHidden(current, calendarId));

  const [hiddenSources, setHiddenSources] = createPersistentSignal(
    hiddenSourcesStorageKey,
    parseHiddenSources,
    serializeHiddenSources,
  );
  const toggleSource = (sourceId: DemoAnnotationSourceId) =>
    setHiddenSources((current) => toggleHidden(current, sourceId));
  const annotationSources = createMemo(() =>
    activitySources.filter(({ id }) => !hiddenSources().has(id)),
  );
  const annotations = createMemo(() =>
    createDemoAnnotations(today(), timeZone(), Temporal.Now.instant()),
  );
  const availability = createMemo(() =>
    settings().workingHours === "off" ? undefined : demoAvailability(today()),
  );
  const policies = createMemo(() => {
    const { resourceRules, workingHours } = settings();
    const conflicts = resourceRules === "by-kind" ? conflictsByKind : flagConflicts;
    return workingHours === "warn" || workingHours === "block"
      ? [demoEventPolicy, hoursPolicies[workingHours], conflicts]
      : [demoEventPolicy, conflicts];
  });

  const [sidebarOpen, setSidebarOpen] = createSignal(false);
  const [shortcutsOpen, setShortcutsOpen] = createSignal(false);
  const [openEvent, setOpenEvent] = createSignal<OpenEvent | null>(null);
  let viewport: HTMLElement | undefined;
  // A drag that starts on the open popover's event renders it elsewhere; follow it there, and
  // close the popover once the event is no longer shown.
  createEffect(
    () => {
      const current = openEvent();
      return current?.eventId == null ? null : { anchor: current.anchor, eventId: current.eventId };
    },
    (open) => {
      if (open === null || viewport === undefined) return;
      const root = viewport;
      const observer = new MutationObserver(() => {
        if (open.anchor.isConnected) return;
        const anchor = findEventElement(root, open.eventId);
        setOpenEvent((current) =>
          current === null || anchor === null ? null : { ...current, anchor },
        );
      });
      observer.observe(root, { childList: true, subtree: true });
      return () => observer.disconnect();
    },
  );
  const [draft, setDraft] = createSignal<EventDraft | null>(null);
  // The task the editor is scheduling, which leaves the list once the event is saved, and the list
  // focus goes back to then, as the task's button goes with it.
  let draftTask: string | null = null;
  let scheduleList: HTMLElement | null = null;
  // Where focus goes back to when a range created in a view closes its dialog: the day or slot a
  // keyboard create ended on, or the task's button.
  const [createdFrom, setCreatedFrom] = createSignal<HTMLElement | null>(null);

  // Meetings in progress as the demo opens, so the resource views show people and rooms busy.
  const busyNow = createMemo(() => busyNowEvents(Temporal.Now.instant(), timeZone()));
  const expander = createMemo(() =>
    createOccurrenceExpander(demoAdapters, { defaultTimeZone: timeZone() }),
  );
  const [loadRange, setLoadRange] = createSignal(untrack(() => around(location().date)));
  const onVisibleRangeChange = (visible: CalendarVisibleRange) =>
    setLoadRange((current) => covering(current, visible.loadRange));
  const expanded = createMemo(
    () =>
      expander().expand([...events(), ...busyNow()], { range: loadRange(), timeZone: timeZone() })
        .occurrences,
  );
  const occurrences = createMemo(() =>
    expanded().filter(({ event }) => !hiddenCalendars().has(event.calendarId)),
  );
  // Busy-now meetings open too, read-only; they are shown but never stored.
  const shownEvent = createMemo(() => {
    const eventId = openEvent()?.eventId;
    return eventId == null ? undefined : occurrences().find(({ id }) => id === eventId);
  });

  const [focus, setFocus] = createSignal<CalendarFocus | null>(null);
  const [selection, setSelection] = createSignal<CalendarSelection | null>(null);
  const weekRules = createMemo<CalendarWeekRules>(() => {
    const { weekStartsOn } = settings();
    return { firstDay: weekStartsOn, minimalDays: weekStartsOn === 1 ? 4 : 1, weekend: [6, 7] };
  });
  // The React demo's options for each of its views; the views this page registers take theirs.
  const viewOptions = createMemo(() => {
    const { overlapLayout, resourceRules } = settings();
    const drag = { dragPreview: dragPreview() };
    const layout = { ...drag, overlapLayout };
    const all: Partial<Record<DemoView, object>> = {
      "3-day": drag,
      day: layout,
      month: drag,
      resources:
        resourceRules === "by-kind"
          ? { ...layout, getResourceOverlapLayout: demoResourceOverlapLayout }
          : layout,
      "scrolling-3-day": drag,
      "scrolling-day": layout,
      "scrolling-month": drag,
      "scrolling-week": layout,
      "timeline-week": drag,
      week: layout,
    };
    return Object.fromEntries(Object.entries(all).filter(([name]) => hasView(name)));
  });

  // Counts resets, so a save still in flight when the data was reset leaves the fresh seed alone.
  let resets = 0;
  const resetDemoData = () => {
    resets += 1;
    setEvents(seedAroundToday(timeZone()));
    tasks.resetTasks();
    history.clear();
  };

  // After a series edit renames occurrences, the open popover's anchor gives way to the renamed
  // occurrence's element once it renders. The calendar moves keyboard focus itself.
  let renaming: ReadonlyMap<EventId, string> | null = null;
  createEffect(occurrences, () => {
    const ids = renaming;
    if (ids === null || viewport === undefined) return;
    renaming = null;
    const root = viewport;
    setOpenEvent((current) => {
      if (current === null || current.anchor.isConnected) return current;
      const anchorId = eventIdOf(current.anchor);
      const nextId = anchorId === null ? undefined : ids.get(anchorId);
      const anchor = nextId === undefined ? null : findEventElement(root, nextId);
      return anchor === null ? current : { ...current, anchor };
    });
  });

  const saveEvent = (event: DemoEvent) =>
    setEvents((current) =>
      current.some(({ id }) => id === event.id)
        ? current.map((existing) => (existing.id === event.id ? event : existing))
        : [...current, event],
    );

  // Saves a series edit, and moves focus, selection and the open popover to the occurrences it
  // renames before `onEventChange` returns, so the calendar moves keyboard focus to the new IDs.
  const saveSeriesEdit = (
    edit: DemoSeriesEdit,
    ids: ReadonlyMap<EventId, string>,
    extras?: SeriesEditExtras,
  ) => {
    setEvents((current) => applySeriesEdit(current, edit, createId, extras));
    if (ids.size === 0) return;
    renaming = ids;
    const rename = (eventId: EventId) => ids.get(eventId) ?? eventId;
    setFocus((current) =>
      current?.kind === "event" ? { ...current, eventId: rename(current.eventId) } : current,
    );
    setSelection((current) =>
      current?.kind === "event" ? { ...current, eventId: rename(current.eventId) } : current,
    );
    setOpenEvent((current) =>
      current?.eventId == null ? current : { ...current, eventId: rename(current.eventId) },
    );
  };

  const askAndResolve = async (
    change: DemoEventChange,
    action: "delete" | "edit",
    eventTitle: string,
    wholeSeries = false,
  ): Promise<DemoSeriesEdit | string | null> => {
    const zone = timeZone();
    const options = { defaultTimeZone: zone, timeZone: zone };
    const scopes = recurrenceEditScopes(change, demoAdapters, options).filter(
      (scope) => !wholeSeries || scope !== "this",
    );
    if (scopes.length === 0) return "That change can't apply to this repeating event.";
    const scope = await askScope({ action, eventTitle, scopes });
    if (scope === null) return null;
    const edit = resolveRecurrenceEdit(change, scope, demoAdapters, {
      ...options,
      newSeriesId: createId(),
      occurrences: occurrences(),
    });
    if (edit.type === "series") return edit;
    return edit.type === "rejected" ? edit.message : "That change can't apply to this event.";
  };

  // Changes arrive here after the calendar has shown them optimistically; rejecting rolls the
  // calendar back. A range dragged out in a view opens the event dialog, which names and saves
  // the new event. A change to an occurrence of a series asks which occurrences it applies to.
  const persistChange = async (change: DemoEventChange) => {
    if (change.cause === "create" && change.event === null) {
      setOpenEvent(null);
      const focused = document.activeElement;
      setCreatedFrom(
        focused instanceof HTMLElement && viewport?.contains(focused) === true ? focused : null,
      );
      setDraft(draftFromPlacement(change.proposed, timeZone(), "work"));
      return;
    }
    const resetsAtStart = resets;
    let edit: DemoSeriesEdit | undefined;
    if (isRecurringChange(change)) {
      const action = change.cause === "delete" ? "delete" : "edit";
      const resolved = await askAndResolve(change, action, change.event.event.title);
      if (resolved === null) throw new DOMException("Cancelled", "AbortError");
      if (typeof resolved === "string") {
        showNotice(`${resolved} The change was undone.`);
        throw new Error("no-scope");
      }
      edit = resolved;
    }
    await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
    if (resets !== resetsAtStart) throw new Error("superseded-by-reset");
    if (failSaves()) {
      showNotice("Couldn't save the change, so it was undone.");
      throw new Error("simulated-save-failure");
    }
    if (edit === undefined) setEvents((current) => applyEventChange(current, change));
    else saveSeriesEdit(edit, edit.occurrenceIds);
    if (change.cause === "create" && change.event !== null) tasks.removeTask(change.event.id);
    const message = warningNotice(change.warnings);
    if (message !== null) showNotice(message);
  };

  // The editor saves an event as it is, or a change to an occurrence of a series, which asks for
  // its scope first. Resolves with an error for the editor to show; cancelling keeps it open.
  const saveFromDialog = async (save: EventDialogSave): Promise<string | undefined> => {
    if (save.type === "event") {
      saveEvent(save.event);
    } else {
      const { change, end, fields, rule } = save;
      // A new rule or end is the series', so it can't apply to this occurrence alone.
      const series = rule !== undefined || end !== undefined;
      const edit = await askAndResolve(change, "edit", fields.title, series);
      if (edit === null) return undefined;
      if (typeof edit === "string") return edit;
      const extras = { end, fields, placement: change.proposed, rule, timeZone: timeZone() };
      saveSeriesEdit(edit, renamedIds(edit, change, rule), extras);
    }
    setDraft(null);
    if (draftTask !== null) {
      setCreatedFrom(scheduleList);
      tasks.removeTask(draftTask);
    }
    draftTask = null;
    const message = warningNotice(save.warnings);
    if (message !== null) showNotice(message);
    return undefined;
  };

  // Schedules a task without dragging it: the editor opens on it, for the shown date.
  const scheduleTask = (task: DemoTask, opener: HTMLElement, list: HTMLElement | null) => {
    setSidebarOpen(false);
    setOpenEvent(null);
    setCreatedFrom(opener);
    scheduleList = list;
    setDraft(draftForTask(task, location().date, Temporal.Now.zonedDateTimeISO(timeZone())));
    draftTask = task.id;
  };
  const openCreate = () => {
    setSidebarOpen(false);
    setOpenEvent(null);
    setCreatedFrom(null);
    setDraft(draftForNewEvent(location().date, Temporal.Now.zonedDateTimeISO(timeZone()), "work"));
  };
  // Editing keeps the popover's anchor so the dialog can return focus to the event.
  const openEdit = (occurrence: DemoOccurrence) => {
    setOpenEvent((current) => current && { ...current, eventId: null });
    setDraft(draftFromOccurrence(occurrence, timeZone()));
  };
  // Views render each event as a `[data-event-id]` button, so one delegated listener opens any of
  // them, whichever view is active.
  const openClickedEvent = (click: MouseEvent) => {
    const anchor =
      click.target instanceof Element ? click.target.closest<HTMLElement>("[data-event-id]") : null;
    const eventId = anchor === null ? null : eventIdOf(anchor);
    if (anchor !== null && eventId !== null) setOpenEvent({ anchor, eventId });
  };
  const closePopover = () => setOpenEvent((current) => current && { ...current, eventId: null });
  const closeDialog = (open: boolean) => {
    if (open) return;
    setDraft(null);
    draftTask = null;
  };
  const onUnscheduled = ({ event, id }: DemoOccurrence) => {
    // The calendar speaks only for gestures; a button's unschedule needs a voice.
    showNotice(`Moved “${event.title}” to Unscheduled.`);
    focusTask(id);
  };

  return {
    /** What the calendar's `Root` takes, as in React; read where `Root` uses each one. */
    calendarProps: {
      get anchorDate() {
        return location().date;
      },
      defaultExpandedResourceIds: demoResourceGroups,
      get annotationSources() {
        return annotationSources();
      },
      get annotations() {
        return annotations();
      },
      get availability() {
        return availability();
      },
      get events() {
        return occurrences();
      },
      get focus() {
        return focus();
      },
      get locale() {
        return settings().locale;
      },
      onAnchorDateChange: (date: Temporal.PlainDate) =>
        setLocation((current) => ({ ...current, date })),
      onEventChange: persistChange,
      onEventChangeResult: history.record,
      onFocusChange: setFocus,
      onSelectionChange: setSelection,
      onViewChange: showView,
      onVisibleRangeChange,
      get policies() {
        return policies();
      },
      get resources() {
        return settings().workingHours === "off" ? demoResources : demoResourcesWithHours;
      },
      get secondaryTimeZones() {
        const zone = settings().secondaryTimeZone;
        return zone === null ? undefined : [zone];
      },
      get selection() {
        return selection();
      },
      get timeZone() {
        return timeZone();
      },
      get view() {
        return view();
      },
      get viewOptions() {
        return viewOptions();
      },
      get weekRules() {
        return weekRules();
      },
    },
    changeSettings,
    closeDialog,
    closePopover,
    draft,
    dragPreview,
    failSaves,
    hiddenCalendars,
    hiddenSources,
    history,
    notice,
    occurrences,
    onUnscheduled,
    openClickedEvent,
    openCreate,
    openEdit,
    openEvent,
    resetDemoData,
    /** Where the event dialog returns focus: the event it edits, or where a create came from. */
    returnFocus: () => openEvent()?.anchor ?? createdFrom(),
    saveFromDialog,
    scheduleTask,
    scrolling,
    setDragPreview,
    setFailSaves,
    setShortcutsOpen,
    setSidebarOpen,
    settings,
    shortcutsOpen,
    showNotice,
    showView,
    shownEvent,
    sidebarOpen,
    systemTimeZone,
    tasks,
    timeZone,
    today,
    toggleCalendar,
    toggleSource,
    /** The calendar's viewport, where events are clicked and followed. */
    viewportRef: (element: HTMLElement) => {
      viewport = element;
    },
  };
}

export type DemoWorkspace = ReturnType<typeof createDemoWorkspace>;

import {
  availabilityPolicy,
  conflictPolicy,
  eventIdOf,
  useNow,
  type CalendarEventUpdateChange,
  type CalendarFocus,
  type CalendarSelection,
  type CalendarWeekRules,
  type EventId,
} from "@moltenship/calendar";
import {
  isRecurringChange,
  occurrenceId,
  recurrenceEditScopes,
  resolveRecurrenceEdit,
  type RecurrenceRule,
} from "@moltenship/calendar-recurrence";
import { PlusIcon } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import { useRecurrenceScopePrompt } from "@registry/recurrence-scope-dialog/use-recurrence-scope-prompt";
import { Button } from "@registry/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@registry/ui/sheet";
import { TooltipProvider } from "@registry/ui/tooltip";

import {
  createDemoAnnotations,
  demoAnnotationSources,
  useHiddenAnnotationSources,
} from "./annotations";
import { demoAvailability, demoResourcesWithHours } from "./availability";
import { DemoCalendar, demoAdapters, type DemoOccurrence } from "./calendar";
import { ActivityList } from "./components/activity-list";
import { BrandMark } from "./components/brand";
import { DocsLink } from "./components/docs-link";
import { EventDialog, type EventDialogSave } from "./components/event-dialog";
import { EventPopover } from "./components/event-popover";
import { KeyboardShortcuts } from "./components/keyboard-shortcuts";
import { Notice, useNotice } from "./components/notice";
import { SettingsPanel } from "./components/settings-panel";
import { ShortcutsDialog } from "./components/shortcuts-dialog";
import { Sidebar } from "./components/sidebar";
import { ThemeToggle } from "./components/theme-toggle";
import { TopBar } from "./components/top-bar";
import { busyNowEvents } from "./busy-now";
import { useDemoEvents } from "./demo-events";
import { demoEventPolicy, type DemoEventChange } from "./event-changes";
import { findEventElement, useFollowEventElement } from "./event-anchor";
import {
  draftForNewEvent,
  draftFromOccurrence,
  draftFromPlacement,
  type EventDraft,
} from "./event-draft";
import { useHiddenCalendars } from "./hidden-calendars";
import { useOccurrences } from "./occurrences";
import { demoResourceGroups, demoResources, type DemoResourceId } from "./resources";
import { useDemoSettings } from "./settings";
import { viewFor } from "./scrolling";
import { applySeriesEdit, type DemoSeriesEdit, type SeriesEditExtras } from "./series-edits";
import { useCalendarLocation } from "./url-state";

/** How long a simulated save takes, so the pending state is visible. */
const saveDelayMs = 600;
/** Double-booking a room or person is allowed, as it can be on purpose, and flagged. */
const flagConflicts = conflictPolicy<DemoOccurrence, string, DemoResourceId>({ mode: "warn" });
const demoPolicies = [demoEventPolicy, flagConflicts];
const warnOutsideHours = [
  demoEventPolicy,
  availabilityPolicy<DemoOccurrence, string, DemoResourceId>({ mode: "warn" }),
  flagConflicts,
];
const blockOutsideHours = [
  demoEventPolicy,
  availabilityPolicy<DemoOccurrence, string, DemoResourceId>({ mode: "block" }),
  flagConflicts,
];
const createId = () => crypto.randomUUID();

/** What a saved change's warnings say. */
function warningNotice(warnings: readonly string[] | undefined): string | null {
  const outside = warnings?.includes("outside-availability") === true;
  const conflict = warnings?.includes("resource-conflict") === true;
  if (outside && conflict) return "Saved outside working hours, double-booking someone.";
  if (outside) return "Saved outside working hours.";
  return conflict ? "Saved, double-booking someone who's busy then." : null;
}

/**
 * Where an editor change sends the edited occurrence's ID. A rule change starts the series over,
 * so the edit's map, which follows the old rule, gives way: a series that stops repeating is one
 * event under its own ID, and one that repeats another way has the occurrence where it went.
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

export function App() {
  const [systemTimeZone] = useState(() => Temporal.Now.timeZoneId());
  const [settings, setSettings] = useDemoSettings();
  const { locale, overlapLayout, scrolling, secondaryTimeZone, timeZone, weekStartsOn } = settings;
  const { workingHours } = settings;
  const today = (useNow() ?? Temporal.Now.instant()).toZonedDateTimeISO(timeZone).toPlainDate();
  const [location, setLocation] = useCalendarLocation(today);
  // The settings choose between paged and scrolling day, week, and month, even for a shared URL.
  const view = viewFor(location.view, scrolling);
  const changeSettings = useCallback(
    (next: typeof settings) => {
      setSettings(next);
      setLocation((current) => ({ ...current, view: viewFor(current.view, next.scrolling) }));
    },
    [setLocation, setSettings],
  );
  const { applyChange, events, resetEvents, saveEvent, setEvents } = useDemoEvents(timeZone);
  const [failSaves, setFailSaves] = useState(false);
  const [notice, showNotice] = useNotice();
  const [hiddenCalendars, toggleCalendar] = useHiddenCalendars();
  const [hiddenSources, toggleSource] = useHiddenAnnotationSources();
  // Seeded per day and zone, up to the moment the demo opens.
  const todayKey = today.toString();
  const annotations = useMemo(
    () =>
      createDemoAnnotations(Temporal.PlainDate.from(todayKey), timeZone, Temporal.Now.instant()),
    [timeZone, todayKey],
  );
  // Hidden working hours leave no shading and nothing for the policies to check.
  const availability = useMemo(
    () =>
      workingHours === "off" ? undefined : demoAvailability(Temporal.PlainDate.from(todayKey)),
    [todayKey, workingHours],
  );
  const policies =
    workingHours === "warn"
      ? warnOutsideHours
      : workingHours === "block"
        ? blockOutsideHours
        : demoPolicies;
  const annotationSources = useMemo(
    () => demoAnnotationSources.filter(({ id }) => !hiddenSources.has(id)),
    [hiddenSources],
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const showShortcuts = useCallback(() => setShortcutsOpen(true), []);
  const [openEvent, setOpenEvent] = useState<OpenEvent | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  // A drag that starts on the open popover's event re-renders it elsewhere; follow it there, and
  // close the popover once the event is no longer shown.
  const followOpenEvent = useCallback(
    (anchor: HTMLElement | null) =>
      setOpenEvent((current) =>
        current === null || anchor === null ? null : { ...current, anchor },
      ),
    [],
  );
  useFollowEventElement(
    viewportRef,
    openEvent?.anchor ?? null,
    openEvent?.eventId ?? null,
    followOpenEvent,
  );
  const [draft, setDraft] = useState<EventDraft | null>(null);
  // Where focus goes back to when a range created in a view closes its dialog: the day or slot
  // a keyboard create ended on. Base UI's default covers the Create button and the "c" key.
  const [createdFrom, setCreatedFrom] = useState<HTMLElement | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // Meetings in progress as the demo opens, so the resource views show people and rooms busy.
  const busyNow = useMemo(() => busyNowEvents(Temporal.Now.instant(), timeZone), [timeZone]);
  const allEvents = useMemo(() => [...events, ...busyNow], [busyNow, events]);
  // Series are expanded for the dates the calendar loads, then hidden calendars filtered out, so
  // toggling a calendar doesn't expand anything again.
  const { occurrences: expanded, onVisibleRangeChange } = useOccurrences(
    allEvents,
    timeZone,
    location.date,
  );
  const occurrences = useMemo(
    () => expanded.filter(({ event }) => !hiddenCalendars.has(event.calendarId)),
    [expanded, hiddenCalendars],
  );
  // Focus and selection live here, so a series edit that renames occurrences moves them in the
  // same render as the new events.
  const [focus, setFocus] = useState<CalendarFocus | null>(null);
  const [selection, setSelection] = useState<CalendarSelection | null>(null);
  const { ask: askScope, dialog: scopeDialog } = useRecurrenceScopePrompt();
  const weekRules = useMemo<CalendarWeekRules>(
    () => ({ firstDay: weekStartsOn, minimalDays: weekStartsOn === 1 ? 4 : 1, weekend: [6, 7] }),
    [weekStartsOn],
  );
  // Busy-now meetings open too, read-only; they are shown but never stored.
  const shownEvent = occurrences.find(({ id }) => id === openEvent?.eventId);
  // Every view that lays out timed events in columns follows the overlap setting.
  const viewOptions = useMemo(() => {
    const layout = { overlapLayout };
    return {
      day: layout,
      resources: layout,
      "scrolling-day": layout,
      "scrolling-week": layout,
      week: layout,
    };
  }, [overlapLayout]);

  // Counts resets, so a save that was still in flight when the data was reset is dropped instead
  // of editing the fresh seed, whose event IDs repeat.
  const resets = useRef(0);
  const resetDemoData = useCallback(() => {
    resets.current += 1;
    resetEvents();
  }, [resetEvents]);

  // After a series edit renames occurrences, the open popover's anchor is replaced by the renamed
  // occurrence's element once it renders. The calendar moves keyboard focus itself.
  const renaming = useRef<ReadonlyMap<EventId, string> | null>(null);
  useLayoutEffect(() => {
    const ids = renaming.current;
    const viewport = viewportRef.current;
    if (ids === null || viewport === null) return;
    renaming.current = null;
    setOpenEvent((current) => {
      if (current === null || current.anchor.isConnected) return current;
      const anchorId = eventIdOf(current.anchor);
      const nextId = anchorId === null ? undefined : ids.get(anchorId);
      const anchor = nextId === undefined ? null : findEventElement(viewport, nextId);
      return anchor === null ? current : { ...current, anchor };
    });
  }, [occurrences]);

  /**
   * Saves a series edit and moves focus, selection and the open popover to renamed occurrences,
   * by `ids`. Called before `onEventChange` returns, so the calendar moves keyboard focus to the
   * occurrence under its new ID.
   */
  const saveSeriesEdit = useCallback(
    (edit: DemoSeriesEdit, ids: ReadonlyMap<EventId, string>, extras?: SeriesEditExtras) => {
      setEvents((current) => applySeriesEdit(current, edit, createId, extras));
      if (ids.size === 0) return;
      renaming.current = ids;
      const rename = (eventId: EventId) => ids.get(eventId) ?? eventId;
      setFocus((current) =>
        current?.kind === "event" ? { ...current, eventId: rename(current.eventId) } : current,
      );
      setSelection((current) =>
        current?.kind === "event" ? { ...current, eventId: rename(current.eventId) } : current,
      );
      setOpenEvent((current) =>
        current?.eventId == null
          ? current
          : { ...current, eventId: ids.get(current.eventId) ?? current.eventId },
      );
    },
    [setEvents],
  );

  /**
   * Asks which occurrences a change to a series applies to, offering only the scopes that can
   * apply, and resolves it: the edit to save, why it can't be saved, or `null` when cancelled.
   */
  const askAndResolve = useCallback(
    async (
      change: DemoEventChange,
      action: "delete" | "edit",
      eventTitle: string,
      wholeSeries = false,
    ): Promise<DemoSeriesEdit | string | null> => {
      // `timeZone` is the calendar's, which occurrences move on: a series dragged by days keeps
      // its time of day when the two zones change DST on different dates.
      const options = { defaultTimeZone: timeZone, timeZone };
      const scopes = recurrenceEditScopes(change, demoAdapters, options).filter(
        (scope) => !wholeSeries || scope !== "this",
      );
      if (scopes.length === 0) return "That change can't apply to this repeating event.";
      const scope = await askScope({ action, eventTitle, scopes });
      if (scope === null) return null;
      const edit = resolveRecurrenceEdit(change, scope, demoAdapters, {
        ...options,
        // Picked up front, so the edit maps the occurrences it renames into the new series.
        newSeriesId: createId(),
        occurrences,
      });
      if (edit.type === "series") return edit;
      return edit.type === "rejected" ? edit.message : "That change can't apply to this event.";
    },
    [askScope, occurrences, timeZone],
  );

  // Moves, resizes and deletes arrive here after the calendar has shown them optimistically.
  // Rejecting rolls the calendar back to the stored events. A range dragged out in a view opens
  // the event dialog, which names and saves the new event. A change to an occurrence of a series
  // first asks which occurrences it applies to, while the calendar keeps showing it pending.
  const persistChange = useCallback(
    async (change: DemoEventChange) => {
      if (change.cause === "create") {
        setOpenEvent(null);
        const focused = document.activeElement;
        setCreatedFrom(
          focused instanceof HTMLElement && viewportRef.current?.contains(focused) === true
            ? focused
            : null,
        );
        setDraft(draftFromPlacement(change.proposed, timeZone, "work"));
        return;
      }
      const resetsAtStart = resets.current;
      let edit: DemoSeriesEdit | undefined;
      if (isRecurringChange(change)) {
        const action = change.cause === "delete" ? "delete" : "edit";
        const resolved = await askAndResolve(change, action, change.event.event.title);
        // Rejecting rolls the change back; an `AbortError` is announced as a cancel.
        if (resolved === null) throw new DOMException("Cancelled", "AbortError");
        if (typeof resolved === "string") {
          showNotice(`${resolved} The change was undone.`);
          throw new Error("no-scope");
        }
        edit = resolved;
      }
      await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
      if (resets.current !== resetsAtStart) throw new Error("superseded-by-reset");
      if (failSaves) {
        showNotice("Couldn't save the change, so it was undone.");
        throw new Error("simulated-save-failure");
      }
      if (edit === undefined) applyChange(change);
      else saveSeriesEdit(edit, edit.occurrenceIds);
      const notice = warningNotice(change.warnings);
      if (notice !== null) showNotice(notice);
    },
    [applyChange, askAndResolve, failSaves, saveSeriesEdit, showNotice, timeZone],
  );

  // The editor saves an event as it is, or a change to an occurrence of a series, which asks for
  // its scope first. Resolves with an error for the editor to show; cancelling keeps it open.
  const saveFromDialog = useCallback(
    async (save: EventDialogSave): Promise<string | undefined> => {
      if (save.type === "event") {
        saveEvent(save.event);
      } else {
        const { change, end, fields, rule } = save;
        // A new rule or end is the series', so it can't apply to this occurrence alone.
        const series = rule !== undefined || end !== undefined;
        const edit = await askAndResolve(change, "edit", fields.title, series);
        if (edit === null) return undefined;
        if (typeof edit === "string") return edit;
        const extras = { end, fields, placement: change.proposed, rule, timeZone };
        saveSeriesEdit(edit, renamedIds(edit, change, rule), extras);
      }
      setDraft(null);
      const notice = warningNotice(save.warnings);
      if (notice !== null) showNotice(notice);
      return undefined;
    },
    [askAndResolve, saveEvent, saveSeriesEdit, showNotice, timeZone],
  );

  const openCreate = useCallback(() => {
    setSidebarOpen(false);
    setOpenEvent(null);
    setCreatedFrom(null);
    setDraft(draftForNewEvent(location.date, Temporal.Now.zonedDateTimeISO(timeZone), "work"));
  }, [location.date, timeZone]);
  // Editing keeps the popover's anchor so the dialog can return focus to the event.
  const openEdit = (occurrence: DemoOccurrence) => {
    setOpenEvent((current) => current && { ...current, eventId: null });
    setDraft(draftFromOccurrence(occurrence, timeZone));
  };
  // Views render each event as a `[data-event-id]` button, so one delegated listener opens any of
  // them, whichever view is active.
  const openClickedEvent = (click: MouseEvent) => {
    const anchor =
      click.target instanceof Element ? click.target.closest<HTMLElement>("[data-event-id]") : null;
    const eventId = anchor === null ? null : eventIdOf(anchor);
    if (anchor !== null && eventId !== null) setOpenEvent({ anchor, eventId });
  };
  const sidebar = (onNavigate?: () => void) => (
    <Sidebar
      hiddenCalendars={hiddenCalendars}
      onCreate={openCreate}
      onNavigate={onNavigate}
      onToggleCalendar={toggleCalendar}
      today={today}
    >
      <ActivityList hidden={hiddenSources} onToggle={toggleSource} />
      <SettingsPanel
        failSaves={failSaves}
        onChange={changeSettings}
        onFailSavesChange={setFailSaves}
        onReset={resetDemoData}
        settings={settings}
        systemTimeZone={systemTimeZone}
      />
    </Sidebar>
  );

  return (
    <TooltipProvider delay={400}>
      <DemoCalendar.Root
        anchorDate={location.date}
        defaultExpandedResourceIds={demoResourceGroups}
        annotationSources={annotationSources}
        annotations={annotations}
        availability={availability}
        events={occurrences}
        focus={focus}
        locale={locale}
        onAnchorDateChange={(date) => setLocation((current) => ({ ...current, date }))}
        onEventChange={persistChange}
        onFocusChange={setFocus}
        onSelectionChange={setSelection}
        onViewChange={(view) => setLocation((current) => ({ ...current, view }))}
        onVisibleRangeChange={onVisibleRangeChange}
        policies={policies}
        resources={workingHours === "off" ? demoResources : demoResourcesWithHours}
        secondaryTimeZones={secondaryTimeZone === null ? undefined : [secondaryTimeZone]}
        selection={selection}
        timeZone={timeZone}
        view={view}
        viewOptions={viewOptions}
        weekRules={weekRules}
      >
        <KeyboardShortcuts onCreate={openCreate} onHelp={showShortcuts} scrolling={scrolling} />
        <DemoCalendar.Frame className="flex h-dvh flex-col">
          <TopBar
            onOpenSidebar={() => setSidebarOpen(true)}
            onShowShortcuts={showShortcuts}
            scrolling={scrolling}
          />
          <div className="flex min-h-0 flex-1">
            <aside className="hidden w-64 shrink-0 overflow-y-auto lg:block">{sidebar()}</aside>
            <main className="min-w-0 flex-1 border-t lg:mr-3 lg:mb-3 lg:overflow-clip lg:rounded-xl lg:border lg:bg-card lg:[--calendar-surface:var(--card)]">
              <DemoCalendar.Viewport
                ref={viewportRef}
                className="h-full"
                onClick={openClickedEvent}
              >
                <DemoCalendar.ActiveView />
              </DemoCalendar.Viewport>
            </main>
          </div>
          <Button
            aria-label="Create event"
            className="fixed right-4 bottom-4 size-14 rounded-2xl shadow-lg lg:hidden"
            onClick={openCreate}
          >
            <PlusIcon className="size-6" />
          </Button>
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent
              ref={sheetRef}
              className="gap-2 outline-none data-[side=left]:w-72"
              // Focus the sheet itself so the first control's tooltip does not pop open.
              initialFocus={sheetRef}
              side="left"
            >
              <div className="flex h-14 shrink-0 items-center gap-2 pr-12 pl-4">
                <BrandMark />
                <SheetTitle className="text-lg font-medium">Calendar</SheetTitle>
                <DocsLink className="ml-auto" />
                <ThemeToggle className="rounded-full" />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {sidebar(() => setSidebarOpen(false))}
              </div>
            </SheetContent>
          </Sheet>
          <EventPopover
            anchor={openEvent?.anchor ?? null}
            locale={locale}
            occurrence={shownEvent}
            onClose={() => setOpenEvent((current) => current && { ...current, eventId: null })}
            onEdit={openEdit}
            timeZone={timeZone}
          />
          <EventDialog
            draft={draft}
            locale={locale}
            onOpenChange={(open) => !open && setDraft(null)}
            onSave={saveFromDialog}
            returnFocus={openEvent?.anchor ?? createdFrom}
            timeZone={timeZone}
          />
          {/* Asks "this, this and following, or all" for changes to a repeating event. */}
          {scopeDialog}
          <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
          {/* Speaks keyboard and pointer moves, resizes and creates. */}
          <DemoCalendar.Announcer messages={calendarAnnouncements} />
          <Notice text={notice} />
        </DemoCalendar.Frame>
      </DemoCalendar.Root>
    </TooltipProvider>
  );
}

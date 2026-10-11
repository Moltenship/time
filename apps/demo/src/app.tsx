import { eventIdOf, useNow, type CalendarWeekRules, type EventId } from "@moltenship/calendar";
import { PlusIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import { Button } from "@registry/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@registry/ui/sheet";
import { TooltipProvider } from "@registry/ui/tooltip";

import {
  createDemoAnnotations,
  demoAnnotationSources,
  useHiddenAnnotationSources,
} from "./annotations";
import { DemoCalendar, type DemoEvent } from "./calendar";
import { ActivityList } from "./components/activity-list";
import { BrandMark } from "./components/brand";
import { DocsLink } from "./components/docs-link";
import { EventDialog } from "./components/event-dialog";
import { EventPopover } from "./components/event-popover";
import { KeyboardShortcuts } from "./components/keyboard-shortcuts";
import { Notice, useNotice } from "./components/notice";
import { SettingsPanel } from "./components/settings-panel";
import { ShortcutsDialog } from "./components/shortcuts-dialog";
import { Sidebar } from "./components/sidebar";
import { ThemeToggle } from "./components/theme-toggle";
import { TopBar } from "./components/top-bar";
import { useDemoEvents } from "./demo-events";
import { demoEventPolicy, type DemoEventChange } from "./event-changes";
import { useFollowEventElement } from "./event-anchor";
import {
  draftForNewEvent,
  draftFromEvent,
  draftFromPlacement,
  type EventDraft,
} from "./event-draft";
import { useHiddenCalendars } from "./hidden-calendars";
import { demoResourceGroups, demoResources } from "./resources";
import { useDemoSettings } from "./settings";
import { viewFor } from "./scrolling";
import { useCalendarLocation } from "./url-state";

/** How long a simulated save takes, so the pending state is visible. */
const saveDelayMs = 600;
const demoPolicies = [demoEventPolicy];

interface OpenEvent {
  readonly anchor: HTMLElement;
  /** Cleared on close while the anchor stays, so focus can return to it. */
  readonly eventId: EventId | null;
}

export function App() {
  const [systemTimeZone] = useState(() => Temporal.Now.timeZoneId());
  const [settings, setSettings] = useDemoSettings();
  const { locale, overlapLayout, scrolling, timeZone, weekStartsOn } = settings;
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
  const { applyChange, events, resetEvents, saveEvent } = useDemoEvents(timeZone);
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
  const visibleEvents = useMemo(
    () => events.filter((event) => !hiddenCalendars.has(event.calendarId)),
    [events, hiddenCalendars],
  );
  const weekRules = useMemo<CalendarWeekRules>(
    () => ({ firstDay: weekStartsOn, minimalDays: weekStartsOn === 1 ? 4 : 1, weekend: [6, 7] }),
    [weekStartsOn],
  );
  const shownEvent = events.find(({ id }) => id === openEvent?.eventId);
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

  // Moves, resizes and deletes arrive here after the calendar has shown them optimistically.
  // Rejecting rolls the calendar back to the stored events. A range dragged out in a view opens
  // the event dialog, which names and saves the new event.
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
      await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
      if (resets.current !== resetsAtStart) throw new Error("superseded-by-reset");
      if (failSaves) {
        showNotice("Couldn't save the change, so it was undone.");
        throw new Error("simulated-save-failure");
      }
      applyChange(change);
    },
    [applyChange, failSaves, showNotice, timeZone],
  );

  const openCreate = useCallback(() => {
    setSidebarOpen(false);
    setOpenEvent(null);
    setCreatedFrom(null);
    setDraft(draftForNewEvent(location.date, Temporal.Now.zonedDateTimeISO(timeZone), "work"));
  }, [location.date, timeZone]);
  // Editing keeps the popover's anchor so the dialog can return focus to the event.
  const openEdit = (event: DemoEvent) => {
    setOpenEvent((current) => current && { ...current, eventId: null });
    setDraft(draftFromEvent(event, timeZone));
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
        events={visibleEvents}
        locale={locale}
        onAnchorDateChange={(date) => setLocation((current) => ({ ...current, date }))}
        onEventChange={persistChange}
        onViewChange={(view) => setLocation((current) => ({ ...current, view }))}
        policies={demoPolicies}
        resources={demoResources}
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
            <main className="min-w-0 flex-1 border-t lg:mr-3 lg:mb-3 lg:rounded-xl lg:border lg:bg-card">
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
            event={shownEvent}
            locale={locale}
            onClose={() => setOpenEvent((current) => current && { ...current, eventId: null })}
            onEdit={openEdit}
            timeZone={timeZone}
          />
          <EventDialog
            draft={draft}
            onOpenChange={(open) => !open && setDraft(null)}
            onSave={(event) => {
              saveEvent(event);
              setDraft(null);
            }}
            returnFocus={openEvent?.anchor ?? createdFrom}
            timeZone={timeZone}
          />
          <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
          {/* Speaks keyboard and pointer moves, resizes and creates. */}
          <DemoCalendar.Announcer messages={calendarAnnouncements} />
          <Notice text={notice} />
        </DemoCalendar.Frame>
      </DemoCalendar.Root>
    </TooltipProvider>
  );
}

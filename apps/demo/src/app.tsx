import { useNow, type CalendarWeekRules } from "@moltenship/calendar";
import { PlusIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type MouseEvent } from "react";

import { Button } from "@registry/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@registry/ui/sheet";

import { DemoCalendar, type DemoEvent } from "./calendar";
import { BrandMark } from "./components/brand";
import { EventDialog } from "./components/event-dialog";
import { EventPopover } from "./components/event-popover";
import { KeyboardShortcuts } from "./components/keyboard-shortcuts";
import { SettingsPanel } from "./components/settings-panel";
import { Sidebar } from "./components/sidebar";
import { ThemeToggle } from "./components/theme-toggle";
import { TopBar } from "./components/top-bar";
import { useDemoEvents } from "./demo-events";
import { draftForNewEvent, draftFromEvent, type EventDraft } from "./event-draft";
import { useHiddenCalendars } from "./hidden-calendars";
import { useDemoSettings } from "./settings";
import { useCalendarLocation } from "./url-state";

interface OpenEvent {
  readonly anchor: HTMLElement;
  /** Cleared on close while the anchor stays, so focus can return to it. */
  readonly eventId: string | null;
}

export function App() {
  const [systemTimeZone] = useState(() => Temporal.Now.timeZoneId());
  const [settings, setSettings] = useDemoSettings();
  const { locale, timeZone, weekStartsOn } = settings;
  const today = (useNow() ?? Temporal.Now.instant()).toZonedDateTimeISO(timeZone).toPlainDate();
  const [location, setLocation] = useCalendarLocation(today);
  const { deleteEvent, events, resetEvents, saveEvent } = useDemoEvents(timeZone);
  const [hiddenCalendars, toggleCalendar] = useHiddenCalendars();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [openEvent, setOpenEvent] = useState<OpenEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
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

  const openCreate = useCallback(() => {
    setSidebarOpen(false);
    setDraft(draftForNewEvent(location.date, Temporal.Now.zonedDateTimeISO(timeZone), "work"));
  }, [location.date, timeZone]);
  const openEdit = (event: DemoEvent) => {
    setOpenEvent(null);
    setDraft(draftFromEvent(event, timeZone));
  };
  // Views render each event as a `[data-event-id]` button, so one delegated listener opens any of
  // them, whichever view is active.
  const openClickedEvent = (click: MouseEvent) => {
    const anchor =
      click.target instanceof Element ? click.target.closest<HTMLElement>("[data-event-id]") : null;
    const eventId = anchor?.dataset.eventId;
    if (anchor !== null && eventId !== undefined) setOpenEvent({ anchor, eventId });
  };
  const sidebar = (onNavigate?: () => void) => (
    <Sidebar
      hiddenCalendars={hiddenCalendars}
      onCreate={openCreate}
      onNavigate={onNavigate}
      onToggleCalendar={toggleCalendar}
      today={today}
    >
      <SettingsPanel
        onChange={setSettings}
        onReset={resetEvents}
        settings={settings}
        systemTimeZone={systemTimeZone}
      />
    </Sidebar>
  );

  return (
    <DemoCalendar.Root
      anchorDate={location.date}
      events={visibleEvents}
      locale={locale}
      onAnchorDateChange={(date) => setLocation((current) => ({ ...current, date }))}
      onViewChange={(view) => setLocation((current) => ({ ...current, view }))}
      timeZone={timeZone}
      view={location.view}
      weekRules={weekRules}
    >
      <KeyboardShortcuts onCreate={openCreate} />
      <DemoCalendar.Frame className="flex h-dvh flex-col">
        <TopBar onOpenSidebar={() => setSidebarOpen(true)} />
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-64 shrink-0 overflow-y-auto lg:block">{sidebar()}</aside>
          <main className="min-w-0 flex-1 border-t lg:mr-3 lg:mb-3 lg:rounded-xl lg:border lg:bg-card">
            <DemoCalendar.Viewport className="h-full" onClick={openClickedEvent}>
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
            aria-describedby={undefined}
            className="w-72 gap-2 outline-none"
            // Focus the sheet itself so the first control's tooltip does not pop open.
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              sheetRef.current?.focus();
            }}
            side="left"
          >
            <div className="flex h-14 shrink-0 items-center gap-2 pr-12 pl-4">
              <BrandMark />
              <SheetTitle className="text-lg font-medium">Calendar</SheetTitle>
              <ThemeToggle className="ml-auto rounded-full" />
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
          onDelete={(event) => {
            setOpenEvent(null);
            deleteEvent(event.id);
          }}
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
          timeZone={timeZone}
        />
      </DemoCalendar.Frame>
    </DemoCalendar.Root>
  );
}

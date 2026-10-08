import { createSystemClock } from "@moltenship/calendar-temporal";
import { useMemo, useRef, useState } from "react";

import { Sheet, SheetContent, SheetTitle } from "@registry/ui/sheet";

import { DemoCalendar } from "./calendar";
import { BrandMark } from "./components/brand";
import { Sidebar } from "./components/sidebar";
import { ThemeToggle } from "./components/theme-toggle";
import { TopBar } from "./components/top-bar";
import { eventsStorageKey, parseEvents, serializeEvents } from "./event-storage";
import { useHiddenCalendars } from "./hidden-calendars";
import { createSeedEvents } from "./seed";
import { usePersistentState } from "./storage";

const clock = createSystemClock();
const locale = "en-US";
const weekRules = { firstDay: 7, minimalDays: 1, weekend: [6, 7] } as const;

export function App() {
  const [timeZone] = useState(() => Temporal.Now.timeZoneId());
  const today = Temporal.Now.plainDateISO(timeZone);
  const [events] = usePersistentState(
    eventsStorageKey,
    (stored) => parseEvents(stored) ?? createSeedEvents(today, timeZone),
    serializeEvents,
  );
  const [hiddenCalendars, toggleCalendar] = useHiddenCalendars();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const visibleEvents = useMemo(
    () => events.filter((event) => !hiddenCalendars.has(event.calendarId)),
    [events, hiddenCalendars],
  );
  const sidebar = (onNavigate?: () => void) => (
    <Sidebar
      hiddenCalendars={hiddenCalendars}
      onNavigate={onNavigate}
      onToggleCalendar={toggleCalendar}
      today={today}
    />
  );

  return (
    <DemoCalendar.Root
      clock={clock}
      defaultAnchorDate={today}
      defaultTimeZone={timeZone}
      defaultView="week"
      events={visibleEvents}
      locale={locale}
      weekRules={weekRules}
    >
      <DemoCalendar.Frame className="flex h-dvh flex-col">
        <TopBar onOpenSidebar={() => setSidebarOpen(true)} />
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-64 shrink-0 overflow-y-auto lg:block">{sidebar()}</aside>
          <main className="min-w-0 flex-1 border-t lg:mr-3 lg:mb-3 lg:rounded-xl lg:border lg:bg-card">
            <DemoCalendar.Viewport className="h-full">
              <DemoCalendar.ActiveView />
            </DemoCalendar.Viewport>
          </main>
        </div>
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
      </DemoCalendar.Frame>
    </DemoCalendar.Root>
  );
}

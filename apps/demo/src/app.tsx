import { DragDropProvider } from "@dnd-kit/react";
import { CalendarDndKit } from "@moltenship/calendar-dnd-kit";
import { PlusIcon } from "lucide-react";
import { useRef } from "react";

import { calendarAnnouncements } from "@registry/calendar/announcements";
import { CalendarHistoryToast } from "@registry/calendar-history-toast/calendar-history-toast";
import { useRecurrenceScopePrompt } from "@registry/recurrence-scope-dialog/use-recurrence-scope-prompt";
import { Button } from "@registry/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@registry/ui/sheet";
import { TooltipProvider } from "@registry/ui/tooltip";

import { DemoCalendar } from "./calendar";
import { ActivityList } from "./components/activity-list";
import { BrandMark } from "./components/brand";
import { DocsLink } from "./components/docs-link";
import { EventDialog } from "./components/event-dialog";
import { EventPopover } from "./components/event-popover";
import { KeyboardShortcuts } from "./components/keyboard-shortcuts";
import { Notice } from "./components/notice";
import { SettingsPanel } from "./components/settings-panel";
import { ShortcutsDialog } from "./components/shortcuts-dialog";
import { Sidebar } from "./components/sidebar";
import { ThemeToggle } from "./components/theme-toggle";
import { TopBar } from "./components/top-bar";
import { UiSwitch } from "./components/ui-switch";
import { UnscheduledTasks } from "./components/unscheduled-tasks";
import { withDragAnnouncements } from "./drag-announcements";
import { useDemoWorkspace } from "./use-demo-workspace";

export function App() {
  const { ask, dialog: scopeDialog } = useRecurrenceScopePrompt();
  const workspace = useDemoWorkspace(ask);
  const { draft, failSaves, hiddenCalendars, hiddenSources, history, locale, notice } = workspace;
  const { openCreate, openEvent, scheduleTask, scrolling, settings, shownEvent } = workspace;
  const { showShortcuts, sidebarOpen, tasks, timeZone, today } = workspace;
  const sheetRef = useRef<HTMLDivElement>(null);
  const sidebar = (onNavigate?: () => void) => (
    <Sidebar
      hiddenCalendars={hiddenCalendars}
      onCreate={openCreate}
      onNavigate={onNavigate}
      onToggleCalendar={workspace.toggleCalendar}
      today={today}
    >
      <UnscheduledTasks onSchedule={scheduleTask} taskList={tasks} />
      <ActivityList hidden={hiddenSources} onToggle={workspace.toggleSource} />
      <SettingsPanel
        failSaves={failSaves}
        onChange={workspace.changeSettings}
        onFailSavesChange={workspace.setFailSaves}
        onReset={workspace.resetDemoData}
        settings={settings}
        systemTimeZone={workspace.systemTimeZone}
      />
    </Sidebar>
  );

  return (
    <TooltipProvider delay={400}>
      <DemoCalendar.Root {...workspace.calendarProps}>
        <KeyboardShortcuts onCreate={openCreate} onHelp={showShortcuts} scrolling={scrolling} />
        {/* Tasks drag into the calendar, and one-off events out to the tasks, through dnd-kit. */}
        <DragDropProvider plugins={withDragAnnouncements}>
          <CalendarDndKit />
          <DemoCalendar.Frame className="flex h-dvh flex-col">
            <TopBar
              onOpenSidebar={() => workspace.setSidebarOpen(true)}
              onShowShortcuts={showShortcuts}
              scrolling={scrolling}
            />
            <div className="flex min-h-0 flex-1">
              <aside className="hidden w-64 shrink-0 overflow-y-auto lg:block">{sidebar()}</aside>
              <main className="min-w-0 flex-1 border-t lg:mr-3 lg:mb-3 lg:overflow-clip lg:rounded-xl lg:border lg:bg-card lg:[--calendar-surface:var(--card)]">
                <DemoCalendar.Viewport
                  ref={workspace.viewportRef}
                  className="h-full"
                  onClick={workspace.openClickedEvent}
                >
                  <DemoCalendar.ActiveView />
                </DemoCalendar.Viewport>
              </main>
            </div>
            <Button
              aria-label="Create event"
              // Above the views' events, which stack in their own layers.
              className="fixed right-4 bottom-4 z-30 size-14 rounded-2xl shadow-lg lg:hidden"
              onClick={openCreate}
            >
              <PlusIcon className="size-6" />
            </Button>
            <Sheet open={sidebarOpen} onOpenChange={workspace.setSidebarOpen}>
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
                <UiSwitch className="mx-4 w-fit" current="tailwind" />
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {sidebar(() => workspace.setSidebarOpen(false))}
                </div>
              </SheetContent>
            </Sheet>
            <EventPopover
              anchor={openEvent?.anchor ?? null}
              locale={locale}
              occurrence={shownEvent}
              onClose={workspace.closePopover}
              onEdit={workspace.openEdit}
              onUnscheduled={workspace.onUnscheduled}
              taskList={tasks}
              timeZone={timeZone}
            />
            <EventDialog
              draft={draft}
              locale={locale}
              onOpenChange={workspace.closeDialog}
              onSave={workspace.saveFromDialog}
              returnFocus={workspace.returnFocus}
              timeZone={timeZone}
            />
            {/* Asks "this, this and following, or all" for changes to a repeating event. */}
            {scopeDialog}
            <ShortcutsDialog
              open={workspace.shortcutsOpen}
              onOpenChange={workspace.setShortcutsOpen}
            />
            {/* Speaks keyboard and pointer moves, resizes and creates. */}
            <DemoCalendar.Announcer messages={calendarAnnouncements} />
            <Notice text={notice} />
            <CalendarHistoryToast
              calendar={DemoCalendar}
              className="bottom-24 lg:bottom-6"
              history={history}
            />
          </DemoCalendar.Frame>
        </DragDropProvider>
      </DemoCalendar.Root>
    </TooltipProvider>
  );
}

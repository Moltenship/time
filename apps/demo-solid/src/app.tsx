import { createSignal } from "solid-js";

import { calendarAnnouncements } from "@registry/shared/calendar/announcements";
import { CalendarHistoryToast } from "@registry/calendar-history-toast/calendar-history-toast";
import { Button } from "@registry/calendar-ui/button";
import { useRecurrenceScopePrompt } from "@registry/recurrence-scope-dialog/use-recurrence-scope-prompt";

import { AgentPanel } from "./agent-panel";
import { ActivityList } from "./components/activity-list";
import { Calendar } from "./calendar";
import { BrandMark } from "./components/brand";
import { DocsLink } from "./components/docs-link";
import { EventDialog } from "./components/event-dialog";
import { EventPopover } from "./components/event-popover";
import { KeyboardShortcuts } from "./components/keyboard-shortcuts";
import { Notice } from "./components/notice";
import { FrameworkSwitch } from "./components/page-switch";
import { SettingsPanel } from "./components/settings-panel";
import { ShortcutsDialog } from "./components/shortcuts-dialog";
import { Sidebar } from "./components/sidebar";
import { ThemeToggle } from "./components/theme-toggle";
import { TopBar } from "./components/top-bar";
import { UnscheduledTasks } from "./components/unscheduled-tasks";
import { PlusIcon } from "./icons";
import { Sheet, SheetTitle } from "./ui/sheet";
import { createDemoWorkspace } from "./workspace";

export function App() {
  const { ask, dialog: scopeDialog } = useRecurrenceScopePrompt();
  const workspace = createDemoWorkspace(ask);
  const [allowAgentDelete, setAllowAgentDelete] = createSignal(false);
  // WebKit doesn't focus a button it clicks, so a dialog a button opens gives focus back to it,
  // not to the page, as the Tailwind page's Base UI buttons, which focus themselves, have it.
  let sidebarOpener: HTMLElement | undefined;
  let shortcutsOpener: HTMLElement | undefined;
  const connected = (element: HTMLElement | undefined) =>
    element?.isConnected === true ? element : undefined;
  const showShortcuts = (from?: HTMLElement) => {
    shortcutsOpener = from;
    workspace.setShortcutsOpen(true);
  };
  const sidebar = (onNavigate?: () => void) => (
    <Sidebar
      hiddenCalendars={workspace.hiddenCalendars()}
      onCreate={workspace.openCreate}
      onNavigate={onNavigate}
      onToggleCalendar={workspace.toggleCalendar}
      today={workspace.today()}
    >
      <UnscheduledTasks onSchedule={workspace.scheduleTask} taskList={workspace.tasks} />
      <ActivityList hidden={workspace.hiddenSources()} onToggle={workspace.toggleSource} />
      <SettingsPanel
        dragPreview={workspace.dragPreview()}
        failSaves={workspace.failSaves()}
        onChange={workspace.changeSettings}
        onDragPreviewChange={workspace.setDragPreview}
        onFailSavesChange={workspace.setFailSaves}
        onReset={workspace.resetDemoData}
        settings={workspace.settings()}
        systemTimeZone={workspace.systemTimeZone}
      />
      <AgentPanel
        allowDelete={allowAgentDelete()}
        events={workspace.occurrences()}
        onAllowDeleteChange={setAllowAgentDelete}
        timeZone={workspace.timeZone()}
      />
    </Sidebar>
  );

  return (
    <Calendar.Root {...workspace.calendarProps} allowAgentDelete={allowAgentDelete()}>
      <KeyboardShortcuts
        onCreate={workspace.openCreate}
        onHelp={() => showShortcuts()}
        scrolling={workspace.scrolling()}
      />
      <Calendar.Frame class="flex h-dvh flex-col">
        <TopBar
          onOpenSidebar={(from) => {
            sidebarOpener = from;
            workspace.setSidebarOpen(true);
          }}
          onShowShortcuts={showShortcuts}
          scrolling={workspace.scrolling()}
        />
        <div class="flex min-h-0 flex-1">
          <aside class="hidden w-64 shrink-0 overflow-y-auto lg:block">{sidebar()}</aside>
          <main class="min-w-0 flex-1 border-t lg:mr-3 lg:mb-3 lg:overflow-clip lg:rounded-xl lg:border lg:bg-card lg:[--calendar-surface:var(--card)]">
            <Calendar.Viewport
              ref={workspace.viewportRef}
              class="h-full"
              onClick={workspace.openClickedEvent}
            >
              <Calendar.ActiveView />
            </Calendar.Viewport>
          </main>
        </div>
        <Button
          aria-label="Create event"
          // Above the views' events, which stack in their own layers.
          class="fixed right-4 bottom-4 z-30 size-14 rounded-2xl shadow-lg lg:hidden"
          onClick={workspace.openCreate}
        >
          <PlusIcon class="size-6" />
        </Button>
        <Sheet
          class="w-80 gap-2 outline-none"
          finalFocus={() => connected(sidebarOpener)}
          onOpenChange={workspace.setSidebarOpen}
          open={workspace.sidebarOpen()}
        >
          <div class="flex h-14 shrink-0 items-center gap-2 pr-12 pl-4">
            <BrandMark />
            <SheetTitle class="text-lg font-medium">Calendar</SheetTitle>
            <DocsLink class="ml-auto" />
            <ThemeToggle class="rounded-full" />
          </div>
          <div class="mx-4 flex flex-wrap gap-2">
            <FrameworkSwitch />
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto">
            {sidebar(() => workspace.setSidebarOpen(false))}
          </div>
        </Sheet>
        <EventPopover
          anchor={workspace.openEvent()?.anchor ?? null}
          locale={workspace.settings().locale}
          occurrence={workspace.shownEvent()}
          onClose={workspace.closePopover}
          onEdit={workspace.openEdit}
          onUnscheduled={workspace.onUnscheduled}
          taskList={workspace.tasks}
          timeZone={workspace.timeZone()}
        />
        <EventDialog
          draft={workspace.draft()}
          locale={workspace.settings().locale}
          onOpenChange={workspace.closeDialog}
          onSave={workspace.saveFromDialog}
          returnFocus={workspace.returnFocus()}
          timeZone={workspace.timeZone()}
        />
        {/* Asks "this, this and following, or all" for changes to a repeating event. */}
        {scopeDialog}
        <ShortcutsDialog
          finalFocus={() => connected(shortcutsOpener)}
          onOpenChange={workspace.setShortcutsOpen}
          open={workspace.shortcutsOpen()}
        />
        {/* Speaks keyboard and pointer moves, resizes and creates. */}
        <Calendar.Announcer messages={calendarAnnouncements} />
        <Notice text={workspace.notice()} />
        <CalendarHistoryToast
          calendar={Calendar}
          class="bottom-24 lg:bottom-6"
          history={workspace.history}
        />
      </Calendar.Frame>
    </Calendar.Root>
  );
}

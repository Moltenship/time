import {
  createCalendar,
  createCanonicalEventAdapter,
  plainDateInterval,
  type CalendarResource,
} from "@moltenship/calendar";
import { useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";

import {
  annotationSources,
  annotations,
  availability,
  events,
  resources,
  today,
  type Fixture,
} from "../registry-fixtures";
import type * as TailwindFlavour from "./flavour-tailwind";

/** One flavour's views and controls; the StyleX ones take the same props the screens pass. */
export type Flavour = typeof TailwindFlavour;

export const parityViews = ["month", "year", "week", "day", "agenda", "resources"] as const;
export type ParityView = (typeof parityViews)[number];

/** What a parity page shows, from its URL: `?page=controls` or `?view=week`, and `&theme=dark`. */
export interface ParityPage {
  readonly dir: "ltr" | "rtl";
  readonly page: "controls" | "views";
  readonly theme: "dark" | "light";
  readonly view: ParityView;
}

declare global {
  interface Window {
    /** Set once the page has rendered and its fonts have loaded. */
    parityReady?: boolean;
  }
}

const getEventColor = (event: Fixture) => event.data.color;

function Views({ flavour: f, view, dir }: { readonly flavour: Flavour } & ParityPage) {
  const [Calendar] = useState(() =>
    createCalendar<Fixture, CalendarResource<null>>()({
      eventAdapter: createCanonicalEventAdapter<{ readonly color: CalendarEventColor }, string>(),
      views: [
        f.createWeekView<Fixture>({ dayView: "day", getEventColor }),
        f.createDayView<Fixture>({ getEventColor }),
        f.createMonthView<Fixture>({ getEventColor }),
        f.createYearView<Fixture>({ getEventColor }),
        f.createAgendaView<Fixture>({ getEventColor }),
        f.createResourceColumnsView<Fixture>({ getEventColor }),
      ],
    }),
  );
  return (
    <Calendar.Root
      annotationSources={annotationSources}
      annotations={annotations}
      availability={availability}
      defaultAnchorDate={today}
      defaultExpandedResourceIds={["team"]}
      defaultTimeZone="UTC"
      defaultView={view}
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T10:20:00Z")}
      resources={resources}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame dir={dir} style={{ display: "flex", height: "100dvh" }}>
        <aside style={aside}>
          <f.MiniMonth
            locale="en-US"
            onSelectDate={() => {}}
            selectedDate={today.add({ days: 1 })}
            today={today}
            visibleRange={plainDateInterval(today.subtract({ days: 3 }), today.add({ days: 4 }))}
            weekStartsOn={1}
          />
        </aside>
        <main style={{ display: "flex", flex: 1, flexDirection: "column", minWidth: 0 }}>
          <div style={{ borderBottom: "1px solid var(--border)" }}>
            <f.CalendarToolbar calendar={Calendar}>
              <f.ViewSwitcher
                onValueChange={() => {}}
                options={parityViews.map((value) => ({ label: value, shortcut: "M", value }))}
                value={view}
              />
            </f.CalendarToolbar>
          </div>
          <Calendar.Viewport style={{ flex: 1, minHeight: 0 }}>
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </main>
      </Calendar.Frame>
    </Calendar.Root>
  );
}

const aside: CSSProperties = {
  borderInlineEnd: "1px solid var(--border)",
  boxSizing: "border-box",
  flexShrink: 0,
  padding: 12,
  width: 256,
};
const row: CSSProperties = { alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8 };

const buttonVariants = ["default", "outline", "secondary", "ghost", "destructive", "link"] as const;
const buttonSizes = ["default", "xs", "sm", "lg", "icon", "icon-xs", "icon-sm", "icon-lg"] as const;
const badgeVariants = ["default", "secondary", "destructive", "outline"] as const;

function Icon() {
  return (
    <svg aria-hidden fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/** Every control of the kit, each variant and size, with a toast up and the dialog to open. */
function Controls({ flavour: f }: { readonly flavour: Flavour }) {
  const [dialog, setDialog] = useState(false);
  const [manager] = useState(() => {
    const created = f.createToastManager();
    created.add({
      actionProps: { children: "Undo", onClick: () => {} },
      description: "To Thursday, 9:15 AM",
      id: "moved",
      timeout: 0,
      title: "Moved Standup",
    });
    return created;
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
      {buttonVariants.map((variant) => (
        <div data-parity={`buttons-${variant}`} key={variant} style={row}>
          {buttonSizes.map((size) => (
            <f.Button aria-label={`${variant} ${size}`} key={size} size={size} variant={variant}>
              {size.startsWith("icon") ? <Icon /> : "Button"}
            </f.Button>
          ))}
          <f.Button disabled variant={variant}>
            Disabled
          </f.Button>
        </div>
      ))}
      <div style={row}>
        {badgeVariants.map((variant) => (
          <f.Badge key={variant} variant={variant}>
            Badge
          </f.Badge>
        ))}
      </div>
      <div style={row}>
        <f.Tooltip>
          <f.TooltipTrigger render={<f.Button variant="outline">Tooltip</f.Button>} />
          <f.TooltipContent>Next period</f.TooltipContent>
        </f.Tooltip>
        <f.Select
          defaultValue="week"
          items={[
            { label: "Week", value: "week" },
            { label: "Month", value: "month" },
            { label: "Year", value: "year" },
          ]}
        >
          <f.SelectTrigger aria-label="View">
            <f.SelectValue />
          </f.SelectTrigger>
          <f.SelectContent align="end" alignItemWithTrigger={false}>
            <f.SelectGroup>
              {["Week", "Month", "Year"].map((label) => (
                <f.SelectItem key={label} label={label} value={label.toLowerCase()}>
                  {label}
                </f.SelectItem>
              ))}
            </f.SelectGroup>
          </f.SelectContent>
        </f.Select>
        <f.Popover>
          <f.PopoverTrigger render={<f.Button variant="outline">Popover</f.Button>} />
          <f.PopoverContent aria-label="Thursday">
            <f.PopoverTitle>Thursday, October 8</f.PopoverTitle>
            <p style={{ margin: 0 }}>Three events</p>
            <f.PopoverClose render={<f.Button size="icon-sm" variant="ghost" />}>
              <Icon />
            </f.PopoverClose>
          </f.PopoverContent>
        </f.Popover>
        <f.Button onClick={() => setDialog(true)} variant="outline">
          Dialog
        </f.Button>
      </div>
      <f.Dialog onOpenChange={setDialog} open={dialog}>
        <f.DialogContent>
          <f.DialogHeader>
            <f.DialogTitle>Edit recurring event</f.DialogTitle>
            <f.DialogDescription>Which events should this change apply to?</f.DialogDescription>
          </f.DialogHeader>
          <f.DialogFooter>
            <f.DialogClose render={<f.Button variant="outline" />}>Cancel</f.DialogClose>
            <f.Button>This event</f.Button>
          </f.DialogFooter>
        </f.DialogContent>
      </f.Dialog>
      <f.ToastViewport aria-label="Notifications" manager={manager}>
        <f.Toast>
          <f.ToastTitle />
          <f.ToastDescription />
          <f.ToastAction />
          <f.ToastClose aria-label="Dismiss" />
        </f.Toast>
      </f.ToastViewport>
    </div>
  );
}

/** Renders the page its URL asks for, in the flavour given, and says when it is ready. */
export async function mountParityPage(flavour: Flavour) {
  const params = new URLSearchParams(location.search);
  const page: ParityPage = {
    dir: params.get("dir") === "rtl" ? "rtl" : "ltr",
    page: params.get("page") === "controls" ? "controls" : "views",
    theme: params.get("theme") === "dark" ? "dark" : "light",
    view: (params.get("view") as ParityView | null) ?? "week",
  };
  document.documentElement.classList.toggle("dark", page.theme === "dark");
  createRoot(document.getElementById("root")!).render(
    page.page === "controls" ? (
      <Controls flavour={flavour} />
    ) : (
      <Views flavour={flavour} {...page} />
    ),
  );
  await document.fonts.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.parityReady = true;
}

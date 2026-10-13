import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarEventChange,
} from "@moltenship/calendar";
import { act } from "react";
import { expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { createYearView } from "@registry/year-view/year-view";

import { atRest, press, removed, render, until } from "./render";

type Fixture = CalendarEvent<null, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [createYearView<Fixture>()],
});

/** A phone-sized year below the fold of a taller page, so a scroll of the page would show. */
function PhoneYear({
  onEventChange,
}: {
  readonly onEventChange?: (change: CalendarEventChange<Fixture, string, string>) => void;
}) {
  return (
    <div>
      <div className="h-[120vh]" />
      <Calendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="UTC"
        defaultView="year"
        events={[]}
        locale="en-US"
        now={Temporal.Instant.from("2026-10-08T10:00:00Z")}
        onEventChange={onEventChange}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Calendar.Frame className="flex h-[640px] w-[390px] flex-col">
          <CalendarToolbar calendar={Calendar} />
          <Calendar.Viewport className="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </Calendar.Frame>
      </Calendar.Root>
    </div>
  );
}

const view = () => document.querySelector<HTMLElement>('[data-slot="year-view"]')!;

/** Whether `month` ("2026-10") shows whole inside the view's scrollport. */
function showsMonth(month: string): boolean {
  const bounds = view().getBoundingClientRect();
  const box = document.querySelector(`[data-month="${month}"]`)!.getBoundingClientRect();
  return box.top >= bounds.top && box.bottom <= bounds.bottom;
}

const click = (label: string) =>
  act(async () => document.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!.click());

test("a phone-sized year opens on today's month, scrolling only itself", async () => {
  await render(<PhoneYear />);

  // Two months to a row: January's row would show first without the scroll.
  expect(document.querySelectorAll('[data-month="2026-01"], [data-month="2026-02"]')).toHaveLength(
    2,
  );
  expect(showsMonth("2026-10")).toBe(true);
  expect(showsMonth("2026-01")).toBe(false);
  expect(window.scrollY).toBe(0);
});

test("Today, Previous and Next bring the anchor's month back into view", async () => {
  await render(<PhoneYear />);
  view().scrollTop = 0;

  // Each scrolls the view smoothly.
  await click("Today");
  await atRest(view());
  expect(showsMonth("2026-10")).toBe(true);

  await click("Next period");
  expect(document.querySelector('[data-month="2027-10"]')).not.toBeNull();
  await atRest(view());
  expect(showsMonth("2027-10")).toBe(true);
  expect(window.scrollY).toBe(0);
});

test("keyboard focus brings its own day into view as it crosses the year", async () => {
  await render(<PhoneYear />);
  await act(async () =>
    document.querySelector<HTMLElement>('[role="gridcell"][data-date="2026-12-31"]')!.focus(),
  );

  await press("ArrowRight");

  await until(() => expect(document.activeElement?.getAttribute("data-date")).toBe("2027-01-01"));
  await atRest(view());
  const bounds = view().getBoundingClientRect();
  const day = document.activeElement!.getBoundingClientRect();
  expect(day.top >= bounds.top && day.bottom <= bounds.bottom).toBe(true);
});

/** The day the popover tests open, and the popup once it has opened and taken focus. */
const day = () => document.querySelector<HTMLElement>('[role="gridcell"][data-date="2026-10-14"]')!;
async function opened() {
  // The popup takes focus a frame after it mounts.
  await until(() =>
    expect(
      document.querySelector('[data-slot="popover-content"]')?.contains(document.activeElement),
    ).toBe(true),
  );
  return document.querySelector('[data-slot="popover-content"]')!;
}
/** Escape closes the popup. Focus goes back to the day once it unmounts, after its exit animation. */
async function closed(popup: Element) {
  await userEvent.keyboard("{Escape}");
  await removed(popup);
  expect(document.activeElement).toBe(day());
}

// Opening the popover renders every day's trigger again (#197): each test opens it twice and
// closes it once.
test("a clicked day's popover hands focus back to the day, where Space opens it again", async () => {
  const onEventChange = vi.fn();
  await render(<PhoneYear onEventChange={onEventChange} />);

  await userEvent.click(day().querySelector("button")!);
  await closed(await opened());
  await userEvent.keyboard(" ");
  await opened();
  expect(onEventChange).not.toHaveBeenCalled();
});

test("a popover opened from the keyboard hands focus back to the day, where Enter opens it again", async () => {
  const onEventChange = vi.fn();
  await render(<PhoneYear onEventChange={onEventChange} />);
  await act(async () => day().focus());

  await userEvent.keyboard("{Enter}");
  await closed(await opened());
  await userEvent.keyboard("{Enter}");
  await opened();
  expect(onEventChange).not.toHaveBeenCalled();
});

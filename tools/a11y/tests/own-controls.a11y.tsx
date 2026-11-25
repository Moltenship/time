import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar";
import { useState } from "react";
import { expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { Button } from "@registry/calendar-ui/button";
import { ViewSwitcher } from "@registry/calendar/view-switcher";
import { useRecurrenceScopePrompt } from "@registry/recurrence-scope-dialog/use-recurrence-scope-prompt";
import { createDayView } from "@registry/time-grid-view/time-grid-view";

import { RegistryScreen } from "./registry-screen";
import { atRest, click, press, render, until } from "./render";

// The kit's files are the app's code once added, so an app can make one render its own control.
// The views import the kit's names, so they get these instead, with nothing else changed.
vi.mock("@registry/calendar-ui/button", () => import("./own-controls/button"));
vi.mock("@registry/calendar-ui/dialog", () => import("./own-controls/dialog"));
vi.mock("@registry/calendar-ui/popover", () => import("./own-controls/popover"));
vi.mock("@registry/calendar-ui/select", () => import("./own-controls/select"));

const title = () => document.querySelector('[data-calendar-part="title"]')?.textContent;
const button = (name: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;

test("a view with the app's own button still steps by click and by keyboard", async () => {
  await render(<RegistryScreen view="week" />);
  const start = title();

  for (const name of ["Today", "Previous period", "Next period", "Previous month", "Next month"]) {
    expect(button(name).hasAttribute("data-own-control"), name).toBe(true);
  }

  await click(button("Next period"));
  await until(() => expect(title()).not.toBe(start));
  const next = title();

  // Enter and Space press a button in the browser, as they did the kit's.
  button("Previous period").focus();
  await userEvent.keyboard("{Enter}");
  await until(() => expect(title()).toBe(start));
  button("Next period").focus();
  await userEvent.keyboard(" ");
  await until(() => expect(title()).toBe(next));
  await userEvent.keyboard("{Enter}");
  await until(() => expect(title()).not.toBe(next));

  await click(button("Today"));
  await until(() => expect(title()).toBe(start));
});

const Calendar = createCalendar<CalendarEvent<null, string>, never>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [createDayView<CalendarEvent<null, string>>()],
});

test("the app's own button passes its disabled state to the calendar's trigger it renders", async () => {
  // As the toolbar composes them: the button renders the trigger, which runs the command.
  await render(
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      events={[]}
      locale="en-US"
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Button disabled render={<Calendar.NextTrigger aria-label="Next period" />} variant="ghost">
        Next
      </Button>
      <Calendar.Title />
    </Calendar.Root>,
  );
  const next = button("Next period");
  const start = title();

  expect(next.hasAttribute("data-own-control")).toBe(true);
  expect(next.dataset.calendarPart).toBe("next-trigger");
  expect(next.disabled).toBe(true);
  await click(next);
  next.focus();
  await userEvent.keyboard("{Enter}");
  expect(title()).toBe(start);
});

function Switcher() {
  const [view, setView] = useState("week");
  return (
    <div className="p-4">
      <ViewSwitcher
        onValueChange={setView}
        options={[
          { label: "Day", shortcut: "D", value: "day" },
          { label: "Week", shortcut: "W", value: "week" },
          { label: "Month", shortcut: "M", value: "month" },
        ]}
        value={view}
      />
      <output>{view}</output>
    </div>
  );
}

test("the view switcher with the app's own select picks by click, by keyboard and by typing", async () => {
  await render(<Switcher />);
  const trigger = document.querySelector<HTMLElement>('[aria-label="View"]')!;
  const chosen = () => document.querySelector("output")?.textContent;
  const option = (label: string) =>
    [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((element) =>
      element.textContent?.startsWith(label),
    );

  const open = () => trigger.getAttribute("aria-expanded") === "true";

  expect(trigger.hasAttribute("data-own-control")).toBe(true);
  expect(trigger.textContent).toContain("Week");

  await click(trigger);
  await until(() => expect(open() && option("Month")).toBeTruthy());
  expect(option("Month")?.closest("[data-own-control]")).not.toBeNull();
  await click(option("Month"));
  await until(() => expect(chosen()).toBe("month"));
  expect(trigger.textContent).toContain("Month");

  // Open from the keyboard, move with the arrows, choose with Enter.
  await until(() => expect(open()).toBe(false));
  trigger.focus();
  await userEvent.keyboard("{ArrowDown}");
  await until(() => expect(open()).toBe(true));
  const highlighted = (label: string) =>
    until(() => expect(option(label)?.hasAttribute("data-highlighted"), label).toBe(true));
  await highlighted("Month");
  // WebKit can miss an arrow key pressed in the frames just after the list opens.
  await atRest(option("Month")!.closest<HTMLElement>("[data-own-control]")!);
  await userEvent.keyboard("{ArrowUp}");
  await highlighted("Week");
  await userEvent.keyboard("{ArrowUp}");
  await highlighted("Day");
  await userEvent.keyboard("{Enter}");
  await until(() => expect(chosen()).toBe("day"));

  // Typing a label's first letter on the closed trigger picks that option.
  await until(() => expect(open()).toBe(false));
  trigger.focus();
  await userEvent.keyboard("w");
  await until(() => expect(chosen()).toBe("week"));
});

const popup = () => document.querySelector<HTMLElement>('[data-slot="popover-content"]');
const focusIsIn = (element: Element | null) =>
  until(() => expect(element?.contains(document.activeElement)).toBe(true));

test("the year view with the app's own popover lists a day by pointer and by keyboard", async () => {
  await render(<RegistryScreen view="year" />);
  const cell = document.querySelector<HTMLElement>('[role="gridcell"][data-date="2026-10-08"]')!;

  await click(cell.querySelector("button"));
  await until(() => expect(popup()?.hasAttribute("data-own-control")).toBe(true));
  expect(popup()!.querySelectorAll("[data-event-id]")).toHaveLength(12);
  await focusIsIn(popup());
  await press("Escape");
  await until(() => expect(popup()).toBeNull());
  expect(document.activeElement).toBe(cell);

  await press("Enter");
  await until(() => expect(popup()?.hasAttribute("data-own-control")).toBe(true));
  await focusIsIn(popup());
  await press("Escape");
  await until(() => expect(popup()).toBeNull());
  expect(document.activeElement).toBe(cell);
});

test("the month view's +N more list opens in the app's own popover", async () => {
  await render(<RegistryScreen view="month" />);
  const more = document.querySelector<HTMLElement>('[aria-label*=" more events on "]')!;

  expect(more.hasAttribute("data-own-control")).toBe(true);
  await click(more);
  await until(() => expect(popup()?.hasAttribute("data-own-control")).toBe(true));
  await focusIsIn(popup());
  await press("Escape");
  await until(() => expect(popup()).toBeNull());
});

test("an annotation's details open in the app's own popover and close with Escape", async () => {
  await render(<RegistryScreen view="week" />);
  const previous = document.querySelector<HTMLElement>('button[aria-label^="Previous"]')!;
  previous.focus();

  await click(
    document.querySelector<HTMLElement>('[data-slot="annotation-mark"][data-source="music"]'),
  );
  await until(() => expect(popup()?.hasAttribute("data-own-control")).toBe(true));
  await focusIsIn(popup());
  await press("Escape");
  await until(() => expect(popup()).toBeNull());
  expect(document.activeElement).toBe(previous);
});

function RecurringEvent() {
  const { ask, dialog } = useRecurrenceScopePrompt();
  const [answer, setAnswer] = useState("none yet");
  return (
    <main className="p-4">
      <button
        type="button"
        data-event-id="standup"
        onClick={async () => setAnswer((await ask({ eventTitle: "Standup" })) ?? "cancelled")}
      >
        Standup
      </button>
      <output>{answer}</output>
      {dialog}
    </main>
  );
}

test("the recurrence question in the app's own dialog answers by keyboard", async () => {
  await render(<RecurringEvent />);
  const event = document.querySelector<HTMLElement>('[data-event-id="standup"]')!;
  const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
  const answer = () => document.querySelector("output")?.textContent;
  const focused = () => document.activeElement?.textContent;

  event.focus();
  await userEvent.keyboard("{Enter}");
  await until(() => expect(dialog()?.hasAttribute("data-own-control")).toBe(true));
  await until(() => expect(focused()).toBe("This event"));
  await userEvent.keyboard("{Escape}");
  await until(() => expect(answer()).toBe("cancelled"));
  await until(() => expect(dialog()).toBeNull());
  expect(document.activeElement).toBe(event);

  await userEvent.keyboard("{Enter}");
  await until(() => expect(focused()).toBe("This event"));
  await userEvent.keyboard("{Tab}");
  await until(() => expect(focused()).toBe("This and following events"));
  await userEvent.keyboard("{Enter}");
  await until(() => expect(answer()).toBe("following"));
  await until(() => expect(document.activeElement).toBe(event));
});

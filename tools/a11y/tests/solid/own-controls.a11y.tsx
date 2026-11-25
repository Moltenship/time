import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";
import { expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { ViewSwitcher } from "@registry/calendar/view-switcher";
import { createAgendaView } from "@registry/list-view/agenda-view";

import { render, until } from "./render";

// The kit's files are the app's code once added, so an app can make one render its own control,
// as `../own-controls.a11y.tsx` checks for React. The views import the kit's names, so they get
// these instead, with nothing else changed: a plain `<button>` and a native `<select>`.
vi.mock("@registry/calendar-ui/button", () => import("./own-controls/button"));
vi.mock("@registry/calendar-ui/select", () => import("./own-controls/select"));

type Fixture = CalendarEvent<null, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [createAgendaView<Fixture>()],
});

const options = [
  { label: "Agenda", value: "agenda" },
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
] as const;
type View = (typeof options)[number]["value"];

let chosen: View[] = [];

function Screen() {
  const [view, setView] = createSignal<View>("agenda");
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      defaultView="agenda"
      events={[]}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T10:20:00Z")}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame class="flex h-dvh flex-col">
        <CalendarToolbar calendar={Calendar} class="border-b">
          <ViewSwitcher
            onValueChange={(next) => {
              chosen.push(next);
              setView(() => next);
            }}
            options={options}
            value={view()}
          />
        </CalendarToolbar>
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}

const title = () => document.querySelector('[data-calendar-part="title"]')?.textContent;
const button = (name: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
const select = () => document.querySelector<HTMLSelectElement>('select[aria-label="View"]')!;

test("the toolbar with the app's own button still steps by click and by keyboard", async () => {
  await render(() => <Screen />);
  const start = title();

  for (const name of ["Today", "Previous period", "Next period"]) {
    expect(button(name).hasAttribute("data-own-control"), name).toBe(true);
  }
  // The calendar's trigger keeps its own part name, and the tooltip still names its button.
  expect(button("Next period").getAttribute("data-calendar-part")).toBe("next-trigger");
  expect(button("Today").textContent).toBe("Today");

  await userEvent.click(button("Next period"));
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

  await userEvent.click(button("Today"));
  await until(() => expect(title()).toBe(start));
});

test("the view switcher with the app's own select still picks by pointer and by keyboard", async () => {
  chosen = [];
  await render(() => <Screen />);
  expect(select().hasAttribute("data-own-control")).toBe(true);
  expect([...select().options].map(({ label }) => label)).toEqual(["Agenda", "Week", "Month"]);
  expect(select().value).toBe("agenda");

  await userEvent.selectOptions(select(), "month");
  await until(() => expect(chosen).toEqual(["month"]));
  expect(select().value).toBe("month");

  // Typing picks an option on a closed native select on every platform; the arrows open it on macOS.
  select().focus();
  await userEvent.keyboard("w");
  await until(() => expect(chosen).toEqual(["month", "week"]));
  expect(select().value).toBe("week");
  expect(document.activeElement).toBe(select());
});

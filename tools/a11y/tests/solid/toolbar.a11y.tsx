import {
  createCalendar,
  createCanonicalEventAdapter,
  plainDateInterval,
  type CalendarEvent,
} from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";
import { describe, expect, test } from "vite-plus/test";
import { cdp, page, server, userEvent } from "vite-plus/test/browser";

import { CalendarToolbar } from "@registry/calendar/calendar-toolbar";
import { MiniMonth } from "@registry/calendar/mini-month";
import { ViewSwitcher } from "@registry/calendar/view-switcher";
import { createAgendaView } from "@registry/list-view/agenda-view";

import { seriousViolations, setTheme, themes } from "../axe";
import { render, until } from "./render";

// The Solid toolbar, view switcher and mini month in a real browser, against what the React files
// check (axe, rtl-layout, phone-layout, reduced-motion and the kit's tooltip delay): roles and
// names pass axe in both themes, arrows turn in RTL, targets are 24 px on a phone, the select's
// list doesn't zoom for reduced motion, a tooltip waits 400 ms, and keys move through the month.

type Fixture = CalendarEvent<null, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [createAgendaView<Fixture>()],
});

const today = Temporal.PlainDate.from("2026-10-08");

const viewOptions = [
  { label: "Agenda", shortcut: "A", value: "agenda" },
  { label: "Week", shortcut: "W", value: "week" },
  { label: "Month", shortcut: "M", value: "month" },
] as const;
type View = (typeof viewOptions)[number]["value"];

let chosen: View[] = [];

/** The React registry screen's sidebar and toolbar, over the agenda. */
function Screen(props: { readonly dir?: "ltr" | "rtl" }) {
  const [view, setView] = createSignal<View>("agenda");
  const [selected, setSelected] = createSignal(today.add({ days: 1 }));
  return (
    <Calendar.Root
      defaultAnchorDate={today}
      defaultTimeZone="UTC"
      defaultView="agenda"
      direction={props.dir ?? "ltr"}
      events={[]}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T10:20:00Z")}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame class="flex h-dvh" dir={props.dir ?? "ltr"}>
        <aside class="w-64 shrink-0 border-e p-3">
          <MiniMonth
            locale="en-US"
            onSelectDate={setSelected}
            selectedDate={selected()}
            today={today}
            visibleRange={plainDateInterval(today.subtract({ days: 3 }), today.add({ days: 4 }))}
            weekStartsOn={1}
          />
        </aside>
        <main class="flex min-w-0 flex-1 flex-col">
          <CalendarToolbar calendar={Calendar} class="border-b">
            <ViewSwitcher
              onValueChange={(next) => {
                chosen.push(next);
                setView(() => next);
              }}
              options={viewOptions}
              value={view()}
            />
          </CalendarToolbar>
          <Calendar.Viewport class="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </main>
      </Calendar.Frame>
    </Calendar.Root>
  );
}

const button = (name: string) =>
  document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
const switcher = () => document.querySelector<HTMLButtonElement>('[role="combobox"]')!;
const listbox = () => document.querySelector<HTMLElement>('[role="listbox"][data-open]');
const heading = () => document.querySelector('[role="grid"]')!.getAttribute("aria-labelledby")!;
const monthTitle = () => document.getElementById(heading())!.textContent;
const tabStop = () =>
  document.querySelector<HTMLButtonElement>('[role="grid"] button[tabindex="0"]')!;

describe.each(themes)("the Solid toolbar and mini month, %s theme", (theme) => {
  test("have no serious violations, with the view list closed and open", async () => {
    setTheme(theme);
    await render(() => <Screen />);
    expect(await seriousViolations()).toEqual([]);

    await userEvent.click(switcher());
    await until(() => expect(listbox()).not.toBeNull());
    for (const animation of document.getAnimations()) animation.finish();
    expect(await seriousViolations()).toEqual([]);
    await userEvent.keyboard("{Escape}");
    setTheme("light");
  });
});

describe.each(["ltr", "rtl"] as const)("the Solid toolbar and mini month, %s", (dir) => {
  test("their arrows point to the inline start and end", async () => {
    await render(() => <Screen dir={dir} />);
    const turned = dir === "rtl" ? "180deg" : "none";

    for (const name of ["Previous period", "Next period", "Previous month", "Next month"]) {
      expect(getComputedStyle(button(name).querySelector("svg")!).rotate, name).toBe(turned);
    }
  });

  test("the mini month's keys move through days and months", async () => {
    await render(() => <Screen dir={dir} />);
    tabStop().focus();
    expect(tabStop().textContent).toBe("9");

    // The next day is on the inline end: the right, or the left right to left.
    await userEvent.keyboard(dir === "rtl" ? "{ArrowLeft}" : "{ArrowRight}");
    await until(() => expect(document.activeElement?.textContent).toBe("10"));
    await userEvent.keyboard("{ArrowDown}");
    await until(() => expect(document.activeElement?.textContent).toBe("17"));
    await userEvent.keyboard("{PageDown}");
    await until(() => expect(monthTitle()).toBe("November 2026"));
    expect(document.activeElement?.textContent).toBe("17");
    await userEvent.keyboard("{Enter}");
    await until(() =>
      expect(document.activeElement?.closest("td")?.getAttribute("aria-selected")).toBe("true"),
    );
  });
});

test("the view switcher picks a view by pointer and by keyboard", async () => {
  chosen = [];
  await render(() => <Screen />);
  expect(switcher().textContent).toBe("Agenda");

  await userEvent.click(switcher());
  await until(() => expect(listbox()).not.toBeNull());
  // The shortcut shows in the list, and the trigger reads the label alone.
  expect(listbox()!.textContent).toContain("WeekW");
  await userEvent.click(
    [...listbox()!.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
      option.textContent?.startsWith("Month"),
    )!,
  );
  await until(() => expect(switcher().textContent).toBe("Month"));

  switcher().focus();
  await userEvent.keyboard("{ArrowDown}");
  await until(() => expect(listbox()).not.toBeNull());
  await userEvent.keyboard("{ArrowUp}");
  await userEvent.keyboard("{Enter}");
  await until(() => expect(switcher().textContent).toBe("Week"));
  expect(chosen).toEqual(["month", "week"]);
  expect(document.activeElement).toBe(switcher());
});

test("the toolbar's tooltips wait 400 ms, then name their buttons", async () => {
  await render(() => <Screen />);
  const tooltip = () => document.querySelector('[role="tooltip"][data-open]');
  // The wait, timed in the page from the pointer's arrival to the tooltip's opening. Timing it
  // from the test's side read the hover's reply, which a busy page takes late: past 400 ms, the
  // tooltip had opened on time before a check meant for 200 ms in.
  const next = button("Next period");
  let entered = Number.NaN;
  let opened = Number.NaN;
  // Captured on the window, this runs before the tooltip's own pointer handlers.
  const onOver = (event: PointerEvent) => {
    if (Number.isNaN(entered) && next.contains(event.target as Node)) entered = performance.now();
  };
  addEventListener("pointerover", onOver, { capture: true });
  // A mutation's callback runs as a microtask, so it reads the time the tooltip opened.
  const observer = new MutationObserver(() => {
    if (Number.isNaN(opened) && tooltip() !== null) opened = performance.now();
  });
  observer.observe(document.body, { attributeFilter: ["data-open"], subtree: true });
  try {
    await userEvent.hover(next);
    await until(() => expect(tooltip()).not.toBeNull());
  } finally {
    observer.disconnect();
    removeEventListener("pointerover", onOver, { capture: true });
  }
  expect(opened - entered).toBeGreaterThanOrEqual(400);
  expect(tooltip()!.textContent).toBe("Next period");
  expect(button("Next period").getAttribute("aria-labelledby")).toBe(tooltip()!.id);
});

// Chromium alone emulates a phone's touch screen and the reduced-motion preference through CDP.
describe.runIf(server.browser === "chromium")("in Chromium's emulation", () => {
  test("on a 375 px touch screen, the toolbar's and month's targets are 24 px", async () => {
    await page.viewport(375, 667);
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
    try {
      await render(() => <Screen />);
      const targets = [...document.querySelectorAll<HTMLElement>("button, [role='combobox']")]
        .filter((element) => element.closest("[data-slot='agenda-view']") === null)
        .map((element) => ({ box: element.getBoundingClientRect(), element }))
        .filter(({ box }) => box.width > 0 && box.right > 0 && box.left < innerWidth);
      expect(targets.length).toBeGreaterThan(40);
      const small = targets
        .filter(({ box }) => box.width < 24 || box.height < 24)
        .map(({ element }) => element.getAttribute("aria-label") ?? element.textContent);
      expect(small).toEqual([]);
    } finally {
      await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await page.viewport(1280, 800);
    }
  });

  test("with reduced motion, the view list fades in without zooming or sliding", async () => {
    await render(() => <Screen />);
    await userEvent.click(switcher());
    await until(() => expect(listbox()).not.toBeNull());
    const list = listbox()!;
    list.style.transition = "none";
    // The list's look at the start of its entry, held still to read it.
    const entry = () => {
      list.setAttribute("data-starting-style", "");
      const { opacity, scale, translate } = getComputedStyle(list);
      list.removeAttribute("data-starting-style");
      return { opacity, scale, translate };
    };
    expect(entry().opacity).toBe("0");
    expect(entry().scale).not.toBe("none");

    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    try {
      expect(entry()).toEqual({ opacity: "0", scale: "none", translate: "none" });
    } finally {
      await cdp().send("Emulation.setEmulatedMedia", { features: [] });
      await userEvent.keyboard("{Escape}");
    }
  });
});

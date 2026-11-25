// @vitest-environment jsdom

import { plainDateInterval } from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";
import { describe, expect, test, vi } from "vite-plus/test";

import { MiniMonth, type MiniMonthProps } from "../calendar/mini-month";
import { click, focus, press, render, settled } from "./render";

const today = Temporal.PlainDate.from("2026-10-08");

async function renderMiniMonth(props: Partial<MiniMonthProps> = {}) {
  const onSelectDate = vi.fn<(date: Temporal.PlainDate) => void>();
  const [selectedDate, setSelectedDate] = createSignal(props.selectedDate ?? today);
  const view = await render(() => (
    <MiniMonth
      locale="en-US"
      onSelectDate={onSelectDate}
      today={today}
      weekStartsOn={7}
      {...props}
      selectedDate={selectedDate()}
    />
  ));
  const title = () => view.container.querySelector("h2")?.textContent;
  const day = (label: string) => view.container.querySelector(`button[aria-label="${label}"]`);

  return { ...view, day, onSelectDate, setSelectedDate, title };
}

describe("MiniMonth", () => {
  test("renders six locale-aware weeks from the configured week start", async () => {
    const { container, title } = await renderMiniMonth({ weekStartsOn: 1 });
    const headers = [...container.querySelectorAll("th")].map((th) => th.textContent);
    const days = container.querySelectorAll("tbody button");

    expect(title()).toBe("October 2026");
    expect(headers).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
    expect(container.querySelector("th")?.getAttribute("abbr")).toBe("Monday");
    expect(days).toHaveLength(42);
    expect(days[0]?.getAttribute("aria-label")).toBe("Monday, September 28, 2026");
    expect(days[0]?.hasAttribute("data-outside-month")).toBe(true);
  });

  test("marks today, the selected date, and the visible range", async () => {
    const { container, day } = await renderMiniMonth({
      selectedDate: today.add({ days: 2 }),
      visibleRange: plainDateInterval(
        Temporal.PlainDate.from("2026-10-04"),
        Temporal.PlainDate.from("2026-10-11"),
      ),
    });

    expect(day("Thursday, October 8, 2026")?.getAttribute("aria-current")).toBe("date");
    expect(container.querySelector('td[aria-selected="true"] button')?.textContent).toBe("10");
    expect([...container.querySelectorAll("td[data-visible]")].map((td) => td.textContent)).toEqual(
      ["4", "5", "6", "7", "8", "9", "10"],
    );
  });

  test("selects a clicked day and pages months independently", async () => {
    const { day, onSelectDate, title, container } = await renderMiniMonth();

    await click(day("Friday, October 16, 2026"));
    expect(onSelectDate).toHaveBeenCalledWith(Temporal.PlainDate.from("2026-10-16"));

    await click(container.querySelector('button[aria-label="Next month"]'));
    expect(title()).toBe("November 2026");
    await click(container.querySelector('button[aria-label="Previous month"]'));
    await click(container.querySelector('button[aria-label="Previous month"]'));
    expect(title()).toBe("September 2026");
  });

  test("moves a single tab stop with the keyboard across month boundaries", async () => {
    const { container, title } = await renderMiniMonth({
      selectedDate: Temporal.PlainDate.from("2026-10-30"),
    });
    const tabStops = () => container.querySelectorAll('tbody button[tabindex="0"]');

    expect(tabStops()).toHaveLength(1);
    await focus(tabStops()[0] ?? null);
    await press("ArrowDown");
    await settled();

    expect(title()).toBe("November 2026");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Friday, November 6, 2026");
    expect(tabStops()).toHaveLength(1);

    await press("PageUp");
    await settled();
    expect(title()).toBe("October 2026");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Tuesday, October 6, 2026");
  });

  test("follows the selected date into another month, and not an equal one", async () => {
    const { container, setSelectedDate, title } = await renderMiniMonth();

    await click(container.querySelector('button[aria-label="Next month"]'));
    setSelectedDate(Temporal.PlainDate.from(today.toString()));
    await settled();
    expect(title()).toBe("November 2026");

    setSelectedDate(Temporal.PlainDate.from("2027-02-14"));
    await settled();
    expect(title()).toBe("February 2027");
  });
});

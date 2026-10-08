// @vitest-environment jsdom

import { plainDateInterval } from "@moltenship/calendar";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { MiniMonth, type MiniMonthProps } from "../calendar/mini-month";
import { click, press, render } from "./render";

const today = Temporal.PlainDate.from("2026-10-08");
let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function renderMiniMonth(props: Partial<MiniMonthProps> = {}) {
  const onSelectDate = vi.fn<(date: Temporal.PlainDate) => void>();
  const element = (overrides: Partial<MiniMonthProps> = {}) => (
    <MiniMonth
      locale="en-US"
      onSelectDate={onSelectDate}
      selectedDate={today}
      today={today}
      weekStartsOn={7}
      {...props}
      {...overrides}
    />
  );
  const view = await render(element());
  cleanup = view.unmount;
  const title = () => view.container.querySelector("h2")?.textContent;
  const day = (label: string) => view.container.querySelector(`button[aria-label="${label}"]`);

  return { ...view, day, element, onSelectDate, title };
}

describe("MiniMonth", () => {
  test("renders six locale-aware weeks from the configured week start", async () => {
    const { container, title } = await renderMiniMonth({ weekStartsOn: 1 });
    const headers = [...container.querySelectorAll("th")].map((th) => th.textContent);
    const days = container.querySelectorAll("tbody button");

    expect(title()).toBe("October 2026");
    expect(headers).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
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
  });

  test("moves a single tab stop with the keyboard across month boundaries", async () => {
    const { container, title } = await renderMiniMonth({
      selectedDate: Temporal.PlainDate.from("2026-10-30"),
    });
    const tabStops = () => container.querySelectorAll('tbody button[tabindex="0"]');

    expect(tabStops()).toHaveLength(1);
    await press(tabStops()[0] ?? null, "ArrowDown");

    expect(title()).toBe("November 2026");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Friday, November 6, 2026");
    expect(tabStops()).toHaveLength(1);
  });

  test("follows the selected date into another month", async () => {
    const { element, rerender, title } = await renderMiniMonth();

    await rerender(element({ selectedDate: Temporal.PlainDate.from("2027-02-14") }));

    expect(title()).toBe("February 2027");
  });
});

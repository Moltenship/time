// @vitest-environment jsdom

import type { CalendarResource } from "@moltenship/calendar";
import { act } from "react";
import { afterEach, expect, test } from "vite-plus/test";

import { render } from "./render";
import { people, ResourceCalendar, shift, type StaffEvent } from "./resource-fixtures";
import { ariaLabel, text } from "./view-fixtures";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function renderResources(
  resources: readonly CalendarResource<null>[],
  events: readonly StaffEvent[] = [],
) {
  const result = await render(
    <div style={{ height: 720, width: 1024 }}>
      <ResourceCalendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="America/New_York"
        defaultView="resources"
        events={events}
        locale="en-US"
        now={Temporal.Instant.from("2026-10-08T16:30Z")}
        resources={resources}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <ResourceCalendar.ActiveView />
      </ResourceCalendar.Root>
    </div>,
  );
  cleanup = result.unmount;
  return result.container;
}

const body = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-slot="resource-columns-body"]')!;
const renderedResources = (container: HTMLElement) =>
  [...body(container).querySelectorAll("[data-resource-id]")].map((column) =>
    column.getAttribute("data-resource-id"),
  );
const headers = (container: HTMLElement) =>
  [...container.querySelectorAll('[role="row"]:first-child [role="columnheader"]')]
    .slice(1)
    .map((header) => text(header.querySelector("[title]")));

async function scrollTo(element: HTMLElement, left: number) {
  Object.defineProperty(element, "scrollLeft", { configurable: true, value: left });
  await act(async () => {
    element.dispatchEvent(new Event("scroll"));
  });
}

test("renders only the resource columns in view out of 200", async () => {
  const container = await renderResources(people(200));
  const rendered = renderedResources(container);

  // 960px before the browser measures, at 128px a column, plus two either side.
  expect(rendered).toEqual(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"]);
  expect(headers(container)).toEqual(rendered.map((id) => `Person ${id?.slice(1)}`));
  expect(body(container).firstElementChild).toHaveProperty("style.width", `${200 * 128}px`);
  expect(container.querySelector('[role="grid"]')?.getAttribute("aria-colcount")).toBe("201");
});

test("scrolling sideways renders the columns in view and moves the headers with them", async () => {
  const container = await renderResources(people(200));

  await scrollTo(body(container), 100 * 128);

  expect(renderedResources(container)).toEqual(
    Array.from({ length: 12 }, (_, index) => `p${99 + index}`),
  );
  const canvas = container.querySelector<HTMLElement>(
    '[role="row"]:first-child [role="columnheader"] + div > div',
  );
  expect(canvas?.style.transform).toBe(`translateX(${-100 * 128}px)`);
  expect(headers(container)[0]).toBe("Person 99");
});

test("a few resources share the width", async () => {
  const container = await renderResources(people(3));
  const columns = [...body(container).querySelectorAll<HTMLElement>("[data-resource-id]")];

  expect(columns.map((column) => [column.style.insetInlineStart, column.style.width])).toEqual([
    ["0px", "320px"],
    ["320px", "320px"],
    ["640px", "320px"],
  ]);
});

test("shows each event in the column of every resource it is assigned to", async () => {
  const container = await renderResources(people(3), [
    shift("standup", ["p1", "p3"], "2026-10-08T13:00Z", "2026-10-08T13:30Z"),
    shift("review", ["p2"], "2026-10-08T15:00Z", "2026-10-08T16:00Z"),
  ]);
  const columnOf = (id: string) =>
    [...container.querySelectorAll(`[data-event-id="${id}"]`)].map((event) =>
      event.closest("[data-resource-id]")?.getAttribute("data-resource-id"),
    );

  expect(columnOf("standup")).toEqual(["p1", "p3"]);
  expect(columnOf("review")).toEqual(["p2"]);
  expect(
    container.querySelector('[data-resource-id="p2"] [data-date]')?.getAttribute("data-date"),
  ).toBe("2026-10-08");
  expect(container.querySelectorAll('[data-slot="time-grid-now"]')).toHaveLength(3);
});

test("groups child resources under a band named for their parent", async () => {
  const container = await renderResources([
    { data: null, id: "rooms", title: "Rooms" },
    { data: null, id: "aurora", parentId: "rooms", title: "Aurora" },
    { data: null, id: "borealis", parentId: "rooms", title: "Borealis" },
    { data: null, id: "ada", title: "Ada" },
  ]);
  const [group, aurora, , ada] = [
    ...container.querySelectorAll('[role="row"]:first-child [role="columnheader"]'),
  ].slice(1);
  const toggle = group?.querySelector("button");

  expect(toggle?.getAttribute("aria-expanded")).toBe("true");
  expect(ariaLabel(toggle)).toBe("Collapse Rooms");
  expect(text(aurora)).toBe("Aurora, Rooms");
  expect(text(ada)).toBe("Ada");
});

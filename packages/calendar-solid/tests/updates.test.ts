// @vitest-environment jsdom

import { createComponent } from "@solidjs/web";
import { createAgent } from "@ui-sdk/solid/agent";
import { createSignal, merge } from "solid-js";
import { expect, test, vi } from "vite-plus/test";

import { createCalendar } from "../src";
import {
  adapter,
  Calendar,
  CalendarRoot,
  Chrome,
  review,
  rootDefaults,
  type Meeting,
  type RootProps,
} from "./fixtures/calendar";
import { mount, settled } from "./harness/render";
import "./setup";

// Counts the runtime's derives and commits: one of each per change is the adapter's promise.
const counts = vi.hoisted(() => ({ commits: 0, connects: 0, derives: 0, reconciles: 0 }));

vi.mock("@moltenship/calendar-primitives", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moltenship/calendar-primitives")>();
  return {
    ...actual,
    createCalendarRuntime: ((config: Parameters<typeof actual.createCalendarRuntime>[0]) => {
      const runtime = actual.createCalendarRuntime(config);
      return {
        ...runtime,
        connect: (...args: Parameters<typeof runtime.connect>) => {
          counts.connects += 1;
          return runtime.connect(...args);
        },
        commit: (...args: Parameters<typeof runtime.commit>) => {
          counts.commits += 1;
          runtime.commit(...args);
        },
        derive: (...args: Parameters<typeof runtime.derive>) => {
          counts.derives += 1;
          return runtime.derive(...args);
        },
        reconcile: (...args: Parameters<typeof runtime.reconcile>) => {
          counts.reconciles += 1;
          runtime.reconcile(...args);
        },
      };
    }) as unknown as typeof actual.createCalendarRuntime,
  };
});

const agent = createAgent();

function render(props: RootProps = {}) {
  const view = mount(() =>
    createComponent(
      CalendarRoot,
      merge(props, {
        get children() {
          return createComponent(Chrome, {});
        },
      }),
    ),
  );
  const part = (name: string) =>
    view.container.querySelector<HTMLElement>(`[data-calendar-part='${name}']`)!;
  return { ...view, part };
}

async function measure(change: () => unknown) {
  await settled();
  for (const key of Object.keys(counts) as (keyof typeof counts)[]) counts[key] = 0;
  await change();
  await settled();
  return { ...counts };
}

test("a trigger's press derives and commits the model once, and reports each callback once", async () => {
  const diagnostics: unknown[] = [];
  const ranges: string[] = [];
  const { part } = render({
    onDiagnosticsChange: (next) => void diagnostics.push(next),
    onVisibleRangeChange: (range) => void ranges.push(range.range.start.toString()),
  });

  expect(await measure(() => part("next-trigger").click())).toEqual({
    commits: 1,
    connects: 0,
    derives: 1,
    reconciles: 0,
  });
  expect(part("title").textContent).toBe("Week 2026-08-22");
  // Solid runs an effect again whenever its compute does; the adapter's run only on a new value.
  expect(diagnostics).toHaveLength(1);
  expect(ranges).toEqual(["2026-08-15", "2026-08-22"]);
});

test("a controlled slice whose owner takes the change derives once, not once per write", async () => {
  const [anchor, setAnchor] = createSignal(Temporal.PlainDate.from("2026-08-15"));
  const { part } = render({
    get anchorDate() {
      return anchor();
    },
    onAnchorDateChange: (next) => setAnchor(next),
  });

  expect(await measure(() => part("next-trigger").click())).toMatchObject({
    commits: 1,
    derives: 1,
  });
  expect(part("title").textContent).toBe("Week 2026-08-22");
});

test("an agent's command derives once", async () => {
  render({ label: "Team calendar" });

  expect(
    await measure(() =>
      agent.act({ steps: [{ action: "navigateNext", args: [], ref: "Team calendar" }] }),
    ),
  ).toMatchObject({ commits: 1, derives: 1 });
});

test("a prop the model doesn't read, as the label, derives nothing", async () => {
  const [label, setLabel] = createSignal("Team calendar");
  const { part } = render({
    get label() {
      return label();
    },
  });

  expect(await measure(() => setLabel("Room calendar"))).toEqual({
    commits: 0,
    connects: 0,
    derives: 0,
    reconciles: 0,
  });
  expect(part("frame").getAttribute("aria-label")).toBe("Room calendar");
});

test("an event change the application applies at once derives, commits and reconciles once", async () => {
  const [events, setEvents] = createSignal<readonly Meeting[]>([review]);
  render({
    get events() {
      return events();
    },
    onEventChange: (change) => {
      if (change.cause !== "move") return;
      setEvents([{ ...review, interval: change.proposed }]);
    },
  });

  const counted = await measure(() =>
    agent.act({
      steps: [
        {
          action: "moveEvent",
          args: [{ eventId: "meeting-1", start: "2026-08-16T14:00" }],
          ref: "Team calendar",
        },
      ],
    }),
  );

  // The pending placement and the application's new events land in one flush.
  expect(counted).toEqual({ commits: 1, connects: 0, derives: 1, reconciles: 1 });
});

test("a default given later changes nothing, and connects nothing again", async () => {
  const [defaultView, setDefaultView] = createSignal<"agenda" | "week">("week");
  const { part } = render({
    get defaultView() {
      return defaultView();
    },
  });

  expect(await measure(() => setDefaultView("agenda"))).toEqual({
    commits: 0,
    connects: 0,
    derives: 0,
    reconciles: 0,
  });
  expect(part("title").textContent).toBe("Week 2026-08-15");
});

test("a signal the event adapter reads is not a dependency of the model", async () => {
  const [suffix, setSuffix] = createSignal("");
  const Reading = createCalendar<Meeting>()({
    eventAdapter: { ...adapter, getTitle: (event) => `${event.title}${suffix()}` },
    views: Calendar.views,
  });
  mount(() => createComponent(Reading.Root, { ...rootDefaults, events: [review] }));

  expect(await measure(() => setSuffix("!"))).toMatchObject({ commits: 0, derives: 0 });
});

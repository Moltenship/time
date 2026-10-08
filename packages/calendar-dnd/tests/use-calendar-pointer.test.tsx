// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  timeGridColumns,
  type CalendarEventProposal,
  type EventSnapshot,
  type TimeGridColumn,
} from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";

import { useCalendarPointer } from "../src/index";
import {
  COLUMN_WIDTH,
  HOUR_HEIGHT,
  place,
  pointer,
  resetLayout,
  timedEvent,
  timeZone,
  yAt,
  type TestEvent,
} from "./dom-fixture";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Propose = (proposal: CalendarEventProposal<string | number, string>) => void;

const columns = timeGridColumns(
  plainDateInterval(Temporal.PlainDate.from("2026-08-17"), Temporal.PlainDate.from("2026-08-18")),
  timeZone,
);
const snapshot = createEventSnapshot(
  [timedEvent("a", "2026-08-17T09:00Z", "2026-08-17T10:00Z")],
  createCanonicalEventAdapter<null, string | number, string>(),
);

/** The smallest view the hook supports: day columns with events and resize handles. */
function FixtureView(props: {
  readonly columns: readonly TimeGridColumn[];
  readonly events: EventSnapshot<TestEvent, string | number, string>;
  readonly onPropose: Propose;
  readonly onRender: () => void;
}) {
  props.onRender();
  const ref = useCalendarPointer({
    columns: props.columns,
    events: props.events,
    onPropose: props.onPropose,
    timeZone,
  });
  return (
    <div ref={ref}>
      {props.columns.map((column) => (
        <div data-date={column.date.toString()} key={column.key}>
          {props.events.events.map((event) => (
            <button data-event-id={String(event.id)} key={event.id} type="button">
              {event.title}
              <span data-resize="end" />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Gives the rendered fixture the time-grid geometry used by the DOM tests. */
function layOut(container: HTMLElement): HTMLElement {
  resetLayout();
  document.body.append(container);
  place(
    container.querySelector("[data-date]")!,
    {
      height: 24 * HOUR_HEIGHT,
      left: 0,
      top: yAt("00:00"),
      width: COLUMN_WIDTH,
    },
    2,
  );
  return place(
    container.querySelector("[data-event-id]")!,
    {
      height: HOUR_HEIGHT,
      left: 0,
      top: yAt("09:00"),
      width: COLUMN_WIDTH,
    },
    1,
  );
}

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useCalendarPointer", () => {
  test("drags without re-rendering the view and proposes through the latest callback", () => {
    const stale = vi.fn<Propose>();
    const latest = vi.fn<Propose>();
    const onRender = vi.fn();
    const view = (onPropose: Propose) => (
      <FixtureView columns={columns} events={snapshot} onPropose={onPropose} onRender={onRender} />
    );

    act(() => root.render(view(stale)));
    act(() => root.render(view(latest)));
    const event = layOut(container);
    const renders = onRender.mock.calls.length;

    pointer("pointerdown", event, 50, yAt("09:30"));
    for (const time of ["10:00", "10:30", "11:00", "11:30"])
      pointer("pointermove", event, 50, yAt(time));
    pointer("pointerup", event, 50, yAt("11:30"));

    expect(onRender).toHaveBeenCalledTimes(renders);
    expect(stale).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(latest.mock.calls[0]?.[0]).toMatchObject({ cause: "move", eventId: "a" });
  });

  test("removes the preview when the view unmounts mid-drag", () => {
    const onPropose = vi.fn<Propose>();
    act(() =>
      root.render(
        <FixtureView
          columns={columns}
          events={snapshot}
          onPropose={onPropose}
          onRender={() => {}}
        />,
      ),
    );
    const event = layOut(container);
    const region = container.firstElementChild!;

    pointer("pointerdown", event, 50, yAt("09:30"));
    pointer("pointermove", event, 50, yAt("12:00"));
    expect(region.querySelector("[data-calendar-ghost]")).not.toBeNull();

    act(() => root.render(<p />));
    expect(region.querySelector("[data-calendar-ghost]")).toBeNull();
    expect(region.hasAttribute("data-interaction")).toBe(false);
    expect(onPropose).not.toHaveBeenCalled();
  });
});

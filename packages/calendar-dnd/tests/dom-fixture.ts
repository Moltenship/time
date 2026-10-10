import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  timeGridColumns,
  type CalendarEvent,
} from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";

import { eventIdAttributes, resourceIdAttributes } from "../src/index";

/**
 * jsdom has no layout, hit testing, or PointerEvent. These helpers give fixture elements fixed
 * viewport rectangles and hit-test them topmost-first, like the browser does.
 */

export type TestEvent = CalendarEvent<null, string | number, string>;

interface Box {
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

const layers: Element[][] = [[], [], []];

export function place(element: HTMLElement, box: Box, layer: 0 | 1 | 2): HTMLElement {
  element.getBoundingClientRect = () =>
    ({
      ...box,
      bottom: box.top + box.height,
      right: box.left + box.width,
      x: box.left,
      y: box.top,
    }) as DOMRect;
  layers[layer]!.push(element);
  return element;
}

function contains(element: Element, x: number, y: number): boolean {
  const rect = element.getBoundingClientRect();
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

export function resetLayout(): void {
  for (const layer of layers) layer.length = 0;
  document.body.replaceChildren();
  document.elementsFromPoint = (x: number, y: number) =>
    layers.flatMap((layer) =>
      layer.filter((element) => element.isConnected && contains(element, x, y)),
    );
}

export function pointer(
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  target: EventTarget,
  x: number,
  y: number,
  { pointerType = "mouse" }: { readonly pointerType?: string } = {},
): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: 1 },
    pointerType: { value: pointerType },
  });
  target.dispatchEvent(event);
  return event;
}

function element(attributes: Readonly<Record<string, string | undefined>>): HTMLElement {
  const node = document.createElement("div");
  for (const [name, value] of Object.entries(attributes)) {
    if (value !== undefined) node.setAttribute(name, value);
  }
  return node;
}

export const timeZone = "UTC";

/** Time grid: an all-day row 40px tall above 100px-wide columns at 40px per hour. */
export const ALL_DAY_HEIGHT = 40;
export const HOUR_HEIGHT = 40;
export const COLUMN_WIDTH = 100;
export const gridDates = ["2026-08-17", "2026-08-18"] as const;

export function yAt(time: string): number {
  const { hour, minute } = Temporal.PlainTime.from(time);
  return ALL_DAY_HEIGHT + (hour + minute / 60) * HOUR_HEIGHT;
}

export function xAt(date: (typeof gridDates)[number]): number {
  return gridDates.indexOf(date) * COLUMN_WIDTH + COLUMN_WIDTH / 2;
}

export function timedEvent(
  id: string | number,
  start: string,
  end: string,
  title = String(id),
): TestEvent {
  return {
    data: null,
    end: Temporal.Instant.from(end),
    id,
    kind: "timed",
    start: Temporal.Instant.from(start),
    title,
  };
}

export function mountTimeGrid(events: readonly TestEvent[]) {
  resetLayout();
  const region = element({ "data-testid": "region" });
  document.body.append(region);

  gridDates.forEach((date, index) => {
    const left = index * COLUMN_WIDTH;
    region.append(
      place(
        element({ "data-all-day": "", "data-date": date }),
        {
          height: ALL_DAY_HEIGHT,
          left,
          top: 0,
          width: COLUMN_WIDTH,
        },
        2,
      ),
    );
    region.append(
      place(
        element({ "data-date": date }),
        {
          height: 24 * HOUR_HEIGHT,
          left,
          top: ALL_DAY_HEIGHT,
          width: COLUMN_WIDTH,
        },
        2,
      ),
    );
  });

  const elements = new Map<string | number, HTMLElement>();
  for (const event of events) {
    if (event.kind !== "timed") continue;
    const date = event.start.toZonedDateTimeISO(timeZone).toPlainDate().toString();
    const column = region.querySelector<HTMLElement>(`[data-date="${date}"]:not([data-all-day])`)!;
    const top = yAt(event.start.toZonedDateTimeISO(timeZone).toPlainTime().toString());
    const height = (event.start.until(event.end).total({ unit: "minutes" }) / 60) * HOUR_HEIGHT;
    const left = column.getBoundingClientRect().left;
    const node = place(
      element(eventIdAttributes(event.id)),
      {
        height,
        left,
        top,
        width: COLUMN_WIDTH,
      },
      1,
    );
    node.textContent = event.title;
    for (const edge of ["start", "end"] as const) {
      node.append(
        place(
          element({ "data-resize": edge }),
          {
            height: 4,
            left,
            top: edge === "start" ? top : top + height - 4,
            width: COLUMN_WIDTH,
          },
          0,
        ),
      );
    }
    column.append(node);
    elements.set(event.id, node);
  }

  const adapter = {
    ...createCanonicalEventAdapter<null, string | number, string>(),
    isReadOnly: (event: TestEvent) => event.title === "locked",
  };
  return {
    columns: timeGridColumns(
      plainDateInterval(
        Temporal.PlainDate.from(gridDates[0]),
        Temporal.PlainDate.from("2026-08-19"),
      ),
      timeZone,
    ),
    elements,
    region,
    snapshot: createEventSnapshot(events, adapter),
  };
}

/** Month grid: two week rows of 100×80 cells starting Sunday 2026-08-16. */
export const CELL_WIDTH = 100;
export const CELL_HEIGHT = 80;

export function cellCenter(date: string): { readonly x: number; readonly y: number } {
  const index = Temporal.PlainDate.from("2026-08-16").until(Temporal.PlainDate.from(date)).days;
  return {
    x: (index % 7) * CELL_WIDTH + CELL_WIDTH / 2,
    y: Math.floor(index / 7) * CELL_HEIGHT + CELL_HEIGHT / 2,
  };
}

export function mountMonth(events: readonly TestEvent[]) {
  resetLayout();
  const region = element({});
  document.body.append(region);

  for (let index = 0; index < 14; index += 1) {
    const date = Temporal.PlainDate.from("2026-08-16").add({ days: index }).toString();
    region.append(
      place(
        element({ "data-date": date }),
        {
          height: CELL_HEIGHT,
          left: (index % 7) * CELL_WIDTH,
          top: Math.floor(index / 7) * CELL_HEIGHT,
          width: CELL_WIDTH,
        },
        2,
      ),
    );
  }

  // Event segments sit in a row overlay rather than inside cells, as month views lay them out.
  const elements = new Map<string | number, HTMLElement>();
  for (const event of events) {
    const date =
      event.kind === "timed"
        ? event.start.toZonedDateTimeISO(timeZone).toPlainDate().toString()
        : event.start.toString();
    const { x, y } = cellCenter(date);
    const node = place(
      element(eventIdAttributes(event.id)),
      {
        height: 20,
        left: x - CELL_WIDTH / 2,
        top: y - 10,
        width: CELL_WIDTH,
      },
      1,
    );
    region.append(node);
    elements.set(event.id, node);
  }

  return {
    elements,
    region,
    snapshot: createEventSnapshot(
      events,
      createCanonicalEventAdapter<null, string | number, string>(),
    ),
  };
}

/** Resource columns: one date, a 100px-wide column per resource with its own all-day cell. */
export const resourceIds = ["room-a", "room-b"] as const;
export const resourceDate = gridDates[0];

export function xIn(resourceId: (typeof resourceIds)[number]): number {
  return resourceIds.indexOf(resourceId) * COLUMN_WIDTH + COLUMN_WIDTH / 2;
}

export function mountResourceColumns(events: readonly TestEvent[]) {
  resetLayout();
  const region = element({});
  document.body.append(region);

  const columns = new Map<string, HTMLElement>();
  resourceIds.forEach((resourceId, index) => {
    const left = index * COLUMN_WIDTH;
    const wrapper = element(resourceIdAttributes(resourceId));
    const width = COLUMN_WIDTH;
    const allDay = element({ "data-all-day": "", "data-date": resourceDate });
    const column = element({ "data-date": resourceDate });
    wrapper.append(
      place(allDay, { height: ALL_DAY_HEIGHT, left, top: 0, width }, 2),
      place(column, { height: 24 * HOUR_HEIGHT, left, top: ALL_DAY_HEIGHT, width }, 2),
    );
    region.append(wrapper);
    columns.set(resourceId, column);
  });

  // An event with several resources renders once in each of their columns.
  const elements = new Map<string, HTMLElement>();
  for (const event of events) {
    if (event.kind !== "timed") continue;
    for (const resourceId of event.resourceIds ?? []) {
      const column = columns.get(resourceId)!;
      const top = yAt(event.start.toZonedDateTimeISO(timeZone).toPlainTime().toString());
      const height = (event.start.until(event.end).total({ unit: "minutes" }) / 60) * HOUR_HEIGHT;
      const left = column.getBoundingClientRect().left;
      const node = place(
        element(eventIdAttributes(event.id)),
        { height, left, top, width: COLUMN_WIDTH },
        1,
      );
      node.textContent = event.title;
      column.append(node);
      elements.set(`${event.id}@${resourceId}`, node);
    }
  }

  return {
    columns: timeGridColumns(
      plainDateInterval(
        Temporal.PlainDate.from(resourceDate),
        Temporal.PlainDate.from(resourceDate).add({ days: 1 }),
      ),
      timeZone,
    ),
    elements,
    region,
    snapshot: createEventSnapshot(
      events,
      createCanonicalEventAdapter<null, string | number, string>(),
    ),
  };
}

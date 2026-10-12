import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
  type CalendarEventChange,
} from "@moltenship/calendar";
import { act } from "react";
import { describe, expect, test, vi } from "vite-plus/test";
import { server, userEvent } from "vite-plus/test/browser";

import { createWeekView } from "@registry/time-grid-view/time-grid-view";
import { TooltipProvider } from "@registry/ui/tooltip";

import { render } from "./render";

type Fixture = CalendarEvent<null, string>;
type Change = CalendarEventChange<Fixture, string, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [createWeekView<Fixture>()],
});

const review: Fixture = {
  data: null,
  end: Temporal.Instant.from("2026-10-08T11:00:00Z"),
  id: "review",
  kind: "timed",
  start: Temporal.Instant.from("2026-10-08T10:00:00Z"),
  title: "Review",
};

function Week({ onEventChange }: { readonly onEventChange: (change: Change) => void }) {
  return (
    <TooltipProvider>
      <Calendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="UTC"
        defaultView="week"
        events={[review]}
        locale="en-US"
        now={Temporal.Instant.from("2026-10-08T08:30:00Z")}
        onEventChange={onEventChange}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Calendar.Frame className="flex h-dvh flex-col">
          <Calendar.Viewport className="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </Calendar.Frame>
      </Calendar.Root>
    </TooltipProvider>
  );
}

const event = () =>
  document.querySelector<HTMLElement>('[data-slot="time-grid-body"] [data-event-id="review"]')!;

/** Where the first change puts the event. */
function placed(onEventChange: ReturnType<typeof vi.fn<(change: Change) => void>>) {
  const change = onEventChange.mock.calls[0]?.[0];
  const proposed = change?.proposed;
  return change === undefined || proposed == null
    ? undefined
    : `${change.cause} ${proposed.start.toString()}/${proposed.end.toString()}`;
}

/**
 * Presses at `from`'s middle and lets go `hours` lower, with the browser's own mouse. Positions
 * are relative to the event's column, which holds both points.
 */
async function drag(from: HTMLElement, hours: number) {
  const column = event().parentElement!;
  const area = column.getBoundingClientRect();
  const box = from.getBoundingClientRect();
  const hour = area.height / 24;
  const x = box.left - area.left + box.width / 2;
  const y = box.top - area.top + box.height / 2;
  await userEvent.dragAndDrop(column, column, {
    // The event moves with the mouse, so the drop point is checked as a point, not an element.
    force: true,
    sourcePosition: { x, y },
    targetPosition: { x, y: y + hours * hour },
  });
}

// Pointer and keyboard paths through real input: Chromium in `vp run a11y`, and Firefox and WebKit
// in `vp run browsers`.
describe(`interactions in ${server.browser}`, () => {
  test("the page runs on the Temporal it was given", () => {
    // `vp run browsers` gives WebKit temporal-polyfill in place of its own, as an app would for a
    // browser without Temporal; the others run on their own.
    const polyfilled = import.meta.env.MODE === "browsers" && server.browser === "webkit";
    const native = /\[native code\]/u.test(Function.prototype.toString.call(Temporal.Instant));

    expect(native).toBe(!polyfilled);
  });

  test("a mouse drag moves an event an hour later", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Week onEventChange={onEventChange} />);

    await drag(event(), 1);

    await vi.waitFor(() =>
      expect(placed(onEventChange)).toBe("move 2026-10-08T11:00:00Z/2026-10-08T12:00:00Z"),
    );
    expect(onEventChange).toHaveBeenCalledTimes(1);
  });

  test("a mouse drag on the end handle makes an event half an hour longer", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Week onEventChange={onEventChange} />);

    await drag(event().querySelector<HTMLElement>('[data-resize="end"]')!, 0.5);

    await vi.waitFor(() =>
      expect(placed(onEventChange)).toBe("resize-end 2026-10-08T10:00:00Z/2026-10-08T11:30:00Z"),
    );
  });

  test("Space, arrow keys and Enter move an event", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Week onEventChange={onEventChange} />);
    await act(async () => event().focus());

    await userEvent.keyboard(" ");
    // Four 15-minute steps down, then a day on.
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowRight}");
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(placed(onEventChange)).toBe("move 2026-10-09T11:00:00Z/2026-10-09T12:00:00Z"),
    );
  });

  test("Shift+Space, arrow keys and Enter make an event longer", async () => {
    const onEventChange = vi.fn<(change: Change) => void>();
    await render(<Week onEventChange={onEventChange} />);
    await act(async () => event().focus());

    await userEvent.keyboard("{Shift>} {/Shift}");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await userEvent.keyboard("{Enter}");

    await vi.waitFor(() =>
      expect(placed(onEventChange)).toBe("resize-end 2026-10-08T10:00:00Z/2026-10-08T11:30:00Z"),
    );
  });
});

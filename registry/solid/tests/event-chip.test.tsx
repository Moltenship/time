// @vitest-environment jsdom

import {
  defineCalendarView,
  plainDateInterval,
  type EventId,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar-solid";
import { createSignal, For } from "solid-js";
import { expect, test } from "vite-plus/test";

import { EventChip, useEventChip, type EventChipFocusOptions } from "../calendar/event-chip";
import { render, settled } from "./render";
import { anchorDate, clock, createTestCalendar, timed, type ColoredEvent } from "./view-fixtures";

type Options = Partial<Pick<EventChipFocusOptions<ColoredEvent>, "focusTarget" | "offscreen">>;

const [chipOptions, setChipOptions] = createSignal<Options>({});

function Chip(props: { readonly event: NormalizedCalendarEvent<unknown, EventId, ResourceId> }) {
  const chip = useEventChip(
    () => props.event,
    () => ({ date: anchorDate, labelEvent: (event) => String(event.id), ...chipOptions() }),
  );
  return <EventChip {...chip}>{String(props.event.id)}</EventChip>;
}

const Calendar = createTestCalendar(
  defineCalendarView({
    name: "chips",
    strategy: {
      getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 1 })),
      getTitle: () => "Chips",
      navigate: (anchor, delta) => anchor.add({ days: delta }),
      project: () => null,
    },
    Renderer: (props) => <For each={props.events.events}>{(event) => <Chip event={event} />}</For>,
  }),
);

test("a chip off screen or out of the focus targets leaves the roving tab stop, and takes it back", async () => {
  const { container } = await render(() => (
    <Calendar.Root
      clock={clock}
      defaultAnchorDate={anchorDate}
      defaultTimeZone="UTC"
      defaultView="chips"
      events={[timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z")]}
      locale="en-US"
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  ));
  const chip = () => container.querySelector("[data-event-id]");

  expect(chip()?.getAttribute("tabindex")).toBe("0");

  setChipOptions({ offscreen: true });
  await settled();
  expect(chip()?.getAttribute("tabindex")).toBe("-1");

  setChipOptions({ focusTarget: false });
  await settled();
  expect(chip()?.hasAttribute("tabindex")).toBe(false);

  setChipOptions({});
  await settled();
  expect(chip()?.getAttribute("tabindex")).toBe("0");
});

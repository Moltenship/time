// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  timeGridStrategy,
  type CalendarAnnotation,
  type CalendarAnnotationSource,
  type CalendarEvent,
  type TimeGridProjection,
} from "@moltenship/calendar-core";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useTimeGridAnnotations,
} from "@moltenship/calendar-react";

import { gateWeekRules } from "./harness/builders";
import { renderWithHarness, type ReactRootHarness } from "./harness/render-harness";
import "./setup";

type Meeting = CalendarEvent<null, string, string>;

const meetings: readonly Meeting[] = [
  {
    data: null,
    end: Temporal.Instant.from("2026-10-08T10:00:00Z"),
    id: "standup",
    kind: "timed",
    start: Temporal.Instant.from("2026-10-08T09:00:00Z"),
    title: "Standup",
  },
];

type Annotation = CalendarAnnotation<unknown, string>;

function annotation(id: string, sourceId: string, start: string, end: string): Annotation {
  return {
    end: Temporal.Instant.from(end),
    id,
    sourceId,
    start: Temporal.Instant.from(start),
    title: id,
  };
}

const music: CalendarAnnotationSource = {
  id: "music",
  label: "Music",
  mergeGap: Temporal.Duration.from({ minutes: 5 }),
};
const sleep: CalendarAnnotationSource = { id: "sleep", label: "Sleep" };

const annotations: readonly Annotation[] = [
  annotation("night", "sleep", "2026-10-07T23:00:00Z", "2026-10-08T07:00:00Z"),
  annotation("t1", "music", "2026-10-08T09:00:00Z", "2026-10-08T09:04:00Z"),
  annotation("t2", "music", "2026-10-08T09:05:00Z", "2026-10-08T09:09:00Z"),
];

const projections: TimeGridProjection<Meeting>[] = [];

function Rail({ projection }: { readonly projection: TimeGridProjection<Meeting> }) {
  projections.push(projection);
  const marks = useTimeGridAnnotations(projection.days.map(({ column }) => column));
  return (
    <ol data-rail>
      {marks.map((column, index) => (
        <li key={index}>
          {column.map((mark) => `${mark.source.label}:${mark.annotations.length}`).join(",")}
        </li>
      ))}
    </ol>
  );
}

const dayView = defineCalendarView({
  name: "day",
  strategy: timeGridStrategy<undefined, Meeting>({ count: 1, kind: "days" }),
  Renderer: ({ projection }) => <Rail projection={projection} />,
});

const Calendar = createCalendar<Meeting>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [dayView],
});

const harnesses: ReactRootHarness[] = [];

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.dispose();
  document.body.replaceChildren();
  projections.length = 0;
});

function root(props: Partial<React.ComponentProps<typeof Calendar.Root>> = {}) {
  return (
    <Calendar.Root
      annotationSources={[sleep, music]}
      annotations={annotations}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      events={meetings}
      locale="en-US"
      timeZone="UTC"
      weekRules={gateWeekRules}
      {...props}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}

async function render(props: Partial<React.ComponentProps<typeof Calendar.Root>> = {}) {
  const harness = await renderWithHarness(root(props));
  harnesses.push(harness);
  return harness;
}

function rail(container: ParentNode): string[] {
  return [...container.querySelectorAll("[data-rail] li")].map((item) => item.textContent ?? "");
}

test("a view lays out the root's annotations by source", async () => {
  const { container } = await render();

  // The two tracks merge into one listening mark; sleep from the night before shows first.
  expect(rail(container)).toEqual(["Sleep:1,Music:2"]);
});

test("leaving a source out of annotationSources hides its annotations", async () => {
  const { container } = await render({ annotationSources: [music] });

  expect(rail(container)).toEqual(["Music:2"]);
});

test("new annotations reuse the event projection", async () => {
  const harness = await render();
  const before = projections.at(-1);

  await harness.render(
    root({
      annotations: [
        ...annotations,
        annotation("t3", "music", "2026-10-08T18:00:00Z", "2026-10-08T18:30:00Z"),
      ],
    }),
  );

  expect(rail(harness.container)).toEqual(["Sleep:1,Music:2,Music:1"]);
  expect(projections.at(-1)).toBe(before);
});

test("invalid annotations are skipped and reported as diagnostics", async () => {
  const onDiagnosticsChange = vi.fn();
  const broken = { ...annotations[1]!, end: annotations[1]!.start, id: "empty" };
  const { container } = await render({
    annotations: [...annotations, broken],
    onDiagnosticsChange,
  });

  expect(rail(container)).toEqual(["Sleep:1,Music:2"]);
  expect(onDiagnosticsChange).toHaveBeenLastCalledWith([
    expect.objectContaining({
      code: "invalid-annotation",
      issue: expect.objectContaining({ code: "start-not-before-end", index: 3 }),
    }),
  ]);
});

test("a different invalid annotation at the same index reports again", async () => {
  const onDiagnosticsChange = vi.fn();
  const invalid = (id: string): Annotation => ({
    ...annotations[1]!,
    end: annotations[1]!.start,
    id,
  });
  const harness = await render({ annotations: [invalid("first")], onDiagnosticsChange });

  await harness.render(root({ annotations: [invalid("second")], onDiagnosticsChange }));

  expect(onDiagnosticsChange).toHaveBeenLastCalledWith([
    expect.objectContaining({
      issue: expect.objectContaining({ annotation: expect.objectContaining({ id: "second" }) }),
    }),
  ]);
});

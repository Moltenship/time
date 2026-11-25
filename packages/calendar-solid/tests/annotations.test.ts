// @vitest-environment jsdom

import {
  createCanonicalEventAdapter,
  timeGridStrategy,
  type CalendarAnnotation,
  type CalendarAnnotationSource,
  type CalendarEvent,
  type CalendarWeekRules,
  type TimeGridAnnotationMark,
  type TimeGridProjection,
} from "@moltenship/calendar-core";
import { createComponent, type JSX } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  useCalendarAnnotations,
  useTimeGridAnnotations,
  type CalendarViewRendererProps,
} from "../src";
import { keyedList } from "../src/flow";
import { element } from "../src/props";
import { mount, settled } from "./harness/render";
import "./setup";

type Meeting = CalendarEvent<null, string, string>;
type RootProps = Parameters<typeof Calendar.Root>[0];
type Annotation = CalendarAnnotation<unknown, string>;

const Ol = element("ol");
const Li = element("li");

const weekRules: CalendarWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] };
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
let sources: (() => readonly CalendarAnnotationSource[]) | undefined;

function Rail(props: { readonly projection: TimeGridProjection<Meeting> }): JSX.Element {
  const marks = useTimeGridAnnotations(() => {
    projections.push(props.projection);
    return props.projection.days.map(({ column }) => column);
  });
  const all = useCalendarAnnotations();
  sources = () => all().sources;
  return createComponent(Ol, {
    "data-rail": "",
    get children() {
      return keyedList(marks, (column: readonly TimeGridAnnotationMark[]) =>
        createComponent(Li, {
          get children() {
            return column
              .map((mark) => `${mark.source.label}:${mark.annotations.length}`)
              .join(",");
          },
        }),
      );
    },
  });
}

const dayView = defineCalendarView({
  name: "day",
  strategy: timeGridStrategy<undefined, Meeting>({ count: 1, kind: "days" }),
  Renderer: (props: CalendarViewRendererProps<TimeGridProjection<Meeting>, undefined>) =>
    createComponent(Rail, {
      get projection() {
        return props.projection;
      },
    }),
});

const Calendar = createCalendar<Meeting>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [dayView],
});

afterEach(() => {
  projections.length = 0;
});

async function render(initial: Partial<RootProps> = {}) {
  // In an object, so Solid's setter overloads don't read the props as an updater.
  const [current, setCurrent] = createSignal<{ readonly props: Partial<RootProps> }>({
    props: initial,
  });
  const props = () => current().props;
  const view = mount(() =>
    createComponent(Calendar.Root, {
      get annotationSources() {
        return props().annotationSources ?? [sleep, music];
      },
      get annotations() {
        return props().annotations ?? annotations;
      },
      defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
      events: meetings,
      locale: "en-US",
      get onDiagnosticsChange() {
        return props().onDiagnosticsChange;
      },
      timeZone: "UTC",
      weekRules,
      get children() {
        return createComponent(Calendar.ActiveView, {});
      },
    } as RootProps),
  );
  await settled();
  return {
    container: view.container,
    async update(next: Partial<RootProps>) {
      setCurrent({ props: { ...initial, ...next } as Partial<RootProps> });
      await settled();
    },
  };
}

function rail(container: ParentNode): string[] {
  return [...container.querySelectorAll("[data-rail] li")].map((item) => item.textContent ?? "");
}

test("a view lays out the root's annotations by source", async () => {
  const { container } = await render();

  // The two tracks merge into one listening mark; sleep from the night before shows first.
  expect(rail(container)).toEqual(["Sleep:1,Music:2"]);
  expect(sources!().map(({ id }) => id)).toEqual(["sleep", "music"]);
});

test("leaving a source out of annotationSources hides its annotations", async () => {
  const { container } = await render({ annotationSources: [music] });

  expect(rail(container)).toEqual(["Music:2"]);
});

test("new annotations reuse the event projection", async () => {
  const view = await render();
  const before = projections.at(-1);

  await view.update({
    annotations: [
      ...annotations,
      annotation("t3", "music", "2026-10-08T18:00:00Z", "2026-10-08T18:30:00Z"),
    ],
  });

  expect(rail(view.container)).toEqual(["Sleep:1,Music:2,Music:1"]);
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
  const view = await render({ annotations: [invalid("first")], onDiagnosticsChange });

  await view.update({ annotations: [invalid("second")], onDiagnosticsChange });

  expect(onDiagnosticsChange).toHaveBeenLastCalledWith([
    expect.objectContaining({
      issue: expect.objectContaining({ annotation: expect.objectContaining({ id: "second" }) }),
    }),
  ]);
});

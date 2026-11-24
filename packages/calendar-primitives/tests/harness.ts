import {
  defineEventAdapter,
  type CalendarViewStrategy,
  type CalendarWeekRules,
} from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";

import {
  createCalendarPrimitive,
  createCalendarRuntime,
  resolveCalendarStoreDefaults,
  type CalendarRuntimeInputs,
  type CalendarRuntimeModel,
  type CalendarStore,
  type CalendarViewDefinition,
} from "../src/index";

export interface Meeting {
  readonly end: Temporal.Instant;
  readonly id: string;
  readonly start: Temporal.Instant;
  readonly title: string;
}

export const adapter = defineEventAdapter<Meeting>()({
  getId: (event) => event.id,
  getInterval: (event) => ({ end: event.end, kind: "timed", start: event.start }),
  getResourceIds: () => [],
  getTitle: (event) => event.title,
});

interface DayRangeOptions {
  readonly days: number;
  readonly label: string;
}

const dayRange: CalendarViewStrategy<null, DayRangeOptions> = {
  getRange: (anchor, _environment, options) =>
    plainDateInterval(anchor, anchor.add({ days: options.days })),
  getTitle: (range, _environment, options) => `${options.label} ${range.start.toString()}`,
  navigate: (anchor, delta, options) => anchor.add({ days: delta * options.days }),
  project: () => null,
};

function dayRangeView<const TName extends string>(
  name: TName,
  days: number,
  label: string,
): CalendarViewDefinition<TName, null, DayRangeOptions, unknown> {
  return Object.freeze({ defaultOptions: { days, label }, name, strategy: dayRange });
}

export const views = [dayRangeView("week", 7, "Week"), dayRangeView("agenda", 1, "Agenda")];
export type View = (typeof views)[number];
export const calendar = createCalendarPrimitive<View, unknown, unknown, string>({ views });

export const review: Meeting = {
  end: Temporal.Instant.from("2026-08-15T10:00:00Z"),
  id: "meeting-1",
  start: Temporal.Instant.from("2026-08-15T09:00:00Z"),
  title: "Architecture review",
};

const defaultNow = Temporal.Instant.from("2026-08-14T08:00:00Z");

export const weekRules: CalendarWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] };

type Inputs = CalendarRuntimeInputs<Meeting, unknown, View, unknown, unknown, string, string>;
type Model = CalendarRuntimeModel<Meeting, unknown, View, unknown, unknown, string, string>;

/** A root's props, as an adapter receives them: everything the runtime doesn't subscribe to. */
export type HostProps = Partial<
  Omit<Inputs, "connection" | "instant" | "overlay" | "state"> & {
    readonly anchorDate: Temporal.PlainDate;
    readonly defaultAnchorDate: Temporal.PlainDate;
    readonly defaultTimeZone: string;
    readonly defaultView: View["name"];
    readonly store: CalendarStore<View["name"], unknown, unknown, string>;
    readonly timeZone: string;
    readonly view: View["name"];
  }
>;

/**
 * The smallest adapter a framework needs, without one: it renders on every store or overlay
 * change, and runs the runtime's effects in the order a renderer runs them. It is the recipe a
 * React or Solid adapter follows, with `render` as its render function.
 */
export function host(initial: HostProps = {}) {
  const runtime = createCalendarRuntime<Meeting, unknown, View, unknown, unknown, string, string>({
    eventAdapter: adapter,
    views,
  });
  let props: HostProps = initial;
  let detach: (() => void) | undefined;
  let attachedBinding: unknown;
  let unsubscribe: (() => void) | undefined;
  let subscribed: unknown;
  let renders = 0;
  let model: Model;

  function render(): Model {
    renders += 1;
    const {
      anchorDate,
      defaultAnchorDate = Temporal.PlainDate.from("2026-08-15"),
      defaultTimeZone = "UTC",
      defaultView = "week",
      store,
      timeZone,
      view,
      ...rest
    } = props;
    const controlled = {
      anchorDate,
      expandedResourceIds: undefined,
      focus: undefined,
      selection: undefined,
      timeZone,
      view,
    };
    // 1. Render: connect and derive, both pure and memoized.
    const connection = runtime.connect({
      controlled,
      defaults: () =>
        resolveCalendarStoreDefaults(
          { anchorDate, defaultAnchorDate, defaultTimeZone, defaultView, timeZone, view },
          views,
        ),
      store,
    });
    const inputs: Inputs = {
      events: [review],
      handlers: {},
      locale: "en-GB",
      now: defaultNow,
      weekRules,
      ...rest,
      connection,
      // A clock's sample, as an adapter's ticker gives it; a fixed `now` stands for it here.
      instant: rest.now ?? defaultNow,
      overlay: runtime.overlay.getSnapshot(),
      state: connection.source.getSnapshot(),
    };
    model = runtime.derive(inputs);
    // 2. Commit, before anything can run a command; attach once per binding.
    runtime.commit(model, inputs);
    if (attachedBinding !== connection.binding) {
      detach?.();
      detach = connection.binding.attach();
      attachedBinding = connection.binding;
    }
    // 3. Before paint, then 4. after it.
    runtime.reconcile(model.eventSnapshot);
    runtime.reportDiagnostics(model.diagnostics);
    runtime.reportVisibleRange(model.visibleRange);
    // A renderer subscribes where it reads, again when the source changes identity.
    if (subscribed !== connection.source) {
      unsubscribe?.();
      subscribed = connection.source;
      const offSource = connection.source.subscribe(update);
      const offOverlay = runtime.overlay.subscribe(update);
      unsubscribe = () => {
        offSource();
        offOverlay();
      };
    }
    return model;
  }

  // An update during a render renders again after it, as a framework batches it.
  let rendering = false;
  let dirty = false;
  function update() {
    if (rendering) {
      dirty = true;
      return;
    }
    rendering = true;
    try {
      do {
        dirty = false;
        render();
      } while (dirty);
    } finally {
      rendering = false;
    }
  }

  update();
  return {
    get model() {
      return model;
    },
    get renders() {
      return renders;
    },
    rerender(patch: HostProps) {
      props = { ...props, ...patch };
      update();
      return model;
    },
    runtime,
    dispose() {
      unsubscribe?.();
      detach?.();
    },
  };
}

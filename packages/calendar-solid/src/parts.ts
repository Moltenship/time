import { createComponent, isServer, type JSX } from "@solidjs/web";
import { usePart, type PartProps } from "@ui-sdk/solid/primitive";
import { createMemo, merge, omit, onCleanup, onSettled, untrack } from "solid-js";

import type { EventId, ResourceId } from "@moltenship/calendar-core";
import {
  createCalendarViewRuntime,
  type CalendarActiveView,
} from "@moltenship/calendar-primitives";

import { keyedList, when } from "./flow";
import { element } from "./props";
import type { CalendarRootValue } from "./root";
import type { RootContext } from "./root-context";
import { syncRovingFocus } from "./roving-focus";
import { viewRuntimeContext } from "./shared";
import type {
  CalendarActiveViewProps,
  CalendarEventProps,
  CalendarEventRenderValue,
  CalendarFrameProps,
  CalendarTitleProps,
  CalendarToolbarProps,
  CalendarTriggerProps,
  CalendarViewSwitcherProps,
  CalendarViewportProps,
} from "./types";
import type { AnyCalendarView } from "./views";

/** Calls an element handler as Solid would: a function, or a bound `[handler, data]` pair. */
function callHandler(handler: unknown, event: Event): void {
  if (typeof handler === "function") handler(event);
  else if (Array.isArray(handler) && typeof handler[0] === "function")
    handler[0](handler[1], event);
}

/** Solid's refs are callbacks once compiled, or arrays of them. */
function applyRef(ref: unknown, node: HTMLElement): void {
  if (typeof ref === "function") ref(node);
  else if (Array.isArray(ref)) for (const each of ref) applyRef(each, node);
}

/**
 * The part's element goes to `meta.refs` and to the application's own `ref`. Read once, as Solid
 * reads a `ref`: it binds the element as it is created.
 */
function recordRef(
  record: (node: HTMLElement) => () => void,
  user: unknown,
): (node: HTMLElement) => void {
  let release: (() => void) | undefined;
  // The server binds no element, and its render is pure: a write as it disposes would warn.
  if (!isServer) onCleanup(() => release?.());
  return (node) => {
    release?.();
    release = record(node);
    applyRef(user, node);
  };
}

// ui-sdk's part props type the element's own props loosely; ours are Solid's JSX props.
const asPartProps = <Tag extends keyof JSX.IntrinsicElements>(props: object) =>
  props as PartProps<Tag>;

/** Builds the compound parts that read one factory's root. */
export function createCalendarParts(root: RootContext<CalendarRootValue>) {
  function Frame(props: CalendarFrameProps): JSX.Element {
    const { handle, meta, setRef } = root.use();
    const rest = omit(props, "children", "ref");
    // A name of its own outlasts navigation; the title names the visible dates.
    const name = {
      get "aria-label"() {
        return meta().label;
      },
      get "aria-labelledby"() {
        return meta().label === undefined ? meta().ids.title : undefined;
      },
    };
    const own = {
      get children() {
        return props.children;
      },
      get "data-calendar-instance"() {
        return meta().instanceId;
      },
      "data-calendar-part": "frame",
      get id() {
        return meta().ids.frame;
      },
      ref: recordRef(
        setRef.frame,
        untrack(() => props.ref),
      ),
    };
    // The frame is the primitive's root slot, so an agent finds the calendar here, by that name.
    return usePart(
      handle,
      "root",
      undefined,
      asPartProps<"section">(merge(name, rest, own)),
      "section",
    );
  }

  function Toolbar(props: CalendarToolbarProps): JSX.Element {
    const { handle, setRef } = root.use();
    const own = {
      get children() {
        return props.children;
      },
      "data-calendar-part": "toolbar",
      ref: recordRef(
        setRef.toolbar,
        untrack(() => props.ref),
      ),
    };
    const rest = omit(props, "children", "ref");
    return usePart(handle, "toolbar", undefined, asPartProps<"header">(merge(rest, own)), "header");
  }

  function Viewport(props: CalendarViewportProps): JSX.Element {
    const { handle, meta, setRef } = root.use();
    const own = {
      get children() {
        return props.children;
      },
      "data-calendar-part": "viewport",
      get id() {
        return meta().ids.viewport;
      },
      ref: recordRef(
        setRef.viewport,
        untrack(() => props.ref),
      ),
    };
    const rest = omit(props, "children", "ref");
    return usePart(handle, "viewport", undefined, asPartProps<"div">(merge(rest, own)), "div");
  }

  function Title(props: CalendarTitleProps): JSX.Element {
    const { handle, meta, setRef, view } = root.use();
    const title = createMemo(() => {
      const active = view();
      return (
        active?.definition.strategy.getTitle(active.range, active.environment, active.options) ?? ""
      );
    });
    const own = {
      get children() {
        return props.children ?? title();
      },
      "data-calendar-part": "title",
      get id() {
        return meta().ids.title;
      },
      ref: recordRef(
        setRef.title,
        untrack(() => props.ref),
      ),
    };
    const rest = omit(props, "children", "ref");
    return usePart(handle, "title", undefined, asPartProps<"span">(merge(rest, own)), "span");
  }

  function createTrigger(
    part: "previous-trigger" | "next-trigger" | "today-trigger",
    requiresView: boolean,
  ) {
    return function Trigger(props: CalendarTriggerProps): JSX.Element {
      const { handle, meta } = root.use();
      // The slot's press runs the command after the element's own `onClick`, unless that one
      // calls `preventDefault()`.
      const own = {
        get "aria-controls"() {
          return props["aria-controls"] ?? meta().ids.viewport;
        },
        get children() {
          return props.children;
        },
        "data-calendar-part": part,
        get disabled() {
          return props.disabled ?? (requiresView && meta().activeView === undefined);
        },
        get type() {
          return props.type ?? "button";
        },
      };
      const rest = omit(props, "aria-controls", "children", "disabled", "type");
      return usePart(handle, part, undefined, asPartProps<"button">(merge(rest, own)), "button");
    };
  }

  const PreviousTrigger = createTrigger("previous-trigger", true);
  const NextTrigger = createTrigger("next-trigger", true);
  const TodayTrigger = createTrigger("today-trigger", false);

  const Option = element("option");

  function ViewSwitcher(props: CalendarViewSwitcherProps): JSX.Element {
    const { handle, meta, state } = root.use();
    const view = createMemo(() => state().view);
    const own = {
      get children() {
        // Solid's server marks the option that matches the select's `value` as `selected`, so
        // the HTML shows the view on screen before any script runs.
        return keyedList(
          () => meta().views,
          (definition) =>
            createComponent(Option, {
              get children() {
                return props.getViewLabel(definition.name);
              },
              value: definition.name,
            }),
        );
      },
      "data-calendar-part": "view-switcher",
      // The element's own handler runs first and may call `preventDefault()`; a value no
      // registered view has changes nothing.
      onChange(event: Event & { readonly currentTarget: HTMLSelectElement }) {
        const select = event.currentTarget;
        // A `change` event can't be canceled, so `preventDefault()` leaves `defaultPrevented`
        // false. The switcher notes the call itself, as React's synthetic event does, so the
        // opt-out works the same in both adapters.
        let prevented = event.defaultPrevented;
        const preventDefault = event.preventDefault.bind(event);
        Object.defineProperty(event, "preventDefault", {
          configurable: true,
          value() {
            prevented = true;
            preventDefault();
          },
        });
        callHandler(props.onChange, event);
        if (!prevented) {
          handle.api.selectView(select.value, { event, reason: "input-change" });
        }
        // Solid writes `value` only when the view changes. When it doesn't, as when a handler
        // cancels or a controlled owner keeps its view, the element would show the choice that
        // didn't happen, so it goes back to the view once the change has settled.
        onSettled(() => {
          const shown = untrack(view);
          if (select.value !== shown) select.value = shown;
        });
      },
      get value() {
        return view();
      },
    };
    const rest = omit(props, "getViewLabel", "onChange");
    return usePart(
      handle,
      "view-switcher",
      undefined,
      asPartProps<"select">(merge(rest, own)),
      "select",
    );
  }

  function ActiveView(props: CalendarActiveViewProps): JSX.Element {
    const { actions, model, source, view } = root.use();
    const definition = createMemo(() => view()?.definition);
    // One focus plumbing for as long as the part renders, whichever view it shows, as React's.
    // Starting from the view's entry gives server markup its tab stop.
    const runtime = createCalendarViewRuntime(() => untrack(view));
    syncRovingFocus(runtime.roving, source, view);

    function render(own: AnyCalendarView): JSX.Element {
      // While the switch to another view settles, this renderer keeps the last projection of its
      // own view: a projection of the next view has another shape.
      const active = createMemo<CalendarActiveView<AnyCalendarView>>((previous) => {
        const next = view();
        return next !== null && next.definition === own ? next : previous!;
      });
      return createComponent(own.Renderer, {
        actions,
        get environment() {
          return active().environment;
        },
        get events() {
          return active().events;
        },
        get isReadOnly() {
          return model().isReadOnly;
        },
        get loadRange() {
          return active().loadRange;
        },
        get options() {
          return active().options;
        },
        get projection() {
          return active().projection;
        },
        get range() {
          return active().range;
        },
      });
    }

    // Keyed by the definition: a switch of views renders the other renderer from scratch.
    return viewRuntimeContext.provide(runtime, () =>
      keyedList(
        () => {
          const current = definition();
          return current === undefined ? [] : [current];
        },
        render,
        () => props.fallback,
      ),
    );
  }

  function EventPart(props: CalendarEventProps<unknown, EventId, ResourceId>): JSX.Element {
    const { meta } = root.use();
    const value = createMemo(
      (): CalendarEventRenderValue<unknown, EventId, ResourceId> | undefined => {
        const normalized = meta().eventSnapshot.get(props.eventId);
        return normalized === undefined ? undefined : { event: normalized.event, normalized };
      },
      // The same render value while the event is the same normalized record.
      { equals: (left, right) => left?.normalized === right?.normalized },
    );
    return when(
      value,
      (current) => untrack(() => props.children(current)),
      () => props.fallback,
    );
  }

  return Object.freeze({
    ActiveView,
    EventPart,
    Frame,
    NextTrigger,
    PreviousTrigger,
    Title,
    TodayTrigger,
    Toolbar,
    ViewSwitcher,
    Viewport,
  });
}

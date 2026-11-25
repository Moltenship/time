import { useRovingFocus, type PlainDateInterval } from "@moltenship/calendar-solid";
import { createUniqueId, Show } from "solid-js";

import { CalendarX2Icon, LoaderCircleIcon } from "@registry/calendar/icons";
import {
  agendaEndLabel,
  agendaEndLoadingLabel,
  emptyAgendaCopy,
  type AgendaFormats,
} from "@registry/shared/list-view/agenda-labels";
import {
  agendaEndClass,
  agendaEndLoadingClass,
  agendaEndSpinnerClass,
  agendaSpinnerClass,
  emptyAgendaClass,
  emptyAgendaDetailClass,
  emptyAgendaIconClass,
  emptyAgendaSpinnerClass,
  emptyAgendaTextClass,
  emptyAgendaTitleClass,
} from "@registry/shared/list-view/agenda.styles";

/** A spinner that stays still when the system asks for reduced motion. */
function Spinner(props: { readonly class: string }) {
  return <LoaderCircleIcon aria-hidden="true" class={agendaSpinnerClass(props.class)} />;
}

/**
 * The weeks from the anchor date without events, or still loading, in place of the list. Still
 * the agenda's one tab stop: Up and Page Up from it page back, and Down and Page Down page on, so
 * keyboard paging can cross empty weeks.
 */
export function EmptyAgenda(props: {
  /** The weeks from the anchor date, as text. */
  readonly dates: string;
  readonly loading: boolean;
  /** The anchor date, which the empty state stands in for. */
  readonly start: Temporal.PlainDate;
}) {
  const roving = useRovingFocus(() => ({ date: props.start, kind: "day" }));
  const id = createUniqueId();
  const copy = () => emptyAgendaCopy(props.loading, props.dates);
  // Native, so it runs before the view's keyboard, which listens around it.
  const noSpace = (element: HTMLElement) => {
    element.addEventListener("keydown", (event) => {
      // Only for paging: the agenda has no cells, so Space must not start an event here.
      if (event.key === " ") event.preventDefault();
    });
  };

  return (
    <div
      role="group"
      aria-busy={props.loading ? "true" : undefined}
      aria-labelledby={id}
      onFocus={roving.onFocus}
      ref={[roving.ref, noSpace]}
      tabindex={roving.tabindex}
      class={emptyAgendaClass}
    >
      <Show
        when={props.loading}
        fallback={<CalendarX2Icon aria-hidden="true" class={emptyAgendaIconClass} />}
      >
        <Spinner class={emptyAgendaSpinnerClass} />
      </Show>
      <div id={id} class={emptyAgendaTextClass}>
        <p class={emptyAgendaTitleClass}>{copy().title}</p>
        <p class={emptyAgendaDetailClass}>{copy().detail}</p>
      </div>
    </div>
  );
}

/**
 * What the end of a scrolling agenda says, after the last loaded day: that events are loading, or
 * that nothing more is scheduled through the last loaded date.
 */
export function AgendaEndMessage(props: {
  /** The loaded dates after the last day; `null` when the last day is the last date loaded. */
  readonly empty: PlainDateInterval | null;
  readonly formats: AgendaFormats;
  readonly loading: boolean;
}) {
  return (
    <p class={agendaEndClass}>
      <Show
        when={props.loading}
        fallback={props.empty === null ? null : agendaEndLabel(props.formats, props.empty)}
      >
        <span class={agendaEndLoadingClass}>
          <Spinner class={agendaEndSpinnerClass} />
          {agendaEndLoadingLabel}
        </span>
      </Show>
    </p>
  );
}

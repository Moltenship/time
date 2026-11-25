"use client";

import { useRovingFocus, type PlainDateInterval } from "@moltenship/calendar";
import { CalendarX2Icon, LoaderCircleIcon } from "lucide-react";
import { useId } from "react";

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
function Spinner({ className }: { readonly className: string }) {
  return <LoaderCircleIcon aria-hidden className={agendaSpinnerClass(className)} />;
}

/**
 * The weeks from the anchor date without events, or still loading, in place of the list. Still
 * the agenda's one tab stop: Up and Page Up from it page back, and Down and Page Down page on, so
 * keyboard paging can cross empty weeks.
 */
export function EmptyAgenda({
  dates,
  loading,
  start,
}: {
  /** The weeks from the anchor date, as text. */
  readonly dates: string;
  readonly loading: boolean;
  /** The anchor date, which the empty state stands in for. */
  readonly start: Temporal.PlainDate;
}) {
  const roving = useRovingFocus({ date: start, kind: "day" });
  const id = useId();
  const copy = emptyAgendaCopy(loading, dates);

  return (
    <div
      role="group"
      aria-busy={loading || undefined}
      aria-labelledby={id}
      {...roving}
      onKeyDown={(event) => {
        // Only for paging: the agenda has no cells, so Space must not start an event here.
        if (event.key === " ") event.preventDefault();
      }}
      className={emptyAgendaClass}
    >
      {loading ? (
        <Spinner className={emptyAgendaSpinnerClass} />
      ) : (
        <CalendarX2Icon aria-hidden className={emptyAgendaIconClass} />
      )}
      <div id={id} className={emptyAgendaTextClass}>
        <p className={emptyAgendaTitleClass}>{copy.title}</p>
        <p className={emptyAgendaDetailClass}>{copy.detail}</p>
      </div>
    </div>
  );
}

/**
 * What the end of a scrolling agenda says, after the last loaded day: that events are loading, or
 * that nothing more is scheduled through the last loaded date.
 */
export function AgendaEndMessage({
  empty,
  formats,
  loading,
}: {
  /** The loaded dates after the last day; `null` when the last day is the last date loaded. */
  readonly empty: PlainDateInterval | null;
  readonly formats: AgendaFormats;
  readonly loading: boolean;
}) {
  return (
    <p className={agendaEndClass}>
      {loading ? (
        <span className={agendaEndLoadingClass}>
          <Spinner className={agendaEndSpinnerClass} />
          {agendaEndLoadingLabel}
        </span>
      ) : empty === null ? null : (
        agendaEndLabel(formats, empty)
      )}
    </p>
  );
}

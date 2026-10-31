"use client";

import { useRovingFocus, type PlainDateInterval } from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { CalendarX2Icon, LoaderCircleIcon } from "lucide-react";
import { useId } from "react";

import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

import type { AgendaFormats } from "./agenda-day";

const spin = stylex.keyframes({ to: { transform: "rotate(360deg)" } });

const styles = stylex.create({
  emptyIcon: {
    color: `color-mix(in oklch, ${calendarVars["--muted-foreground"]} 60%, transparent)`,
    height: "2.5rem",
    marginBottom: "0.25rem",
    width: "2.5rem",
  },
  emptyLabel: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  emptyMessage: {
    color: calendarVars["--muted-foreground"],
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginBlock: 0,
  },
  emptyState: {
    alignItems: "center",
    borderRadius: "var(--radius)",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineOffset: { default: null, ":focus-visible": 1 },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    padding: "1rem",
  },
  emptyTitle: {
    fontWeight: 500,
    marginBlock: 0,
  },
  endLoading: {
    alignItems: "center",
    display: "inline-flex",
    gap: "0.5rem",
  },
  endMessage: {
    color: calendarVars["--muted-foreground"],
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
    marginBlock: 0,
    paddingBlock: "1rem",
    paddingInline: { default: "0.75rem", "@media (min-width: 640px)": "1.5rem" },
    textAlign: "center",
  },
  spinner: {
    animationDuration: "1s",
    animationIterationCount: "infinite",
    animationName: { default: null, "@media (prefers-reduced-motion: no-preference)": spin },
    animationTimingFunction: "linear",
    color: calendarVars["--muted-foreground"],
  },
  spinnerEmpty: {
    height: "2.5rem",
    marginBottom: "0.25rem",
    width: "2.5rem",
  },
  spinnerEnd: {
    height: "1rem",
    width: "1rem",
  },
});

/** A spinner that stays still when the system asks for reduced motion. */
function Spinner({ className, xstyle }: { readonly className?: string; readonly xstyle?: XStyle }) {
  return <LoaderCircleIcon aria-hidden {...xprops({ className }, styles.spinner, xstyle)} />;
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
      {...stylex.props(styles.emptyState)}
    >
      {loading ? (
        <Spinner xstyle={styles.spinnerEmpty} />
      ) : (
        <CalendarX2Icon aria-hidden {...stylex.props(styles.emptyIcon)} />
      )}
      <div id={id} {...stylex.props(styles.emptyLabel)}>
        <p {...stylex.props(styles.emptyTitle)}>{loading ? "Loading events" : "No events"}</p>
        <p {...stylex.props(styles.emptyMessage)}>
          {loading
            ? `Fetching what's scheduled for ${dates}.`
            : `Nothing is scheduled for ${dates}.`}
        </p>
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
    <p {...stylex.props(styles.endMessage)}>
      {loading ? (
        <span {...stylex.props(styles.endLoading)}>
          <Spinner xstyle={styles.spinnerEnd} />
          Loading events…
        </span>
      ) : empty === null ? null : (
        `Nothing more is scheduled through ${formats.date.format(empty.end.subtract({ days: 1 }))}.`
      )}
    </p>
  );
}

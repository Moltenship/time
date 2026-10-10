import type { CalendarAnnotation } from "@moltenship/calendar";
import type { ReactNode } from "react";

import type { TimeGridAnnotationSource } from "@registry/time-grid-view/time-grid-annotations";

/** A Lucide-style 24px icon, drawn inside annotation marks. */
function Icon({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}

function MoonIcon({ className }: { readonly className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </Icon>
  );
}

function MusicIcon({ className }: { readonly className?: string }) {
  return (
    <Icon className={className}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </Icon>
  );
}

function ActivityIcon({ className }: { readonly className?: string }) {
  return (
    <Icon className={className}>
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2" />
    </Icon>
  );
}

export const previewAnnotationSources: readonly TimeGridAnnotationSource[] = [
  {
    color: "purple",
    Icon: MoonIcon,
    id: "sleep",
    label: "Sleep",
  },
  {
    color: "green",
    Icon: MusicIcon,
    id: "music",
    label: "Music",
    mergeGap: Temporal.Duration.from({ minutes: 5 }),
  },
  {
    color: "orange",
    Icon: ActivityIcon,
    id: "workouts",
    label: "Workouts",
  },
];

const tracks = [
  "Nightcall · Kavinsky",
  "Genesis · Justice",
  "Intro · The xx",
  "Dreams · Fleetwood Mac",
  "Holocene · Bon Iver",
];

/**
 * A week of sleep, listening sessions made of individual tracks, and workouts around `now`, up to
 * `now`: annotations record what happened.
 */
export function createPreviewAnnotations(
  now: Temporal.ZonedDateTime,
): readonly CalendarAnnotation[] {
  const { timeZoneId: timeZone } = now;
  const today = now.toPlainDate();
  const annotations: CalendarAnnotation[] = [];
  const at = (date: Temporal.PlainDate, minutes: number) =>
    date
      .toZonedDateTime(timeZone)
      .add({ seconds: Math.round(minutes * 60) })
      .toInstant();
  const add = (sourceId: string, start: Temporal.Instant, end: Temporal.Instant, title: string) => {
    if (Temporal.Instant.compare(start, now.toInstant()) >= 0) return;
    const until = Temporal.Instant.compare(end, now.toInstant()) > 0 ? now.toInstant() : end;
    annotations.push({
      end: until,
      id: `${sourceId}-${annotations.length}`,
      sourceId,
      start,
      title,
    });
  };

  for (let offset = -7; offset <= 0; offset++) {
    const date = today.add({ days: offset });
    const shift = (date.day * 7) % 40;
    add("sleep", at(date, -45 + shift), at(date, 410 + shift), "Sleep");
    for (const [from, length] of [
      [480 + shift, 40],
      [900 - shift, 75],
      [1260, 35],
    ] as const) {
      for (let minute = from, index = 0; minute < from + length; minute += 4, index++) {
        add(
          "music",
          at(date, minute),
          at(date, minute + 3.5),
          tracks[(date.day + index) % tracks.length]!,
        );
      }
    }
    if (date.dayOfWeek % 2 === 1) {
      add("workouts", at(date, 1110 + shift), at(date, 1155 + shift), "Evening run · 5.2 km");
    }
  }
  return annotations;
}

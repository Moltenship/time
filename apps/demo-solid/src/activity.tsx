import type { CalendarAnnotation, CalendarAvailability } from "@moltenship/calendar-solid";

import type { TimeGridAnnotationSource } from "@registry/time-grid-view/time-grid-annotations";

function MoonIcon(props: { readonly class?: string }) {
  return (
    <svg class={props.class} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function MusicIcon(props: { readonly class?: string }) {
  return (
    <svg class={props.class} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

/** What the demo pretends to sync: sleep, and what you listened to. */
export const activitySources: readonly TimeGridAnnotationSource[] = [
  { color: "purple", Icon: MoonIcon, id: "sleep", label: "Sleep" },
  {
    color: "green",
    Icon: MusicIcon,
    id: "music",
    label: "Music",
    // Tracks less than five minutes apart draw as one listening session.
    mergeGap: Temporal.Duration.from({ minutes: 5 }),
  },
];

const tracks = [
  "Digital Love · Daft Punk",
  "Midnight City · M83",
  "Genesis · Justice",
  "Nightcall · Kavinsky",
  "Teardrop · Massive Attack",
  "Intro · The xx",
] as const;

/**
 * Two weeks of nights and listening around `today`, on `timeZone`'s clock: sleep from about 23:30
 * to 7:00, a morning session of a few tracks, and a track or two in the evening.
 */
export function activityAround(
  today: Temporal.PlainDate,
  timeZone: string,
): readonly CalendarAnnotation[] {
  const at = (date: Temporal.PlainDate, time: string) =>
    date.toZonedDateTime({ plainTime: Temporal.PlainTime.from(time), timeZone }).toInstant();
  const annotations: CalendarAnnotation[] = [];
  for (let offset = -7; offset <= 7; offset += 1) {
    const date = today.add({ days: offset });
    const night = date.subtract({ days: 1 });
    const late = offset % 3 === 0;
    annotations.push({
      end: at(date, late ? "07:30" : "06:50"),
      id: `sleep-${date.toString()}`,
      sourceId: "sleep",
      start: at(night, late ? "23:55" : "23:20"),
      title: "Sleep",
    });
    // A morning session, four minutes a track.
    const count = 3 + (Math.abs(offset) % 3);
    for (let track = 0; track < count; track += 1) {
      const start = at(date, "08:05").add({ minutes: track * 4 });
      annotations.push({
        end: start.add({ minutes: 4 }),
        id: `music-${date.toString()}-am-${track}`,
        sourceId: "music",
        start,
        title: tracks[(track + Math.abs(offset)) % tracks.length]!,
      });
    }
    const evening = at(date, offset % 2 === 0 ? "19:10" : "21:40");
    annotations.push({
      end: evening.add({ minutes: 3 }),
      id: `music-${date.toString()}-pm`,
      sourceId: "music",
      start: evening,
      title: tracks[Math.abs(offset) % tracks.length]!,
    });
  }
  return annotations;
}

const time = (value: string) => Temporal.PlainTime.from(value);

/** Weekdays 9 to 6; the week and day shade the rest. */
export const officeHours: CalendarAvailability = {
  weekly: [{ days: [1, 2, 3, 4, 5], end: time("18:00"), start: time("09:00") }],
};

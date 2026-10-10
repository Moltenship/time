/**
 * PROTOTYPE for #119: seeded, realistic annotation data around today, standing in for what an app
 * would fetch from Spotify, Apple Health, a focus timer and WakaTime.
 */
import { ActivityIcon, CodeXmlIcon, MoonIcon, MusicIcon, TargetIcon } from "lucide-react";

import type {
  TimeGridAnnotation,
  TimeGridAnnotationSource,
} from "@registry/time-grid-view/time-grid-annotations";

export const annotationSources = [
  {
    app: "Oura",
    color: "purple",
    Icon: MoonIcon,
    id: "sleep",
    label: "Sleep",
    // A starry texture from styles.css, through the source's own mark classes.
    markClassName: "annotation-sleep",
    mergeGapMinutes: 20,
  },
  {
    app: "Spotify",
    color: "green",
    Icon: MusicIcon,
    id: "spotify",
    label: "Spotify",
    mergeGapMinutes: 5,
  },
  { app: "Apple Health", color: "orange", Icon: ActivityIcon, id: "workout", label: "Workout" },
  { app: "Focus timer", color: "teal", Icon: TargetIcon, id: "focus", label: "Focus" },
  {
    app: "WakaTime",
    color: "yellow",
    Icon: CodeXmlIcon,
    id: "coding",
    label: "Coding",
    mergeGapMinutes: 15,
  },
] as const satisfies readonly TimeGridAnnotationSource[];

/** The default rail, the three other looks as custom renderers, or nothing. */
export const annotationVariants = [
  { label: "Rail (default)", value: "rail" },
  { label: "Custom: edge bars", value: "edge" },
  { label: "Custom: background band", value: "band" },
  { label: "Custom: source lanes", value: "lanes" },
  { label: "Off", value: "off" },
] as const satisfies readonly { readonly label: string; readonly value: string }[];

export type AnnotationSetting = (typeof annotationVariants)[number]["value"];

export function isAnnotationSetting(value: unknown): value is AnnotationSetting {
  return annotationVariants.some((option) => option.value === value);
}

const TRACKS = [
  ["Digital Love", "Daft Punk"],
  ["Midnight City", "M83"],
  ["Genesis", "Justice"],
  ["Nightcall", "Kavinsky"],
  ["Innerbloom", "RÜFÜS DU SOL"],
  ["Teardrop", "Massive Attack"],
  ["Intro", "The xx"],
  ["Gooey", "Glass Animals"],
  ["Redbone", "Childish Gambino"],
  ["Dreams", "Fleetwood Mac"],
  ["Strobe", "deadmau5"],
  ["Sunset Lover", "Petit Biscuit"],
  ["A Moment Apart", "ODESZA"],
  ["Holocene", "Bon Iver"],
  ["Opus", "Eric Prydz"],
  ["Nights", "Frank Ocean"],
] as const;

function seeded(seed: number) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Three weeks of history up to `now`; nothing is recorded in the future. */
export function createDemoAnnotations(
  today: Temporal.PlainDate,
  timeZone: string,
  now: Temporal.Instant,
): readonly TimeGridAnnotation[] {
  const items: TimeGridAnnotation[] = [];
  const at = (date: Temporal.PlainDate, minutes: number) =>
    date
      .toZonedDateTime(timeZone)
      .add({ seconds: Math.round(minutes * 60) })
      .toInstant();
  const add = (
    sourceId: string,
    start: Temporal.Instant,
    end: Temporal.Instant,
    title: string,
    detail?: string,
  ) => {
    if (Temporal.Instant.compare(start, now) >= 0) return;
    const clipped = Temporal.Instant.compare(end, now) > 0 ? now : end;
    items.push({ detail, end: clipped, id: `${sourceId}-${items.length}`, sourceId, start, title });
  };

  for (let offset = -21; offset <= 0; offset++) {
    const date = today.add({ days: offset });
    const random = seeded(
      date
        .toString()
        .split("-")
        .reduce((sum, part) => sum * 31 + Number(part), 7),
    );
    const weekend = date.dayOfWeek >= 6;

    // Last night's sleep, ending this morning.
    const bed = -60 + random() * 100 + (weekend ? 50 : 0);
    const wake = 400 + random() * 70 + (weekend ? 80 : 0);
    add("sleep", at(date, bed), at(date, wake), "Sleep", `Score ${70 + Math.floor(random() * 24)}`);

    // Listening sessions made of individual tracks, like Spotify's recently-played history.
    const sessions: [number, number][] = [];
    if (!weekend) sessions.push([475 + random() * 30, 30 + random() * 25]);
    if (random() < 0.7) sessions.push([780 + random() * 180, 40 + random() * 80]);
    if (random() < 0.6) sessions.push([1200 + random() * 120, 30 + random() * 40]);
    if (weekend) sessions.push([600 + random() * 60, 50 + random() * 40]);
    for (const [from, length] of sessions) {
      let minute = from;
      while (minute < from + length - 1) {
        const track = TRACKS[Math.floor(random() * TRACKS.length)]!;
        const duration = 2.4 + random() * 3.2;
        add("spotify", at(date, minute), at(date, minute + duration), track[0], track[1]);
        minute += duration + (random() < 0.08 ? 3 + random() * 6 : random() * 0.3);
      }
    }

    if ([1, 3, 6].includes(date.dayOfWeek) && random() < 0.8) {
      const start = date.dayOfWeek === 6 ? 13 * 60 + 5 : 18 * 60 + 30 + random() * 40;
      const [title, detail] =
        date.dayOfWeek === 6
          ? ["Run club", "8.1 km · 5:48 /km"]
          : date.dayOfWeek === 1
            ? ["Evening run", "5.2 km · 6:55 /km"]
            : ["Strength training", "312 kcal"];
      add("workout", at(date, start), at(date, start + 35 + random() * 20), title, detail);
    }

    if (!weekend) {
      if (random() < 0.5) {
        for (let index = 0; index < 4; index++) {
          const start = 9 * 60 + index * 30;
          add("focus", at(date, start), at(date, start + 25), "Pomodoro", `${index + 1} of 4`);
        }
      } else if (random() < 0.6) {
        const start = 13 * 60 + 30 + random() * 60;
        add("focus", at(date, start), at(date, start + 75), "Do Not Disturb", "Notifications held");
      }
      // WakaTime-style coding heartbeats, merged with a 15-minute timeout.
      for (const [from, to] of [
        [600, 740],
        [840, 1080],
      ] as const) {
        let minute = from + random() * 15;
        while (minute < to) {
          const length = 3 + random() * 22;
          add(
            "coding",
            at(date, minute),
            at(date, Math.min(minute + length, to)),
            "time",
            "TypeScript",
          );
          minute += length + (random() < 0.15 ? 18 + random() * 20 : 1 + random() * 9);
        }
      }
    }
  }
  return items;
}

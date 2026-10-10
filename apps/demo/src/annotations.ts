import type { CalendarAnnotation } from "@moltenship/calendar";
import { ActivityIcon, CodeXmlIcon, MoonIcon, MusicIcon, TargetIcon } from "lucide-react";
import { useCallback } from "react";

import type { TimeGridAnnotationSource } from "@registry/time-grid-view/time-grid-annotations";

import type { DemoResourceId } from "./resources";
import { usePersistentState } from "./storage";

/** What the demo pretends to sync: music, sleep, workouts, focus sessions and coding time. */
export const demoAnnotationSources = [
  {
    color: "purple",
    Icon: MoonIcon,
    id: "sleep",
    label: "Sleep",
    mergeGap: Temporal.Duration.from({ minutes: 20 }),
  },
  {
    color: "green",
    Icon: MusicIcon,
    id: "music",
    label: "Music",
    mergeGap: Temporal.Duration.from({ minutes: 5 }),
  },
  { color: "orange", Icon: ActivityIcon, id: "workouts", label: "Workouts" },
  { color: "teal", Icon: TargetIcon, id: "focus", label: "Focus" },
  {
    color: "yellow",
    Icon: CodeXmlIcon,
    id: "coding",
    label: "Coding",
    mergeGap: Temporal.Duration.from({ minutes: 15 }),
  },
] as const satisfies readonly TimeGridAnnotationSource[];

export type DemoAnnotationSourceId = (typeof demoAnnotationSources)[number]["id"];

function isDemoAnnotationSourceId(value: unknown): value is DemoAnnotationSourceId {
  return demoAnnotationSources.some((source) => source.id === value);
}

const tracks = [
  "Digital Love · Daft Punk",
  "Midnight City · M83",
  "Genesis · Justice",
  "Nightcall · Kavinsky",
  "Innerbloom · RÜFÜS DU SOL",
  "Teardrop · Massive Attack",
  "Intro · The xx",
  "Gooey · Glass Animals",
  "Redbone · Childish Gambino",
  "Dreams · Fleetwood Mac",
  "Strobe · deadmau5",
  "Sunset Lover · Petit Biscuit",
  "A Moment Apart · ODESZA",
  "Holocene · Bon Iver",
  "Opus · Eric Prydz",
  "Nights · Frank Ocean",
] as const;

/** A small seeded generator, so a day's annotations stay the same across reloads. */
function seededRandom(seed: number) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Three weeks of history up to `now`, seeded per day: a night's sleep, listening sessions made of
 * individual tracks, workouts, focus sessions and coding time. Nothing is recorded in the future.
 */
export function createDemoAnnotations(
  today: Temporal.PlainDate,
  timeZone: string,
  now: Temporal.Instant,
): readonly CalendarAnnotation<unknown, DemoResourceId>[] {
  const annotations: CalendarAnnotation<unknown, DemoResourceId>[] = [];
  const at = (date: Temporal.PlainDate, minutes: number) =>
    date
      .toZonedDateTime(timeZone)
      .add({ seconds: Math.round(minutes * 60) })
      .toInstant();
  const add = (
    sourceId: DemoAnnotationSourceId,
    start: Temporal.Instant,
    end: Temporal.Instant,
    title: string,
  ) => {
    if (Temporal.Instant.compare(start, now) >= 0) return;
    annotations.push({
      end: Temporal.Instant.compare(end, now) > 0 ? now : end,
      id: `${sourceId}-${annotations.length}`,
      sourceId,
      start,
      title,
    });
  };

  for (let offset = -21; offset <= 0; offset++) {
    const date = today.add({ days: offset });
    const random = seededRandom(date.year * 400 + date.dayOfYear);
    const weekend = date.dayOfWeek >= 6;

    const bedtime = -60 + random() * 100 + (weekend ? 50 : 0);
    const wake = 400 + random() * 70 + (weekend ? 80 : 0);
    add("sleep", at(date, bedtime), at(date, wake), "Sleep");

    const sessions: (readonly [number, number])[] = [];
    if (!weekend) sessions.push([475 + random() * 30, 30 + random() * 25]);
    if (random() < 0.7) sessions.push([780 + random() * 180, 40 + random() * 80]);
    if (random() < 0.6) sessions.push([1200 + random() * 120, 30 + random() * 40]);
    if (weekend) sessions.push([600 + random() * 60, 50 + random() * 40]);
    for (const [from, length] of sessions) {
      let minute = from;
      while (minute < from + length - 1) {
        const duration = 2.4 + random() * 3.2;
        const track = tracks[Math.floor(random() * tracks.length)]!;
        add("music", at(date, minute), at(date, minute + duration), track);
        minute += duration + (random() < 0.08 ? 3 + random() * 6 : random() * 0.3);
      }
    }

    if ([1, 3, 6].includes(date.dayOfWeek) && random() < 0.8) {
      const start = date.dayOfWeek === 6 ? 13 * 60 + 5 : 18 * 60 + 30 + random() * 40;
      const title =
        date.dayOfWeek === 6
          ? "Run club · 8.1 km"
          : date.dayOfWeek === 1
            ? "Evening run · 5.2 km"
            : "Strength training";
      add("workouts", at(date, start), at(date, start + 35 + random() * 20), title);
    }

    if (weekend) continue;
    if (random() < 0.5) {
      for (let index = 0; index < 4; index++) {
        const start = 9 * 60 + index * 30;
        add("focus", at(date, start), at(date, start + 25), `Pomodoro ${index + 1} of 4`);
      }
    } else if (random() < 0.6) {
      const start = 13 * 60 + 30 + random() * 60;
      add("focus", at(date, start), at(date, start + 75), "Do Not Disturb");
    }
    // Coding heartbeats, merged with WakaTime's 15-minute timeout.
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
          "time · TypeScript",
        );
        minute += length + (random() < 0.15 ? 18 + random() * 20 : 1 + random() * 9);
      }
    }
  }
  return annotations;
}

function parseHiddenSources(stored: string | null): ReadonlySet<DemoAnnotationSourceId> {
  try {
    const value: unknown = JSON.parse(stored ?? "[]");
    return new Set(Array.isArray(value) ? value.filter(isDemoAnnotationSourceId) : []);
  } catch {
    return new Set();
  }
}

/** Which annotation sources the sidebar hides; hiding one leaves it out of `annotationSources`. */
export function useHiddenAnnotationSources() {
  const [hidden, setHidden] = usePersistentState(
    "moltenship-demo:hidden-annotation-sources",
    parseHiddenSources,
    (value: ReadonlySet<DemoAnnotationSourceId>) => JSON.stringify([...value]),
  );
  const toggleSource = useCallback(
    (sourceId: DemoAnnotationSourceId) =>
      setHidden((current) => {
        const next = new Set(current);
        if (!next.delete(sourceId)) next.add(sourceId);
        return next;
      }),
    [setHidden],
  );
  return [hidden, toggleSource] as const;
}

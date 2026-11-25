// #region data
import {
  createCalendar,
  defineCalendarView,
  summarizeAnnotationMarks,
  timeGridStrategy,
  useTimeGridAnnotations,
  type CalendarAnnotation,
  type CalendarAnnotationSource,
} from "@moltenship/calendar-solid";
import { For } from "solid-js";

import { seed, weekRules } from "./app";
import { eventAdapter, type Meeting } from "./calendar";

interface Play {
  readonly id: string;
  readonly track: string;
  readonly artist: string;
  readonly startedAt: string;
  readonly endedAt: string;
}

export const sources: readonly CalendarAnnotationSource[] = [
  { id: "sleep", label: "Sleep" },
  // Tracks less than five minutes apart draw as one listening session.
  { id: "music", label: "Music", mergeGap: Temporal.Duration.from({ minutes: 5 }) },
];

export function listeningHistory(plays: readonly Play[]): CalendarAnnotation[] {
  return plays.map((play) => ({
    id: play.id,
    sourceId: "music",
    start: Temporal.Instant.from(play.startedAt),
    end: Temporal.Instant.from(play.endedAt),
    title: `${play.track} · ${play.artist}`,
  }));
}
// #endregion data

// #region view
export const weekView = defineCalendarView({
  name: "week",
  strategy: timeGridStrategy({ kind: "week" }),
  Renderer: (props) => {
    // One list of marks per column. A mark is never shorter than 2% of the day, about half an hour.
    const marks = useTimeGridAnnotations(() => props.projection.days.map((day) => day.column), {
      minHeight: 0.02,
    });

    return (
      <div class="week">
        <For each={props.projection.days}>
          {(day, index) => (
            <div class="week-day" data-date={day.column.date.toString()}>
              <div class="rail" aria-hidden="true">
                <For each={marks()[index()]}>
                  {(mark) => (
                    <span
                      class="mark"
                      data-source={mark.source.id}
                      data-kind={mark.kind}
                      title={mark.annotations.map((annotation) => annotation.title).join(", ")}
                      style={{
                        top: `${mark.top * 100}%`,
                        height: `${mark.height * 100}%`,
                        left: `${(mark.lane / mark.lanes) * 100}%`,
                        width: `${100 / mark.lanes}%`,
                      }}
                    />
                  )}
                </For>
              </div>
              {/* The day's events */}
            </div>
          )}
        </For>
      </div>
    );
  },
});
// #endregion view

// #region calendar
export const Tracker = createCalendar<Meeting>()({ eventAdapter, views: [weekView] });
// #endregion calendar

// #region root
export function Week(props: { plays: readonly Play[] }) {
  return (
    <Tracker.Root
      label="Team calendar"
      events={seed}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
      annotationSources={sources}
      annotations={listeningHistory(props.plays)}
    >
      <Tracker.ActiveView />
    </Tracker.Root>
  );
}
// #endregion root

// #region summary
export function DaySummary(props: { marks: Parameters<typeof summarizeAnnotationMarks>[0] }) {
  const hours = (duration: Temporal.Duration) =>
    duration.round({ largestUnit: "hours", smallestUnit: "minutes" }).toLocaleString("en");

  return (
    <ul>
      <For each={summarizeAnnotationMarks(props.marks)}>
        {(summary) => (
          <li>
            {summary.source.label}: {summary.count} times, {hours(summary.duration)}
          </li>
        )}
      </For>
    </ul>
  );
}
// #endregion summary

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { Anatomy } from "./anatomy";
import type { AnatomyCallout } from "./layout";
import { Chevron, EventShape, GridLine, Surface } from "./shapes";

const RESOURCE = 100;
const DAY = 52;
const WIDTH = RESOURCE + 7 * DAY;
/** The header's month row and day row. */
const MONTH = 18;
const HEADER = MONTH + 30;
/** A lane, the padding around a row's lanes, and the shortest row, scaled to the figure. */
const LANE = 18;
const PADDING = 5;
const MIN_ROW = 30;

interface FigureRow {
  readonly title: string;
  readonly depth: number;
  readonly group?: boolean;
  readonly lanes: number;
}

const rows: readonly FigureRow[] = [
  { depth: 0, lanes: 1, title: "Orchid" },
  { depth: 0, lanes: 2, title: "Lotus" },
  { depth: 0, group: true, lanes: 0, title: "Design" },
  { depth: 1, lanes: 1, title: "Maya" },
  { depth: 1, lanes: 1, title: "Alex" },
];
const rowHeight = ({ lanes }: FigureRow) => Math.max(MIN_ROW, 2 * PADDING + lanes * LANE);
const rowTops = rows.reduce<number[]>(
  (tops, row, index) => [...tops, tops[index]! + rowHeight(row)],
  [HEADER],
);
const HEIGHT = rowTops.at(-1)!;

const rowTop = (row: number) => rowTops[row]!;
const rowMiddle = (row: number) => rowTop(row) + rowHeight(rows[row]!) / 2;
const laneTop = (row: number, lane: number) => rowTop(row) + PADDING + lane * LANE;
const laneMiddle = (row: number, lane: number) => laneTop(row, lane) + (LANE - 2) / 2;
const dayLeft = (day: number) => RESOURCE + day * DAY;
const dayMiddle = (day: number) => dayLeft(day) + DAY / 2;
/** 10:30 on Thursday, today. */
const NOW = dayLeft(3) + 0.44 * DAY;

const callouts: readonly AnatomyCallout[] = [
  {
    label: "Resource timeline",
    name: "ResourceTimelineView",
    anchor: [WIDTH / 2, HEIGHT],
    side: "bottom",
    row: 1,
  },
  {
    label: "Now line",
    name: 'data-slot="resource-timeline-now"',
    anchor: [NOW, HEIGHT - 6],
    side: "bottom",
    align: "start",
  },
  {
    label: "Sticky header",
    name: "ResourceTimelineHeader",
    anchor: [dayLeft(0) + 30, MONTH / 2 + 1],
    side: "top",
    align: "end",
  },
  {
    label: "Event bar",
    name: "ResourceTimelineEvent",
    anchor: [dayLeft(1) + 60, laneMiddle(1, 0)],
    side: "top",
    align: "end",
    row: 1,
  },
  {
    label: "Today",
    name: 'aria-current="date"',
    anchor: [dayMiddle(3), MONTH + 20],
    side: "top",
    align: "start",
    row: 1,
  },
  {
    label: "Resize handle",
    name: "data-resize",
    anchor: [dayLeft(4) - 4, laneMiddle(1, 0)],
    side: "top",
    align: "start",
  },
  {
    label: "Resource column",
    name: "--calendar-resource-column",
    anchor: [60, rowMiddle(0)],
    side: "left",
  },
  {
    label: "Group toggle",
    name: "useResourceExpansion",
    anchor: [12, rowMiddle(2)],
    side: "left",
  },
  {
    label: "Resource row",
    name: "ResourceTimelineRow",
    anchor: [WIDTH, rowMiddle(1)],
    side: "right",
    span: rowHeight(rows[1]!),
  },
  {
    label: "Continues after the range",
    name: "endsAfter",
    anchor: [WIDTH - 2, laneMiddle(3, 0)],
    side: "right",
  },
  { label: "Day cell", name: "data-date", anchor: [dayMiddle(6), rowMiddle(4)], side: "right" },
];

const days = [
  { weekday: "MON", date: 5 },
  { weekday: "TUE", date: 6 },
  { weekday: "WED", date: 7 },
  { weekday: "THU", date: 8, today: true },
  { weekday: "FRI", date: 9 },
  { weekday: "SAT", date: 10, weekend: true },
  { weekday: "SUN", date: 11, weekend: true },
];

/** A bar in a row's lane, across `span` days from `day`, inset from the grid lines it ends at. */
function Bar({
  color,
  day,
  endsAfter = false,
  lane,
  row,
  span,
  time,
  title,
}: {
  readonly color: CalendarEventColor;
  readonly day: number;
  readonly endsAfter?: boolean;
  readonly lane: number;
  readonly row: number;
  readonly span: number;
  readonly time?: string;
  readonly title: string;
}) {
  const x = dayLeft(day) + 2;
  const y = laneMiddle(row, lane);
  return (
    <EventShape
      x={x}
      y={laneTop(row, lane)}
      width={span * DAY - (endsAfter ? 2 : 4)}
      height={LANE - 2}
      color={color}
      corners={endsAfter ? [3, 0, 0, 3] : [3, 3, 3, 3]}
    >
      <text x={x + 7} y={y} fontSize={8.5} dominantBaseline="central" className="font-medium">
        {title}
        {time !== undefined && (
          <tspan className="font-normal" opacity={0.8}>
            {" "}
            {time}
          </tspan>
        )}
      </text>
    </EventShape>
  );
}

function TimelineFigure() {
  return (
    <g>
      <Surface x={0} y={0} width={WIDTH} height={HEIGHT} />
      {days.map(
        ({ date, weekend }, day) =>
          weekend === true && (
            <rect
              key={date}
              x={dayLeft(day)}
              y={HEADER}
              width={DAY}
              height={HEIGHT - HEADER}
              className="fill-calendar-weekend"
            />
          ),
      )}
      <rect
        x={0}
        y={rowTop(2)}
        width={WIDTH}
        height={rowHeight(rows[2]!)}
        className="fill-muted/50"
      />
      <rect
        x={0}
        y={rowTop(2)}
        width={RESOURCE}
        height={rowHeight(rows[2]!)}
        className="fill-muted"
      />

      {/* Header: the corner, the month over the days, and the days. */}
      <text
        x={10}
        y={HEADER - 9}
        fontSize={8.5}
        dominantBaseline="central"
        className="fill-muted-foreground font-medium"
      >
        Resources
      </text>
      <text
        x={dayLeft(0) + 6}
        y={MONTH / 2 + 1}
        fontSize={8.5}
        dominantBaseline="central"
        className="fill-foreground font-medium"
      >
        October 2026
      </text>
      {days.map(({ date, today, weekday }, day) => (
        <g key={date}>
          <text
            x={dayMiddle(day)}
            y={MONTH + 8}
            fontSize={7}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-muted-foreground font-medium"
          >
            {weekday}
          </text>
          {today === true && (
            <circle cx={dayMiddle(day)} cy={MONTH + 20} r={7} className="fill-calendar-today" />
          )}
          <text
            x={dayMiddle(day)}
            y={MONTH + 20}
            fontSize={8.5}
            textAnchor="middle"
            dominantBaseline="central"
            className={
              today === true ? "fill-calendar-today-foreground" : "fill-foreground tabular-nums"
            }
          >
            {date}
          </text>
        </g>
      ))}

      {/* Grid: the resource column's edge, day lines, and a line under each row. */}
      <GridLine x1={0} x2={WIDTH} y1={HEADER} y2={HEADER} />
      <GridLine x1={RESOURCE} x2={RESOURCE} y1={0} y2={HEIGHT} />
      {days.slice(1).map(({ date }, index) => (
        <GridLine
          key={date}
          x1={dayLeft(index + 1)}
          x2={dayLeft(index + 1)}
          y1={MONTH}
          y2={HEIGHT}
        />
      ))}
      {rows.slice(1).map(({ title }, index) => (
        <GridLine key={title} x1={0} x2={WIDTH} y1={rowTop(index + 1)} y2={rowTop(index + 1)} />
      ))}

      {/* Resource column: names indented by depth, and the group's toggle. */}
      {rows.map(({ depth, group, title }, row) => (
        <text
          key={title}
          x={26 + depth * 12}
          y={rowMiddle(row)}
          fontSize={9}
          dominantBaseline="central"
          className={`fill-foreground ${group === true ? "font-medium" : ""}`}
        >
          {title}
        </text>
      ))}
      <Chevron direction="down" x={12} y={rowMiddle(2)} size={7} className="stroke-foreground" />

      <Bar color="blue" day={0} lane={0} row={0} span={1} time="9:30" title="Standup" />
      <Bar color="blue" day={1} lane={0} row={0} span={1} time="9:30" title="Standup" />
      <Bar color="purple" day={1} lane={0} row={1} span={3} title="Workshop" />
      <Bar color="green" day={2} lane={1} row={1} span={1} time="10:00" title="Review" />
      <Bar color="teal" day={4} endsAfter lane={0} row={3} span={3} title="Offsite" />
      <Bar color="orange" day={3} lane={0} row={4} span={1} time="11:00" title="1:1" />

      <rect
        x={NOW - 1}
        y={HEADER}
        width={2}
        height={HEIGHT - HEADER}
        className="fill-calendar-now"
      />
    </g>
  );
}

/** Header, resource column and groups, rows of lane-packed bars, and the now-line. */
export function ResourceTimelineAnatomy() {
  return (
    <Anatomy
      label="Parts of the resource timeline"
      width={WIDTH}
      height={HEIGHT}
      callouts={callouts}
    >
      <TimelineFigure />
    </Anatomy>
  );
}

import { Anatomy } from "./anatomy";
import type { AnatomyCallout } from "./layout";
import { EventShape, GridLine, Surface } from "./shapes";

const GUTTER = 44;
const COLUMN = 132;
const WIDTH = GUTTER + 3 * COLUMN;
const HEADER = 50;
const ALL_DAY = 26;
const BODY_TOP = HEADER + ALL_DAY;
const HOUR = 48;
const HEIGHT = 300;
/** The body opens at 8:30, so the 9 AM line sits half an hour down. */
const hourY = (hour: number) => BODY_TOP + (hour - 8.5) * HOUR;
const columnLeft = (column: number) => GUTTER + column * COLUMN;
const columnMiddle = (column: number) => columnLeft(column) + COLUMN / 2;
/** Events leave an 8px strip on the right for creating events beside them. */
const EVENT_WIDTH = COLUMN - 8;

const callouts: readonly AnatomyCallout[] = [
  { label: "Time grid", name: "TimeGridView", anchor: [330, HEIGHT], side: "bottom" },
  {
    label: "Day header",
    name: "TimeGridHeader",
    anchor: [columnMiddle(2) + 12, 16],
    side: "right",
  },
  {
    label: "All-day row",
    name: "TimeGridAllDay",
    anchor: [WIDTH - 20, HEADER + ALL_DAY / 2],
    side: "right",
  },
  { label: "Title", anchor: [columnLeft(0) + 6, hourY(9) + 10], side: "left" },
  { label: "Time", anchor: [columnLeft(0) + 6, hourY(9) + 36], side: "left" },
  {
    label: "Timed event",
    name: "TimeGridEvent",
    anchor: [columnLeft(0) + 1, hourY(10.4)],
    side: "left",
  },
  {
    label: "Resize handle",
    name: 'data-resize="end"',
    anchor: [columnLeft(0) + EVENT_WIDTH / 2, hourY(11) - 3],
    side: "bottom",
  },
  { label: "Time gutter", name: "--calendar-gutter-width", anchor: [12, hourY(12)], side: "left" },
  {
    label: "Outside working hours",
    name: "TimeGridAvailability",
    anchor: [columnLeft(2) + COLUMN - 12, (BODY_TOP + hourY(9)) / 2],
    side: "right",
  },
  { label: "Now line", name: "useNow", anchor: [columnLeft(2), hourY(9.67)], side: "right" },
  {
    label: "Overlap lanes",
    name: "TimeGridEventLayout",
    anchor: [columnLeft(1) + EVENT_WIDTH, hourY(11.2)],
    side: "right",
  },
  { label: "Day column", name: "TimeGridColumn", anchor: [WIDTH - 20, 280], side: "right" },
];

const days = [
  { weekday: "WED", day: 7, today: false },
  { weekday: "THU", day: 8, today: true },
  { weekday: "FRI", day: 9, today: false },
];

function Header() {
  return (
    <g>
      <text
        x={GUTTER - 6}
        y={HEADER - 6}
        fontSize={7.5}
        textAnchor="end"
        dominantBaseline="central"
        className="fill-calendar-axis"
      >
        GMT+2
      </text>
      {days.map(({ day, today, weekday }, column) => {
        const x = columnMiddle(column);
        return (
          <g key={weekday}>
            <text
              x={x}
              y={16}
              fontSize={8.5}
              textAnchor="middle"
              dominantBaseline="central"
              letterSpacing={0.4}
              className={`font-medium ${today ? "fill-calendar-today" : "fill-muted-foreground"}`}
            >
              {weekday}
            </text>
            {today && <circle cx={x} cy={34} r={13} className="fill-calendar-today" />}
            <text
              x={x}
              y={34}
              fontSize={15}
              textAnchor="middle"
              dominantBaseline="central"
              className={`tabular-nums ${today ? "fill-calendar-today-foreground" : "fill-foreground"}`}
            >
              {day}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Body() {
  return (
    <g>
      {/* Working hours start at 9 AM; the half hour before it is shaded. */}
      <rect
        x={GUTTER}
        y={BODY_TOP}
        width={WIDTH - GUTTER}
        height={hourY(9) - BODY_TOP}
        className="fill-calendar-unavailable"
      />
      {[9, 10, 11, 12, 13].map((hour) => (
        <g key={hour}>
          <GridLine x1={GUTTER} x2={WIDTH} y1={hourY(hour)} y2={hourY(hour)} />
          <text
            x={GUTTER - 6}
            y={hourY(hour)}
            fontSize={7.5}
            textAnchor="end"
            dominantBaseline="central"
            className="fill-calendar-axis tabular-nums"
          >
            {hour > 12 ? `${hour - 12} PM` : `${hour} ${hour === 12 ? "PM" : "AM"}`}
          </text>
        </g>
      ))}
      {[0, 1, 2].map((column) => (
        <GridLine
          key={column}
          x1={columnLeft(column)}
          x2={columnLeft(column)}
          y1={HEADER}
          y2={HEIGHT}
        />
      ))}
    </g>
  );
}

function Events() {
  const roadmapTop = hourY(9);
  const roadmapBottom = hourY(11);

  return (
    <g>
      <EventShape
        x={columnLeft(0) + 4}
        y={HEADER + 4}
        width={2 * COLUMN - 8}
        height={ALL_DAY - 8}
        color="blue"
        corners={[6, 6, 6, 6]}
      >
        <text
          x={columnLeft(0) + 12}
          y={HEADER + ALL_DAY / 2}
          fontSize={9}
          dominantBaseline="central"
          className="font-medium"
        >
          Offsite
        </text>
      </EventShape>

      <EventShape
        x={columnLeft(0) + 1}
        y={roadmapTop}
        width={EVENT_WIDTH}
        height={roadmapBottom - roadmapTop}
        color="green"
        corners={[6, 6, 6, 6]}
        ring
      >
        <text fontSize={9.5} className="font-medium">
          <tspan x={columnLeft(0) + 10} y={roadmapTop + 10} dominantBaseline="central">
            Quarterly roadmap
          </tspan>
          <tspan x={columnLeft(0) + 10} y={roadmapTop + 23} dominantBaseline="central">
            review
          </tspan>
        </text>
        <text
          x={columnLeft(0) + 10}
          y={roadmapTop + 36}
          fontSize={9}
          dominantBaseline="central"
          className="tabular-nums opacity-80"
        >
          9:00 – 11:00 AM
        </text>
        {/* The end handle's grip shows on hover. */}
        <rect
          x={columnLeft(0) + 1 + EVENT_WIDTH / 2 - 8}
          y={roadmapBottom - 4}
          width={16}
          height={2}
          rx={1}
          className="opacity-40"
        />
      </EventShape>

      {/* Two overlapping events share the column side by side. */}
      <EventShape
        x={columnLeft(1) + 1}
        y={hourY(10)}
        width={EVENT_WIDTH / 2}
        height={HOUR}
        color="purple"
        corners={[6, 6, 6, 6]}
        ring
      >
        <text
          x={columnLeft(1) + 10}
          y={hourY(10) + 10}
          fontSize={9}
          dominantBaseline="central"
          className="font-medium"
        >
          Review
        </text>
        <text
          x={columnLeft(1) + 10}
          y={hourY(10) + 23}
          fontSize={8}
          dominantBaseline="central"
          className="opacity-80"
        >
          10 – 11 AM
        </text>
      </EventShape>
      <EventShape
        x={columnLeft(1) + 1 + EVENT_WIDTH / 2}
        y={hourY(10.5)}
        width={EVENT_WIDTH / 2}
        height={HOUR}
        color="orange"
        corners={[6, 6, 6, 6]}
        ring
      >
        <text
          x={columnLeft(1) + 10 + EVENT_WIDTH / 2}
          y={hourY(10.5) + 10}
          fontSize={9}
          dominantBaseline="central"
          className="font-medium"
        >
          Interview
        </text>
        <text
          x={columnLeft(1) + 10 + EVENT_WIDTH / 2}
          y={hourY(10.5) + 23}
          fontSize={8}
          dominantBaseline="central"
          className="opacity-80"
        >
          10:30 – 11:30
        </text>
      </EventShape>

      {/* Shorter than 45 minutes: one line. */}
      <EventShape
        x={columnLeft(2) + 1}
        y={hourY(12)}
        width={EVENT_WIDTH}
        height={HOUR / 2}
        color="teal"
        corners={[6, 6, 6, 6]}
        ring
      >
        <text
          x={columnLeft(2) + 10}
          y={hourY(12) + HOUR / 4}
          fontSize={9}
          dominantBaseline="central"
          className="font-medium"
        >
          1:1 with Sam<tspan className="font-normal opacity-80">, 12 PM</tspan>
        </text>
      </EventShape>

      <rect
        x={columnLeft(1)}
        y={hourY(9.67) - 1}
        width={COLUMN}
        height={2}
        className="fill-calendar-now"
      />
      <circle cx={columnLeft(1) - 1} cy={hourY(9.67)} r={5} className="fill-calendar-now" />
    </g>
  );
}

/**
 * Day headers, the all-day row, the time gutter, day columns, shading outside working hours,
 * events, and the now line.
 */
export function TimeGridAnatomy() {
  return (
    <Anatomy
      label="Parts of the week and day views"
      width={WIDTH}
      height={HEIGHT}
      callouts={callouts}
    >
      <Surface x={0} y={0} width={WIDTH} height={HEIGHT} />
      <GridLine x1={0} x2={WIDTH} y1={BODY_TOP} y2={BODY_TOP} />
      <Header />
      <Body />
      <Events />
    </Anatomy>
  );
}

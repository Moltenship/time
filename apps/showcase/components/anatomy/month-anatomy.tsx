import { Anatomy } from "./anatomy";
import type { AnatomyCallout } from "./layout";
import { Chevron, EventShape, GridLine, Surface } from "./shapes";

const COLUMN = 64;
const WIDTH = 7 * COLUMN;
const HEADER = 28;
const ROW = 84;
const HEIGHT = HEADER + 3 * ROW;
/** The date row and lane height of `MonthWeekRow`, scaled to the figure. */
const DATE_ROW = 26;
const LANE = 19;

const rowTop = (row: number) => HEADER + row * ROW;
const laneTop = (row: number, lane: number) => rowTop(row) + DATE_ROW + lane * LANE + 1;
const laneMiddle = (row: number, lane: number) => laneTop(row, lane) + (LANE - 2) / 2;
const columnLeft = (column: number) => column * COLUMN;
const columnMiddle = (column: number) => columnLeft(column) + COLUMN / 2;

const callouts: readonly AnatomyCallout[] = [
  { label: "Month view", name: "MonthView", anchor: [WIDTH / 2, HEIGHT], side: "bottom" },
  { label: "Weekday header", anchor: [17, HEADER / 2], side: "left" },
  {
    label: "Week row",
    name: "MonthWeekRow",
    anchor: [WIDTH, rowTop(1) + ROW / 2],
    side: "right",
    span: ROW,
  },
  { label: "Day outside the month", name: "inMonth", anchor: [10, rowTop(0) + 42], side: "left" },
  { label: "Today", name: 'aria-current="date"', anchor: [23, rowTop(1) + 13], side: "left" },
  { label: "Day cell", name: "data-date", anchor: [10, laneMiddle(1, 1)], side: "left" },
  { label: "Date number", name: "DateButton", anchor: [20, rowTop(2) + 13], side: "left" },
  {
    label: "Event chip",
    name: "MonthEvent",
    anchor: [columnLeft(2) + 10, laneMiddle(1, 0)],
    side: "top",
  },
  {
    label: "Multi-day bar",
    name: "bar",
    anchor: [columnLeft(4) + 7, laneMiddle(0, 0)],
    side: "top",
  },
  {
    label: "Continuation",
    name: "endsAfter",
    anchor: [WIDTH - 2, laneMiddle(0, 0)],
    side: "right",
  },
  {
    label: "+N more",
    name: "MoreEvents",
    anchor: [columnLeft(6) + 42, laneMiddle(2, 2)],
    side: "right",
  },
];

/** Monday, September 28, to Sunday, October 18; today is October 5. */
const weeks = Array.from({ length: 3 }, (_, row) =>
  Array.from({ length: 7 }, (_, column) => {
    const offset = row * 7 + column;
    return offset < 3
      ? { label: String(28 + offset), inMonth: false, today: false }
      : { label: offset === 3 ? "Oct 1" : String(offset - 2), inMonth: true, today: offset === 7 };
  }),
);

function DateNumber({
  column,
  row,
  day,
}: {
  readonly column: number;
  readonly row: number;
  readonly day: (typeof weeks)[number][number];
}) {
  const x = columnMiddle(column);
  const y = rowTop(row) + 13;
  const width = Math.max(18, day.label.length * 6 + 8);
  return (
    <g>
      {day.today && (
        <rect
          x={x - width / 2}
          y={y - 9}
          width={width}
          height={18}
          rx={9}
          className="fill-calendar-today"
        />
      )}
      <text
        x={x}
        y={y}
        fontSize={9.5}
        textAnchor="middle"
        dominantBaseline="central"
        className={`font-medium tabular-nums ${
          day.today
            ? "fill-calendar-today-foreground"
            : day.inMonth
              ? "fill-foreground"
              : "fill-muted-foreground"
        }`}
      >
        {day.label}
      </text>
    </g>
  );
}

/** A single-day timed event: coloured dot, start time, and title. */
function DotEvent({
  color,
  column,
  lane,
  row,
  time,
  title,
}: {
  readonly color: "green" | "purple" | "teal";
  readonly column: number;
  readonly lane: number;
  readonly row: number;
  readonly time: string;
  readonly title: string;
}) {
  const x = columnLeft(column) + 7;
  const y = laneMiddle(row, lane);
  return (
    <g data-color={color}>
      <circle cx={x + 3} cy={y} r={3} className="fill-calendar-event-border" />
      <text x={x + 9} y={y} fontSize={9} dominantBaseline="central">
        <tspan className="fill-muted-foreground">{time}</tspan>
        <tspan dx={3} className="fill-foreground font-medium">
          {title}
        </tspan>
      </text>
    </g>
  );
}

function MonthFigure() {
  return (
    <g>
      <Surface x={0} y={0} width={WIDTH} height={HEIGHT} />
      {/* Days outside the month are muted. */}
      <rect x={0} y={rowTop(0)} width={3 * COLUMN} height={ROW} className="fill-muted/50" />
      {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((weekday, column) => (
        <text
          key={weekday}
          x={columnMiddle(column)}
          y={HEADER / 2}
          fontSize={8.5}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-muted-foreground font-medium"
        >
          {weekday}
        </text>
      ))}
      <GridLine x1={0} x2={WIDTH} y1={HEADER} y2={HEADER} />
      {[1, 2].map((row) => (
        <GridLine key={row} x1={0} x2={WIDTH} y1={rowTop(row)} y2={rowTop(row)} />
      ))}
      {[1, 2, 3, 4, 5, 6].map((column) => (
        <GridLine
          key={column}
          x1={columnLeft(column)}
          x2={columnLeft(column)}
          y1={HEADER}
          y2={HEIGHT}
        />
      ))}
      {weeks.map((days, row) =>
        days.map((day, column) => (
          <DateNumber key={`${row}-${column}`} column={column} row={row} day={day} />
        )),
      )}

      {/* "Offsite" runs Friday to Tuesday: it ends one week row and starts the next. */}
      <EventShape
        x={columnLeft(4) + 2}
        y={laneTop(0, 0)}
        width={3 * COLUMN - 2}
        height={LANE - 2}
        color="blue"
        corners={[5, 0, 0, 5]}
      >
        <text
          x={columnLeft(4) + 12}
          y={laneMiddle(0, 0)}
          fontSize={9}
          dominantBaseline="central"
          className="font-medium"
        >
          Offsite
        </text>
        <Chevron
          direction="right"
          x={WIDTH - 8}
          y={laneMiddle(0, 0)}
          size={7}
          className="stroke-calendar-event-foreground opacity-70"
        />
      </EventShape>
      <EventShape
        x={0}
        y={laneTop(1, 0)}
        width={2 * COLUMN - 2}
        height={LANE - 2}
        color="blue"
        corners={[0, 5, 5, 0]}
        accent={false}
      >
        <Chevron
          direction="left"
          x={7}
          y={laneMiddle(1, 0)}
          size={7}
          className="stroke-calendar-event-foreground opacity-70"
        />
        <text
          x={14}
          y={laneMiddle(1, 0)}
          fontSize={9}
          dominantBaseline="central"
          className="font-medium"
        >
          Offsite
        </text>
      </EventShape>

      <DotEvent color="green" column={2} lane={0} row={1} time="9 AM" title="Gym" />
      <DotEvent color="purple" column={3} lane={0} row={1} time="2 PM" title="Demo" />
      <DotEvent color="teal" column={4} lane={0} row={2} time="7 PM" title="Film" />
      <DotEvent color="green" column={6} lane={0} row={2} time="9 AM" title="Run" />
      <DotEvent color="purple" column={6} lane={1} row={2} time="1 PM" title="Call" />
      <text
        x={columnLeft(6) + 7}
        y={laneMiddle(2, 2)}
        fontSize={9}
        dominantBaseline="central"
        className="fill-muted-foreground font-medium"
      >
        2 more
      </text>
    </g>
  );
}

/** Weekday header, week rows, day cells, events, multi-day bars, and "+N more". */
export function MonthAnatomy() {
  return (
    <Anatomy label="Parts of the month view" width={WIDTH} height={HEIGHT} callouts={callouts}>
      <MonthFigure />
    </Anatomy>
  );
}

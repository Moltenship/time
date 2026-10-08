import { Anatomy } from "./anatomy";
import type { AnatomyCallout } from "./layout";
import { Chevron, EventShape, GridLine, Surface } from "./shapes";

const WIDTH = 460;
const HEIGHT = 300;
const TOOLBAR_HEIGHT = 52;

const callouts: readonly AnatomyCallout[] = [
  {
    label: "Root",
    name: "Calendar.Root",
    anchor: [WIDTH / 2, HEIGHT],
    side: "bottom",
    span: WIDTH,
  },
  { label: "Frame", name: "Calendar.Frame", anchor: [0, 262], side: "left" },
  {
    label: "Toolbar",
    name: "Calendar.Toolbar",
    anchor: [WIDTH, TOOLBAR_HEIGHT / 2],
    side: "right",
    span: TOOLBAR_HEIGHT,
  },
  { label: "Today", name: "Calendar.TodayTrigger", anchor: [12, 26], side: "left" },
  {
    label: "Previous",
    name: "Calendar.PreviousTrigger",
    anchor: [82, 17],
    side: "top",
    align: "end",
    row: 2,
  },
  {
    label: "Next",
    name: "Calendar.NextTrigger",
    anchor: [106, 17],
    side: "top",
    align: "start",
    row: 1,
  },
  { label: "Title", name: "Calendar.Title", anchor: [196, 17], side: "top", align: "start" },
  { label: "View switcher", name: "ViewSwitcher", anchor: [420, 13], side: "top", align: "end" },
  { label: "Mini month", name: "MiniMonth", anchor: [14, 144], side: "left" },
  { label: "Viewport", name: "Calendar.Viewport", anchor: [148, 214], side: "left" },
  {
    label: "Active view",
    name: "Calendar.ActiveView",
    anchor: [WIDTH, 170],
    side: "right",
    span: 236,
  },
];

function Toolbar() {
  return (
    <g>
      <rect
        x={12}
        y={13}
        width={52}
        height={26}
        rx={13}
        className="fill-background stroke-border"
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={38}
        y={26}
        fontSize={11}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground font-medium"
      >
        Today
      </text>
      <Chevron direction="left" x={82} y={26} size={9} className="stroke-foreground" />
      <Chevron direction="right" x={106} y={26} size={9} className="stroke-foreground" />
      <text x={124} y={26} fontSize={17} dominantBaseline="central" className="fill-foreground">
        October 2026
      </text>
      <rect
        x={370}
        y={13}
        width={78}
        height={26}
        rx={13}
        className="fill-background stroke-border"
        vectorEffect="non-scaling-stroke"
      />
      <text x={384} y={26} fontSize={11} dominantBaseline="central" className="fill-foreground">
        Week
      </text>
      <Chevron direction="down" x={432} y={26} size={8} className="stroke-muted-foreground" />
    </g>
  );
}

const MINI_CELL = 16;
const MINI_LEFT = 14;
const MINI_TOP = 104;
/** Six weeks from Monday, September 28, as `MiniMonth` shows them. */
const miniWeeks = Array.from({ length: 6 }, (_, week) =>
  Array.from({ length: 7 }, (_, day) => {
    const offset = week * 7 + day;
    return offset < 3
      ? { day: 28 + offset, inMonth: false }
      : offset < 34
        ? { day: offset - 2, inMonth: true }
        : { day: offset - 33, inMonth: false };
  }),
);

function MiniMonthFigure() {
  return (
    <g>
      <text x={16} y={72} fontSize={9.5} dominantBaseline="central" className="fill-foreground">
        October 2026
      </text>
      <Chevron direction="left" x={106} y={72} size={6} className="stroke-foreground" />
      <Chevron direction="right" x={122} y={72} size={6} className="stroke-foreground" />
      {/* The band marks the dates the main view shows. */}
      <rect
        x={MINI_LEFT}
        y={MINI_TOP + MINI_CELL / 2}
        width={7 * MINI_CELL}
        height={MINI_CELL}
        rx={MINI_CELL / 2}
        className="fill-calendar-selection"
      />
      {["M", "T", "W", "T", "F", "S", "S"].map((letter, column) => (
        <text
          key={column}
          x={MINI_LEFT + (column + 0.5) * MINI_CELL}
          y={89}
          fontSize={7.5}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-muted-foreground font-medium"
        >
          {letter}
        </text>
      ))}
      {miniWeeks.map((days, week) =>
        days.map(({ day, inMonth }, column) => {
          const x = MINI_LEFT + (column + 0.5) * MINI_CELL;
          const y = MINI_TOP + week * MINI_CELL;
          const today = inMonth && day === 8;
          return (
            <g key={`${week}-${column}`}>
              {today && <circle cx={x} cy={y} r={7} className="fill-calendar-today" />}
              <text
                x={x}
                y={y}
                fontSize={7.5}
                textAnchor="middle"
                dominantBaseline="central"
                className={
                  today
                    ? "fill-calendar-today-foreground font-semibold"
                    : inMonth
                      ? "fill-foreground"
                      : "fill-muted-foreground"
                }
              >
                {day}
              </text>
            </g>
          );
        }),
      )}
    </g>
  );
}

const VIEW_LEFT = 148;
const VIEW_TOP = TOOLBAR_HEIGHT;
const GUTTER = 28;
const COLUMN = (300 - GUTTER) / 7;
const HEADER_BOTTOM = VIEW_TOP + 36;
const HOUR = 40;
const columnX = (index: number) => VIEW_LEFT + GUTTER + index * COLUMN;

function WeekViewFigure() {
  const weekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

  return (
    <g>
      <rect
        x={VIEW_LEFT}
        y={VIEW_TOP}
        width={300}
        height={236}
        rx={10}
        className="fill-card stroke-border"
        vectorEffect="non-scaling-stroke"
      />
      {weekdays.map((weekday, index) => {
        const x = columnX(index) + COLUMN / 2;
        const today = index === 3;
        return (
          <g key={weekday}>
            <text
              x={x}
              y={VIEW_TOP + 12}
              fontSize={6.5}
              textAnchor="middle"
              dominantBaseline="central"
              className={
                today ? "fill-calendar-today font-medium" : "fill-muted-foreground font-medium"
              }
            >
              {weekday}
            </text>
            {today && <circle cx={x} cy={VIEW_TOP + 25} r={8.5} className="fill-calendar-today" />}
            <text
              x={x}
              y={VIEW_TOP + 25}
              fontSize={10.5}
              textAnchor="middle"
              dominantBaseline="central"
              className={today ? "fill-calendar-today-foreground" : "fill-foreground"}
            >
              {5 + index}
            </text>
          </g>
        );
      })}
      <GridLine x1={VIEW_LEFT} x2={VIEW_LEFT + 300} y1={HEADER_BOTTOM} y2={HEADER_BOTTOM} />
      {["9 AM", "10 AM", "11 AM", "12 PM"].map((hour, index) => {
        const y = HEADER_BOTTOM + (index + 1) * HOUR;
        return (
          <g key={hour}>
            <GridLine x1={columnX(0)} x2={VIEW_LEFT + 300} y1={y} y2={y} />
            <text
              x={columnX(0) - 4}
              y={y}
              fontSize={6}
              textAnchor="end"
              dominantBaseline="central"
              className="fill-calendar-axis"
            >
              {hour}
            </text>
          </g>
        );
      })}
      {Array.from({ length: 7 }, (_, index) => (
        <GridLine
          key={index}
          x1={columnX(index)}
          x2={columnX(index)}
          y1={HEADER_BOTTOM}
          y2={VIEW_TOP + 236}
        />
      ))}
      <EventShape
        x={columnX(0) + 1}
        y={HEADER_BOTTOM + HOUR}
        width={COLUMN - 6}
        height={HOUR * 1.5}
        color="green"
        corners={[5, 5, 5, 5]}
      >
        <text
          x={columnX(0) + 7}
          y={HEADER_BOTTOM + HOUR + 8}
          fontSize={6.5}
          className="font-medium"
        >
          Planning
        </text>
      </EventShape>
      <EventShape
        x={columnX(3) + 1}
        y={HEADER_BOTTOM + HOUR * 2}
        width={COLUMN - 6}
        height={HOUR}
        color="purple"
        corners={[5, 5, 5, 5]}
      >
        <text
          x={columnX(3) + 7}
          y={HEADER_BOTTOM + HOUR * 2 + 8}
          fontSize={6.5}
          className="font-medium"
        >
          Review
        </text>
      </EventShape>
      <EventShape
        x={columnX(2) + 1}
        y={HEADER_BOTTOM + HOUR * 3.5}
        width={COLUMN - 6}
        height={HOUR}
        color="orange"
        corners={[5, 5, 5, 5]}
      >
        <text
          x={columnX(2) + 7}
          y={HEADER_BOTTOM + HOUR * 3.5 + 8}
          fontSize={6.5}
          className="font-medium"
        >
          Lunch
        </text>
      </EventShape>
      <EventShape
        x={columnX(4) + 1}
        y={HEADER_BOTTOM + HOUR * 4}
        width={COLUMN - 6}
        height={HOUR / 2}
        color="teal"
        corners={[5, 5, 5, 5]}
      >
        <text
          x={columnX(4) + 7}
          y={HEADER_BOTTOM + HOUR * 4 + 8}
          fontSize={6.5}
          className="font-medium"
        >
          1:1
        </text>
      </EventShape>
      {/* The current-time line across today's column. */}
      <rect
        x={columnX(3)}
        y={HEADER_BOTTOM + HOUR * 1.67 - 0.75}
        width={COLUMN}
        height={1.5}
        className="fill-calendar-now"
      />
      <circle
        cx={columnX(3)}
        cy={HEADER_BOTTOM + HOUR * 1.67}
        r={3}
        className="fill-calendar-now"
      />
    </g>
  );
}

/** Root, frame, toolbar, viewport, and active view, with a sidebar mini month. */
export function CalendarAnatomy() {
  return (
    <Anatomy label="Parts of a calendar" width={WIDTH} height={HEIGHT} callouts={callouts}>
      <Surface x={0} y={0} width={WIDTH} height={HEIGHT} />
      <Toolbar />
      <MiniMonthFigure />
      <WeekViewFigure />
    </Anatomy>
  );
}

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { Anatomy } from "./anatomy";
import type { AnatomyCallout } from "./layout";
import { EventShape, Surface } from "./shapes";

const CELL = 26;
const MONTH = 7 * CELL;
const PADDING = 16;
const GAP = 34;
const NAME_Y = 26;
const WEEKDAY_Y = 44;
const FIRST_ROW = 56;
const WIDTH = PADDING + 2 * MONTH + GAP + PADDING;
/** The popover hangs under the open day, in the row below the month's last week. */
const POPOVER = { height: 104, width: 150, y: FIRST_ROW + 5 * CELL + 4 } as const;
const HEIGHT = POPOVER.y + POPOVER.height + 12;

const monthLeft = (month: number) => PADDING + month * (MONTH + GAP);
const cellLeft = (month: number, column: number) => monthLeft(month) + column * CELL;
const cellMiddle = (month: number, column: number) => cellLeft(month, column) + CELL / 2;
const rowTop = (row: number) => FIRST_ROW + row * CELL;
const numberY = (row: number) => rowTop(row) + 11;
const dotY = (row: number) => rowTop(row) + 21;

/** September and October 2026 from Monday: the column of each month's first day. */
const months = [
  { first: 1, length: 30, name: "September", number: 9 },
  { first: 3, length: 31, name: "October", number: 10 },
] as const;
const TODAY = { day: 7, month: 10 };
/** The day whose events the popover lists. */
const OPEN = { day: 28, month: 10 };
const open = { column: (months[1].first + OPEN.day - 1) % 7, row: 4 };
const popoverLeft = cellMiddle(1, open.column) - POPOVER.width / 2;

const palette: readonly CalendarEventColor[] = ["blue", "green", "purple", "teal", "orange"];

/** A steady scatter of event colours, and the open day's three events. */
function dotsOn(month: number, day: number): readonly CalendarEventColor[] {
  if (month === OPEN.month && day === OPEN.day) return ["teal", "blue", "purple"];
  const seed = (day * 7 + month * 3) % 11;
  return Array.from({ length: seed % 4 }, (_, index) => palette[(seed + index) % palette.length]!);
}

const callouts: readonly AnatomyCallout[] = [
  { label: "Year view", name: "YearView", anchor: [WIDTH / 2, HEIGHT], side: "bottom" },
  {
    label: "Month",
    name: "YearMonthGrid",
    anchor: [WIDTH, (NAME_Y - 10 + rowTop(6)) / 2],
    side: "right",
    span: rowTop(6) - NAME_Y + 10,
  },
  { label: "Month name, opens the month", anchor: [monthLeft(0) + 2, NAME_Y], side: "left" },
  {
    label: "Weekday initials",
    anchor: [cellLeft(0, 3), WEEKDAY_Y],
    side: "top",
  },
  {
    label: "Today",
    name: 'aria-current="date"',
    anchor: [cellMiddle(1, (months[1].first + TODAY.day - 1) % 7), rowTop(1) + 2],
    side: "top",
  },
  { label: "Outside the month", anchor: [cellMiddle(0, 0), rowTop(0) + 13], side: "left" },
  {
    label: "Day cell",
    name: "data-date",
    anchor: [cellLeft(0, 0) + 4, rowTop(2) + 13],
    side: "left",
  },
  {
    label: "Event colors",
    name: "data-color",
    anchor: [cellMiddle(0, 0) - 4, dotY(4)],
    side: "left",
  },
  {
    label: "Day popover",
    name: "YearDayPopover",
    anchor: [popoverLeft + POPOVER.width, POPOVER.y + 26],
    side: "right",
  },
  {
    label: "Event",
    name: "YearEvent",
    anchor: [popoverLeft + 82, POPOVER.y + 92],
    side: "right",
  },
];

function Day({ month, day }: { readonly month: 0 | 1; readonly day: number }) {
  const { first, number } = months[month];
  const offset = first + day - 1;
  const column = offset % 7;
  const row = Math.floor(offset / 7);
  const x = cellMiddle(month, column);
  const isToday = number === TODAY.month && day === TODAY.day;
  const isOpen = number === OPEN.month && day === OPEN.day;
  const dots = dotsOn(number, day);
  const dotsLeft = x - ((dots.length - 1) * 4.5) / 2;
  return (
    <g>
      {isOpen && (
        <rect
          x={cellLeft(month, column) + 1}
          y={rowTop(row) + 1}
          width={CELL - 2}
          height={CELL - 2}
          rx={5}
          className="fill-accent"
        />
      )}
      {isToday && <circle cx={x} cy={numberY(row)} r={8.5} className="fill-calendar-today" />}
      <text
        x={x}
        y={numberY(row)}
        fontSize={9}
        textAnchor="middle"
        dominantBaseline="central"
        className={`tabular-nums ${isToday ? "fill-calendar-today-foreground font-semibold" : "fill-foreground"}`}
      >
        {day}
      </text>
      {dots.map((color, index) => (
        <circle
          key={color}
          data-color={color}
          cx={dotsLeft + index * 4.5}
          cy={dotY(row)}
          r={1.6}
          className="fill-calendar-event-border"
        />
      ))}
    </g>
  );
}

/** A timed event in the day's list: coloured dot, start time, and title. */
function DotEvent({
  color,
  time,
  title,
  y,
}: {
  readonly color: CalendarEventColor;
  readonly time: string;
  readonly title: string;
  readonly y: number;
}) {
  const x = popoverLeft + 12;
  return (
    <g data-color={color}>
      <circle cx={x + 3} cy={y} r={3} className="fill-calendar-event-border" />
      <text x={x + 10} y={y} fontSize={9} dominantBaseline="central">
        <tspan className="fill-muted-foreground">{time}</tspan>
        <tspan dx={3} className="fill-foreground font-medium">
          {title}
        </tspan>
      </text>
    </g>
  );
}

function YearFigure() {
  return (
    <g>
      <Surface x={0} y={0} width={WIDTH} height={HEIGHT} />
      {months.map(({ length, name }, month) => (
        <g key={name}>
          <text
            x={monthLeft(month) + 4}
            y={NAME_Y}
            fontSize={11}
            dominantBaseline="central"
            className="fill-foreground font-medium"
          >
            {name}
          </text>
          {["M", "T", "W", "T", "F", "S", "S"].map((weekday, column) => (
            <text
              key={column}
              x={cellMiddle(month, column)}
              y={WEEKDAY_Y}
              fontSize={8}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-muted-foreground font-medium"
            >
              {weekday}
            </text>
          ))}
          {Array.from({ length }, (_, index) => (
            <Day key={index} month={month as 0 | 1} day={index + 1} />
          ))}
        </g>
      ))}

      <g>
        <rect
          x={popoverLeft}
          y={POPOVER.y}
          width={POPOVER.width}
          height={POPOVER.height}
          rx={9}
          className="fill-popover stroke-border"
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={popoverLeft + POPOVER.width / 2}
          y={POPOVER.y + 13}
          fontSize={7.5}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-muted-foreground font-medium"
        >
          WED
        </text>
        <text
          x={popoverLeft + POPOVER.width / 2}
          y={POPOVER.y + 30}
          fontSize={15}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground tabular-nums"
        >
          {OPEN.day}
        </text>
        <EventShape
          x={popoverLeft + 8}
          y={POPOVER.y + 46}
          width={POPOVER.width - 16}
          height={16}
          color="teal"
          corners={[4, 4, 4, 4]}
        >
          <text
            x={popoverLeft + 17}
            y={POPOVER.y + 54}
            fontSize={9}
            dominantBaseline="central"
            className="font-medium"
          >
            Offsite
          </text>
        </EventShape>
        <DotEvent color="blue" time="9 AM" title="Standup" y={POPOVER.y + 74} />
        <DotEvent color="purple" time="2 PM" title="Review" y={POPOVER.y + 92} />
      </g>
    </g>
  );
}

/** Month grids, month names, day cells, today, event colours, and the day popover. */
export function YearAnatomy() {
  return (
    <Anatomy label="Parts of the year view" width={WIDTH} height={HEIGHT} callouts={callouts}>
      <YearFigure />
    </Anatomy>
  );
}

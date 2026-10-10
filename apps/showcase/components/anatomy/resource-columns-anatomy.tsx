import { Anatomy } from "./anatomy";
import type { AnatomyCallout } from "./layout";
import { Chevron, EventShape, GridLine, Surface } from "./shapes";

const GUTTER = 44;
const COLUMN = 110;
const COLUMNS = 4;
const WIDTH = GUTTER + COLUMNS * COLUMN;
/** One header row per hierarchy level: the group band, then its people. */
const LEVEL = 24;
const HEADER = 2 * LEVEL;
const ALL_DAY = 26;
const BODY_TOP = HEADER + ALL_DAY;
const HOUR = 48;
const HEIGHT = 300;
/** The body opens at 8:30, so the 9 AM line sits half an hour down. */
const hourY = (hour: number) => BODY_TOP + (hour - 8.5) * HOUR;
const columnLeft = (column: number) => GUTTER + column * COLUMN;
/** Events leave an 8px strip on the right for creating events beside them. */
const EVENT_WIDTH = COLUMN - 8;

/** A room, then the Design group's own column and its two people. */
const ORCHID = 0;
const DESIGN = 1;
const MAYA = 2;
const ALEX = 3;

const callouts: readonly AnatomyCallout[] = [
  { label: "Resource columns", name: "ResourceColumnsView", anchor: [300, HEIGHT], side: "bottom" },
  {
    label: "Group band",
    name: "useResourceExpansion",
    anchor: [columnLeft(DESIGN) + 60, LEVEL / 2],
    side: "top",
  },
  {
    label: "Resource header",
    name: "ResourceColumnsHeader",
    anchor: [columnLeft(ALEX) + 50, LEVEL + LEVEL / 2],
    side: "top",
  },
  {
    label: "All-day row",
    name: "ResourceColumnsAllDay",
    anchor: [WIDTH - 20, HEADER + ALL_DAY / 2],
    side: "right",
  },
  {
    label: "Resource column",
    name: "resourceIdAttributes",
    anchor: [WIDTH - 20, 270],
    side: "right",
  },
  { label: "Time gutter", name: "--calendar-gutter-width", anchor: [12, hourY(12)], side: "left" },
  {
    label: "Timed event",
    name: "TimeGridEvent",
    anchor: [columnLeft(ORCHID) + 1, hourY(10.6)],
    side: "left",
  },
  { label: "Now line", name: "useNow", anchor: [columnLeft(ORCHID), hourY(9.67)], side: "left" },
];

function Header() {
  return (
    <g>
      <text
        x={GUTTER - 6}
        y={HEADER - 8}
        fontSize={7.5}
        textAnchor="end"
        dominantBaseline="central"
        className="fill-calendar-axis"
      >
        GMT+2
      </text>
      {/* The expanded group's band starts in its own column and runs over its people. */}
      <rect
        x={columnLeft(DESIGN)}
        y={0}
        width={(COLUMNS - DESIGN) * COLUMN}
        height={LEVEL}
        className="fill-muted"
      />
      <Chevron
        className="stroke-muted-foreground"
        direction="down"
        size={8}
        x={columnLeft(DESIGN) + 12}
        y={LEVEL / 2}
      />
      {[
        { column: ORCHID, level: 0, title: "Orchid", x: 8 },
        { column: DESIGN, level: 0, title: "Design", x: 22 },
        { column: MAYA, level: 1, title: "Maya", x: 8 },
        { column: ALEX, level: 1, title: "Alex", x: 8 },
      ].map(({ column, level, title, x }) => (
        <text
          key={title}
          x={columnLeft(column) + x}
          y={level * LEVEL + LEVEL / 2}
          fontSize={9.5}
          dominantBaseline="central"
          className="fill-foreground font-medium"
        >
          {title}
        </text>
      ))}
    </g>
  );
}

function Body() {
  return (
    <g>
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
      {/* Column dividers; within the band they start under it. */}
      {[ORCHID, DESIGN, MAYA, ALEX].map((column) => (
        <GridLine
          key={column}
          x1={columnLeft(column)}
          x2={columnLeft(column)}
          y1={column > DESIGN ? LEVEL : 0}
          y2={HEIGHT}
        />
      ))}
    </g>
  );
}

/** "Design review" books Orchid, Maya and Alex, so it shows in each of their columns. */
function Review({ column }: { readonly column: number }) {
  const top = hourY(10);
  const x = columnLeft(column);

  return (
    <EventShape
      x={x + 1}
      y={top}
      width={EVENT_WIDTH}
      height={1.5 * HOUR}
      color="orange"
      corners={[6, 6, 6, 6]}
      ring
    >
      <text x={x + 10} y={top + 10} fontSize={9} dominantBaseline="central" className="font-medium">
        Design review
      </text>
      <text
        x={x + 10}
        y={top + 23}
        fontSize={8}
        dominantBaseline="central"
        className="tabular-nums opacity-80"
      >
        10 – 11:30 AM
      </text>
    </EventShape>
  );
}

function Events() {
  return (
    <g>
      <EventShape
        x={columnLeft(MAYA) + 4}
        y={HEADER + 4}
        width={COLUMN - 8}
        height={ALL_DAY - 8}
        color="teal"
        corners={[6, 6, 6, 6]}
      >
        <text
          x={columnLeft(MAYA) + 12}
          y={HEADER + ALL_DAY / 2}
          fontSize={9}
          dominantBaseline="central"
          className="font-medium"
        >
          Workshop
        </text>
      </EventShape>

      {/* Shorter than 45 minutes: one line. */}
      <EventShape
        x={columnLeft(ORCHID) + 1}
        y={hourY(9.25)}
        width={EVENT_WIDTH}
        height={HOUR / 4 + 4}
        color="gray"
        corners={[6, 6, 6, 6]}
        ring
      >
        <text
          x={columnLeft(ORCHID) + 10}
          y={hourY(9.25) + HOUR / 8 + 2}
          fontSize={8.5}
          dominantBaseline="central"
          className="font-medium"
        >
          Standup<tspan className="font-normal opacity-80">, 9:15 AM</tspan>
        </text>
      </EventShape>

      <Review column={ORCHID} />
      <Review column={MAYA} />
      <Review column={ALEX} />

      <EventShape
        x={columnLeft(DESIGN) + 1}
        y={hourY(12)}
        width={EVENT_WIDTH}
        height={HOUR}
        color="purple"
        corners={[6, 6, 6, 6]}
        ring
      >
        <text
          x={columnLeft(DESIGN) + 10}
          y={hourY(12) + 10}
          fontSize={9}
          dominantBaseline="central"
          className="font-medium"
        >
          Team lunch
        </text>
        <text
          x={columnLeft(DESIGN) + 10}
          y={hourY(12) + 23}
          fontSize={8}
          dominantBaseline="central"
          className="opacity-80"
        >
          12 – 1 PM
        </text>
      </EventShape>

      {/* Every resource's column for today has its own now line. */}
      <rect
        x={GUTTER}
        y={hourY(9.67) - 1}
        width={COLUMNS * COLUMN}
        height={2}
        className="fill-calendar-now"
      />
      {[ORCHID, DESIGN, MAYA, ALEX].map((column) => (
        <circle
          key={column}
          cx={columnLeft(column) - 1}
          cy={hourY(9.67)}
          r={4}
          className="fill-calendar-now"
        />
      ))}
    </g>
  );
}

/** Resource headers grouped into bands, the all-day row, the gutter, resource columns, events. */
export function ResourceColumnsAnatomy() {
  return (
    <Anatomy
      label="Parts of the resource columns view"
      width={WIDTH}
      height={HEIGHT}
      callouts={callouts}
    >
      <Surface x={0} y={0} width={WIDTH} height={HEIGHT} />
      <GridLine x1={0} x2={WIDTH} y1={BODY_TOP} y2={BODY_TOP} />
      <Body />
      <Header />
      <Events />
    </Anatomy>
  );
}

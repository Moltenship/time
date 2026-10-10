import { Anatomy } from "./anatomy";
import type { AnatomyCallout } from "./layout";
import { EventShape, GridLine, Surface } from "./shapes";

const GUTTER = 44;
const COLUMN = 170;
const WIDTH = GUTTER + 2 * COLUMN;
const HEADER = 50;
const HOUR = 48;
const HEIGHT = 300;
/** The rail at the start of each day column, and the capsule inside it. */
const RAIL = 18;
const MARK = 12;
/** The body opens at 6 AM. */
const hourY = (hour: number) => HEADER + (hour - 6) * HOUR;
const columnLeft = (column: number) => GUTTER + column * COLUMN;
const markX = (column: number) => columnLeft(column) + (RAIL - MARK) / 2;
const EVENT_LEFT = (column: number) => columnLeft(column) + RAIL;
const EVENT_WIDTH = COLUMN - RAIL - 8;

const callouts: readonly AnatomyCallout[] = [
  {
    label: "Annotation rail",
    name: "AnnotationRail",
    anchor: [columnLeft(1) + RAIL / 2, HEIGHT - 6],
    side: "bottom",
  },
  {
    label: "Cut at midnight",
    name: "data-starts-before",
    anchor: [markX(0) + MARK / 2, hourY(6.2)],
    side: "left",
  },
  { label: "Mark", name: "AnnotationMark", anchor: [markX(0), hourY(7)], side: "left" },
  {
    label: "Icon",
    name: "AnnotationMarkIcon",
    anchor: [markX(0) + MARK / 2, hourY(8) + MARK / 2],
    side: "left",
  },
  {
    label: "Short mark",
    name: 'data-kind="dot"',
    anchor: [markX(0) + MARK / 2, hourY(9.6) + MARK / 2],
    side: "left",
  },
  {
    label: "Day summary",
    name: "aria-describedby",
    anchor: [columnLeft(1) + COLUMN / 2 + 14, 34],
    side: "right",
  },
  {
    label: "Shared lanes",
    name: "lane, lanes",
    anchor: [columnLeft(1) + RAIL - 2, hourY(8.5)],
    side: "right",
  },
  {
    label: "Events, never moved",
    name: "TimeGridEvent",
    anchor: [EVENT_LEFT(1) + EVENT_WIDTH, hourY(9.5)],
    side: "right",
  },
];

const days = [
  { weekday: "WED", day: 7, today: false },
  { weekday: "THU", day: 8, today: true },
];

function Header() {
  return (
    <g>
      {days.map(({ day, today, weekday }, column) => {
        const x = columnLeft(column) + COLUMN / 2;
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
      {[7, 8, 9, 10].map((hour) => (
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
            {hour} AM
          </text>
        </g>
      ))}
      {[0, 1].map((column) => (
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

/** A capsule in the rail, with the source's icon in a disc at its top when it has room. */
function Capsule({
  color,
  fade = false,
  height,
  icon = false,
  width = MARK,
  x,
  y,
}: {
  readonly color: "green" | "orange" | "purple" | "teal";
  readonly fade?: boolean;
  readonly height: number;
  readonly icon?: boolean;
  readonly width?: number;
  readonly x: number;
  readonly y: number;
}) {
  const drawn = Math.max(height, width);
  return (
    <g data-color={color}>
      <rect
        x={x}
        y={y}
        width={width}
        height={drawn}
        rx={fade ? 0 : width / 2}
        className="fill-calendar-event-border"
        mask={fade ? "url(#annotation-fade)" : undefined}
      />
      {icon && (
        <g>
          <circle
            cx={x + width / 2}
            cy={y + width / 2}
            r={width / 2 - 1}
            className="fill-white/40"
          />
          {/* A music note, as Lucide draws it, scaled into the disc. */}
          <path
            d={`M${x + width / 2 - 1},${y + width / 2 + 2} v-4 l3,-0.8 v4`}
            className="fill-none stroke-black/70"
            strokeWidth={0.9}
            strokeLinecap="round"
          />
        </g>
      )}
    </g>
  );
}

function Marks() {
  return (
    <g>
      <defs>
        <linearGradient id="annotation-fade-gradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.35" stopColor="white" stopOpacity="1" />
        </linearGradient>
        <mask id="annotation-fade" maskContentUnits="objectBoundingBox">
          <rect width="1" height="1" fill="url(#annotation-fade-gradient)" />
        </mask>
      </defs>
      {/* Wednesday: sleep from the night before, a listening session, a short one. */}
      <Capsule x={markX(0)} y={HEADER} height={hourY(6.9) - HEADER} color="purple" fade />
      <Capsule x={markX(0)} y={hourY(8)} height={HOUR * 0.9} color="green" icon />
      <Capsule x={markX(0)} y={hourY(9.6)} height={4} color="green" icon />
      {/* Thursday: a focus block overlapping a listening session shares the rail. */}
      <Capsule x={columnLeft(1) + 2} y={hourY(8)} width={6} height={HOUR * 1.1} color="teal" />
      <Capsule x={columnLeft(1) + 10} y={hourY(8.3)} width={6} height={HOUR * 1.4} color="green" />

      <EventShape
        x={EVENT_LEFT(0) + 1}
        y={hourY(8.5)}
        width={EVENT_WIDTH}
        height={HOUR}
        color="blue"
        corners={[6, 6, 6, 6]}
        ring
      >
        <text
          x={EVENT_LEFT(0) + 10}
          y={hourY(8.5) + 10}
          fontSize={9}
          dominantBaseline="central"
          className="font-medium"
        >
          Standup
        </text>
      </EventShape>
      <EventShape
        x={EVENT_LEFT(1) + 1}
        y={hourY(9)}
        width={EVENT_WIDTH}
        height={HOUR}
        color="blue"
        corners={[6, 6, 6, 6]}
        ring
      >
        <text
          x={EVENT_LEFT(1) + 10}
          y={hourY(9) + 10}
          fontSize={9}
          dominantBaseline="central"
          className="font-medium"
        >
          Design review
        </text>
      </EventShape>
    </g>
  );
}

/** A day column's annotation rail: capsules with icons, a dot, shared lanes and a cut end. */
export function AnnotationsAnatomy() {
  return (
    <Anatomy label="Parts of an annotation rail" width={WIDTH} height={HEIGHT} callouts={callouts}>
      <Surface x={0} y={0} width={WIDTH} height={HEIGHT} />
      <GridLine x1={0} x2={WIDTH} y1={HEADER} y2={HEADER} />
      <Header />
      <Body />
      <Marks />
    </Anatomy>
  );
}

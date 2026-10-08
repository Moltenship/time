import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import { Anatomy } from "./anatomy";
import type { AnatomyCallout } from "./layout";
import { GridLine, Surface } from "./shapes";

const WIDTH = 440;
const LIST_HEIGHT = 200;
const EMPTY_TOP = LIST_HEIGHT + 16;
const HEIGHT = EMPTY_TOP + 100;
/** The sticky date column and where items start, scaled from `px-6`, `w-12`, and `gap-6`. */
const DATE_X = 38;
const ITEM_LEFT = 78;
/** Item titles start after the time column (`sm:w-44`). */
const TITLE_X = ITEM_LEFT + 140;
const ITEM_HEIGHT = 28;

const callouts: readonly AnatomyCallout[] = [
  { label: "Agenda view", name: "AgendaView", anchor: [0, 180], side: "left" },
  { label: "Day group header", anchor: [DATE_X - 16, 18], side: "left" },
  { label: "Day group", name: "data-date", anchor: [0, 105], side: "left", span: 70 },
  { label: "All-day badge", anchor: [ITEM_LEFT + 36, 12], side: "top" },
  { label: "Item", name: "AgendaItem", anchor: [WIDTH - 12, 49], side: "right" },
  { label: "Day k of n", name: "dayCount", anchor: [312, 91], side: "right" },
  { label: "Empty state", anchor: [0, EMPTY_TOP + 50], side: "left" },
];

interface Item {
  readonly color: CalendarEventColor;
  /** A time range, or `undefined` for the "All day" badge. */
  readonly time?: string;
  readonly title: string;
  readonly day?: string;
}

const groups: readonly {
  readonly weekday: string;
  readonly day: number;
  readonly today: boolean;
  readonly items: readonly Item[];
}[] = [
  {
    weekday: "THU",
    day: 8,
    today: true,
    items: [
      { color: "blue", title: "Offsite", day: "Day 1 of 2" },
      { color: "purple", time: "9:00 – 9:15 AM", title: "Standup" },
    ],
  },
  {
    weekday: "FRI",
    day: 9,
    today: false,
    items: [
      { color: "blue", title: "Offsite", day: "Day 2 of 2" },
      { color: "teal", time: "12:00 – 12:30 PM", title: "1:1 with Sam" },
    ],
  },
  {
    weekday: "MON",
    day: 12,
    today: false,
    items: [{ color: "green", time: "10:00 – 11:30 AM", title: "Sprint planning" }],
  },
];

const groupTop = (index: number) => index * 70;

function AgendaRow({ item, y }: { readonly item: Item; readonly y: number }) {
  return (
    <g data-color={item.color}>
      <circle cx={ITEM_LEFT + 5} cy={y} r={4} className="fill-calendar-event-border" />
      {item.time === undefined ? (
        <g>
          <rect
            x={ITEM_LEFT + 14}
            y={y - 7}
            width={44}
            height={14}
            rx={7}
            className="fill-calendar-event"
          />
          <text
            x={ITEM_LEFT + 36}
            y={y}
            fontSize={8.5}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-calendar-event-foreground font-medium"
          >
            All day
          </text>
        </g>
      ) : (
        <text
          x={ITEM_LEFT + 16}
          y={y}
          fontSize={10}
          dominantBaseline="central"
          className="fill-muted-foreground tabular-nums"
        >
          {item.time}
        </text>
      )}
      <text
        x={TITLE_X}
        y={y}
        fontSize={10.5}
        dominantBaseline="central"
        className="fill-foreground"
      >
        <tspan className="font-medium">{item.title}</tspan>
        {item.day !== undefined && (
          <tspan dx={8} fontSize={8.5} className="fill-muted-foreground">
            {item.day}
          </tspan>
        )}
      </text>
    </g>
  );
}

function ListFigure() {
  return (
    <g>
      <Surface x={0} y={0} width={WIDTH} height={LIST_HEIGHT} />
      {groups.map(({ day, items, today, weekday }, index) => {
        const top = groupTop(index);
        return (
          <g key={weekday}>
            {index > 0 && <GridLine x1={0} x2={WIDTH} y1={top} y2={top} />}
            <text
              x={DATE_X}
              y={top + 18}
              fontSize={8.5}
              textAnchor="middle"
              dominantBaseline="central"
              className={`font-medium ${today ? "fill-calendar-today" : "fill-muted-foreground"}`}
            >
              {weekday}
            </text>
            {today && <circle cx={DATE_X} cy={top + 38} r={14} className="fill-calendar-today" />}
            <text
              x={DATE_X}
              y={top + 38}
              fontSize={14}
              textAnchor="middle"
              dominantBaseline="central"
              className={`tabular-nums ${today ? "fill-calendar-today-foreground" : "fill-foreground"}`}
            >
              {day}
            </text>
            {items.map((item, row) => (
              <AgendaRow key={item.title} item={item} y={top + 21 + row * ITEM_HEIGHT} />
            ))}
          </g>
        );
      })}
    </g>
  );
}

/** `CalendarX2Icon`, drawn at `size` around (`x`, `y`). */
function EmptyIcon({ x, y }: { readonly x: number; readonly y: number }) {
  return (
    <g
      className="fill-none stroke-muted-foreground opacity-60"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x={x - 10} y={y - 9} width={20} height={19} rx={2.5} />
      <path
        d={`M${x - 10},${y - 3} H${x + 10} M${x - 5},${y - 12} V${y - 6} M${x + 5},${y - 12} V${y - 6}`}
      />
      <path d={`M${x - 3},${y + 1} L${x + 3},${y + 7} M${x + 3},${y + 1} L${x - 3},${y + 7}`} />
    </g>
  );
}

function EmptyFigure() {
  const middle = WIDTH / 2;
  return (
    <g>
      <Surface x={0} y={EMPTY_TOP} width={WIDTH} height={HEIGHT - EMPTY_TOP} />
      <EmptyIcon x={middle} y={EMPTY_TOP + 30} />
      <text
        x={middle}
        y={EMPTY_TOP + 58}
        fontSize={11}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground font-medium"
      >
        No events
      </text>
      <text
        x={middle}
        y={EMPTY_TOP + 76}
        fontSize={9.5}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-muted-foreground"
      >
        Nothing is scheduled for October 12 – 25.
      </text>
    </g>
  );
}

/** Day groups with their date, items, the "All day" badge, and the empty state. */
export function AgendaAnatomy() {
  return (
    <Anatomy label="Parts of the agenda view" width={WIDTH} height={HEIGHT} callouts={callouts}>
      <ListFigure />
      <EmptyFigure />
    </Anatomy>
  );
}

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

// Static stand-in for the live week view; times are decimal hours in the visible 08:00–18:00 range.
const firstHour = 8;
const visibleHours = 10;
const todayIndex = 3;
const nowHour = 11.35;

const days = [
  { name: "Mon", date: 5 },
  { name: "Tue", date: 6 },
  { name: "Wed", date: 7 },
  { name: "Thu", date: 8 },
  { name: "Fri", date: 9 },
  { name: "Sat", date: 10 },
  { name: "Sun", date: 11 },
] as const;

// Small screens show Wednesday to Friday, like a three-day view.
const compactDays = new Set([2, 3, 4]);

interface PreviewEvent {
  readonly day: number;
  readonly start: number;
  readonly end: number;
  readonly title: string;
  readonly time: string;
  readonly tone: "brand" | "neutral";
  readonly lane?: readonly [index: number, count: number];
}

const standups = [0, 1, 2, 3, 4].map(
  (day): PreviewEvent => ({
    day,
    start: 9,
    end: 9.5,
    title: "Standup",
    time: "09:00",
    tone: "neutral",
  }),
);

const events: readonly PreviewEvent[] = [
  ...standups,
  { day: 0, start: 10.5, end: 12, title: "Roadmap review", time: "10:30–12:00", tone: "brand" },
  { day: 0, start: 14, end: 14.75, title: "1:1 with Priya", time: "14:00", tone: "neutral" },
  { day: 1, start: 10, end: 12.5, title: "Focus time", time: "10:00–12:30", tone: "neutral" },
  { day: 1, start: 15, end: 16, title: "Design critique", time: "15:00–16:00", tone: "brand" },
  { day: 2, start: 11, end: 12, title: "Interview", time: "11:00–12:00", tone: "brand" },
  { day: 2, start: 12.5, end: 13.5, title: "Lunch with Ana", time: "12:30–13:30", tone: "neutral" },
  { day: 2, start: 15.5, end: 17, title: "Release planning", time: "15:30–17:00", tone: "brand" },
  {
    day: 3,
    start: 12,
    end: 13.5,
    title: "Pairing",
    time: "12:00–13:30",
    tone: "neutral",
    lane: [0, 2],
  },
  {
    day: 3,
    start: 12.5,
    end: 13.5,
    title: "Code review",
    time: "12:30",
    tone: "neutral",
    lane: [1, 2],
  },
  {
    day: 3,
    start: 15,
    end: 16.5,
    title: "Acme kickoff",
    time: "15:00 · 10:00 New York",
    tone: "brand",
  },
  { day: 4, start: 13, end: 14, title: "Sprint demo", time: "13:00–14:00", tone: "brand" },
  { day: 4, start: 14.25, end: 15, title: "Retro", time: "14:15", tone: "neutral" },
  { day: 5, start: 9.5, end: 11, title: "Run club", time: "09:30–11:00", tone: "neutral" },
];

const allDayEvents = new Map([[2, "Ana's birthday"]]);

const toneClass = {
  brand: "border-brand bg-brand/12 dark:bg-brand/20",
  neutral: "border-fd-muted-foreground/45 bg-fd-muted",
} as const;

const columns =
  "grid-cols-[3rem_repeat(3,minmax(0,1fr))] sm:grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]";

function percent(hours: number) {
  return `${(hours / visibleHours) * 100}%`;
}

function dayColumnClass(index: number) {
  return compactDays.has(index) ? "" : "max-sm:hidden";
}

export default function WeekPreview() {
  return (
    <figure
      aria-label="A week view with meetings from Monday to Sunday"
      className="overflow-hidden rounded-xl border bg-fd-background text-left shadow-2xl shadow-black/5 dark:shadow-black/40"
      role="img"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2.5 sm:px-4">
        <span className="rounded-md border px-2.5 py-1 text-xs font-medium max-sm:hidden">
          Today
        </span>
        <span className="flex text-fd-muted-foreground">
          <ChevronLeftIcon className="size-7 rounded-md p-1.5" />
          <ChevronRightIcon className="size-7 rounded-md p-1.5" />
        </span>
        <span className="text-sm font-semibold whitespace-nowrap sm:text-base">October 2026</span>
        <span className="ml-auto flex rounded-md bg-fd-muted p-0.5 text-xs font-medium text-fd-muted-foreground">
          <span className="px-2 py-1 max-sm:hidden">Day</span>
          <span className="rounded-[5px] bg-fd-background px-2 py-1 text-fd-foreground shadow-xs">
            Week
          </span>
          <span className="px-2 py-1">Month</span>
        </span>
      </div>

      <div className={`grid border-b ${columns}`}>
        <span />
        {days.map((day, index) => (
          <span
            className={`flex flex-col items-center gap-0.5 border-l py-2 ${dayColumnClass(index)}`}
            key={day.name}
          >
            <span className="text-[11px] font-medium tracking-wide text-fd-muted-foreground uppercase">
              {day.name}
            </span>
            <span
              className={`grid size-7 place-items-center rounded-full text-sm font-medium ${
                index === todayIndex ? "bg-brand text-white" : ""
              }`}
            >
              {day.date}
            </span>
          </span>
        ))}
      </div>

      <div className={`grid border-b text-[11px] ${columns}`}>
        <span className="self-center pr-2 text-right text-[10px] text-fd-muted-foreground">
          all-day
        </span>
        {days.map((day, index) => (
          <span className={`min-h-7 border-l p-0.5 ${dayColumnClass(index)}`} key={day.name}>
            {allDayEvents.has(index) ? (
              <span className="block truncate rounded-sm bg-brand px-1.5 py-0.5 font-medium text-white">
                {allDayEvents.get(index)}
              </span>
            ) : null}
          </span>
        ))}
      </div>

      <div className={`grid h-[26rem] sm:h-[30rem] ${columns}`}>
        <div className="relative">
          {Array.from({ length: visibleHours - 1 }, (_, offset) => (
            <span
              className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-fd-muted-foreground tabular-nums"
              key={offset}
              style={{ top: percent(offset + 1) }}
            >
              {String(firstHour + offset + 1).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {days.map((day, index) => (
          <div
            className={`relative border-l bg-[linear-gradient(to_bottom,var(--color-fd-border)_1px,transparent_1px)] bg-size-[100%_10%] ${
              index >= 5 ? "bg-fd-muted/40" : ""
            } ${dayColumnClass(index)}`}
            key={day.name}
          >
            {events
              .filter((event) => event.day === index)
              .map((event) => {
                const [lane, lanes] = event.lane ?? [0, 1];
                // Under 45 minutes there is room for one line, so the time follows the title.
                const singleLine = event.end - event.start < 0.75;
                return (
                  <div
                    className={`absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 leading-tight ${toneClass[event.tone]}`}
                    key={event.title}
                    style={{
                      top: `calc(${percent(event.start - firstHour)} + 1px)`,
                      height: `calc(${percent(event.end - event.start)} - 2px)`,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                    }}
                  >
                    <p className="truncate text-[11px] font-medium">
                      {event.title}
                      {singleLine ? (
                        <span className="ml-1.5 font-normal text-fd-muted-foreground">
                          {event.time}
                        </span>
                      ) : null}
                    </p>
                    {singleLine ? null : (
                      <p className="truncate text-[10px] text-fd-muted-foreground">{event.time}</p>
                    )}
                  </div>
                );
              })}
            {index === todayIndex ? (
              <div
                className="absolute inset-x-0 z-10 h-0.5 bg-brand"
                style={{ top: percent(nowHour - firstHour) }}
              >
                <span className="absolute -top-[5px] -left-1.5 size-3 rounded-full bg-brand" />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </figure>
  );
}

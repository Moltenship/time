import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vite-plus/test";

import { createCalendar } from "../src/index";

interface Meeting {
  readonly id: `meeting-${number}`;
  readonly title: string;
  readonly roomId: `room-${number}`;
}

interface Room {
  readonly id: `room-${number}`;
  readonly capacity: number;
}

const TeamCalendar = createCalendar<Meeting, Room>();

const CapacityView = TeamCalendar.defineView(({ calendar }) => {
  const event = calendar.meta.events[0];
  const resource = calendar.meta.resources.find((room) => room.id === event?.roomId);

  if (event === undefined || resource === undefined) {
    return null;
  }

  return (
    <button
      onClick={() => {
        calendar.actions.inspectEvent(event);
        calendar.actions.inspectResource(resource);
      }}
    >
      {event.title} · {resource.capacity}
    </button>
  );
});

test("factory generics reach a public custom view and compound render callback", () => {
  const events: readonly Meeting[] = [
    { id: "meeting-1", title: "Architecture review", roomId: "room-1" },
  ];
  const resources: readonly Room[] = [{ id: "room-1", capacity: 8 }];

  const markup = renderToStaticMarkup(
    <TeamCalendar.Root
      events={events}
      resources={resources}
      view="capacity"
      anchorDate="2026-08-15"
    >
      <TeamCalendar.Frame>
        <TeamCalendar.Toolbar>
          <TeamCalendar.Title />
        </TeamCalendar.Toolbar>
        <TeamCalendar.Viewport>
          <TeamCalendar.CustomView view={CapacityView} />
          <TeamCalendar.Event eventIndex={0} resourceIndex={0}>
            {({ event, resource }) => (
              <span>
                {event.title}:{resource?.capacity}
              </span>
            )}
          </TeamCalendar.Event>
        </TeamCalendar.Viewport>
      </TeamCalendar.Frame>
    </TeamCalendar.Root>,
  );

  expect(markup).toContain("Architecture review · 8");
  expect(markup).toContain("Architecture review:8");
  expect(markup).toContain("capacity");
});

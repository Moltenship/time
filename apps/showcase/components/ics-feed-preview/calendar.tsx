import { parseIcs } from "@moltenship/ics";
import { useState } from "react";

import { fromFeedJson } from "@/content/examples/feed-calendar";
import { toFeedEvents } from "@/content/examples/feed-events";

import LiveCalendar from "../calendar-preview/calendar";
import { currentPreviewFeed } from "./feed";

/** The sample feed, parsed and mapped as the guide does, in the preview's live week view. */
export default function IcsFeedCalendar() {
  const [events] = useState(() => {
    const viewerTimeZone = Temporal.Now.timeZoneId();
    const { calendars } = parseIcs(currentPreviewFeed());
    return calendars
      .flatMap((calendar) => toFeedEvents(calendar, viewerTimeZone))
      .map((event) => fromFeedJson(event));
  });

  return <LiveCalendar events={events} view="week" />;
}

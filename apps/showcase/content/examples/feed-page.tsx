// #region page
// app/team/page.tsx (a Server Component)
import { parseIcs } from "@moltenship/ics";
import { cacheLife } from "next/cache";
import { connection } from "next/server";
import { Suspense } from "react";

import { FeedCalendar } from "./feed-calendar";
import { toFeedEvents, type FeedEventJson } from "./feed-events";

const feedUrl = "https://calendar.example.com/team/basic.ics";

async function getFeedEvents(timeZone: string): Promise<readonly FeedEventJson[]> {
  "use cache";
  cacheLife("hours"); // fetch the feed again at most once an hour

  const response = await fetch(feedUrl);
  if (!response.ok) throw new Error(`The feed answered ${response.status}`);

  const { calendars, issues } = parseIcs(await response.text());
  for (const issue of issues) {
    console.warn(`${feedUrl}, line ${issue.line ?? "?"}: ${issue.message}`);
  }
  return calendars.flatMap((calendar) => toFeedEvents(calendar, timeZone));
}

export default function TeamPage() {
  return (
    <Suspense fallback={<p>Loading the team calendar…</p>}>
      <TeamFeed />
    </Suspense>
  );
}

async function TeamFeed() {
  await connection(); // render on each request, for a fresh `now`

  // The viewer's time zone, for example from their profile or a cookie.
  const timeZone = "Europe/Berlin";
  const events = await getFeedEvents(timeZone);

  return (
    <FeedCalendar events={events} now={Temporal.Now.instant().toString()} timeZone={timeZone} />
  );
}
// #endregion page

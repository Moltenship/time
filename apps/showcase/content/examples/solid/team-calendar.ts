// #region calendar
import { createCalendar } from "@moltenship/calendar-solid";

import { eventAdapter, listView, type Meeting } from "./calendar";
import { monthView } from "./month";

// The first view is the one a calendar opens in.
export const TeamCalendar = createCalendar<Meeting>()({
  eventAdapter,
  views: [listView, monthView],
});

export type TeamView = (typeof TeamCalendar.views)[number]["name"]; // "list" | "month"
// #endregion calendar

// #region snapshots
import { createEventSnapshotCache } from "@moltenship/calendar-solid";

import { seed as events } from "./app";
import { eventAdapter } from "./calendar";

const snapshots = createEventSnapshotCache(eventAdapter, { queryCacheSize: 128 });
const snapshot = snapshots.getSnapshot(events);

console.log(snapshots.getSnapshot(events) === snapshot); // true while `events` is the same array
// #endregion snapshots

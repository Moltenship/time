// #region ids
import { isEventId } from "@moltenship/calendar-solid";

isEventId("booking-12"); // true
isEventId(""); // false
isEventId(Number.NaN); // false
// #endregion ids

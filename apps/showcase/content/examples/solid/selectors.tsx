// #region selector
import { Calendar } from "./calendar";

export function ViewName() {
  const view = Calendar.useCalendarSelector((state) => state.view);
  return <span>{view()}</span>;
}
// #endregion selector

// #region equal
export function usePosition() {
  return Calendar.useCalendarSelector(
    (state) => ({ view: state.view, anchorDate: state.anchorDate }),
    { isEqual: (a, b) => a.view === b.view && a.anchorDate.equals(b.anchorDate) },
  );
}
// #endregion equal

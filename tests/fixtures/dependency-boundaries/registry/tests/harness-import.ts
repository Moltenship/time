// The registry's tests may use the facade and the test harness, never the packages behind them:
// the boundary test expects only the core import to fail.
import "@moltenship/calendar";
import "@moltenship/calendar-testing";
import "@moltenship/calendar-core";

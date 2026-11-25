// The Solid integration's tests reaching for the React side of the repository: the boundary test
// expects every import but the first five to fail.
import "@moltenship/calendar-solid";
import "@moltenship/calendar-primitives";
import "@moltenship/calendar-dnd";
import "@ui-sdk/solid/agent";
import "solid-js";
import "@moltenship/calendar-react";
import "@moltenship/calendar";
import "@moltenship/calendar-dnd-kit";
import "@moltenship/calendar-testing";
import "@ui-sdk/react/agent";

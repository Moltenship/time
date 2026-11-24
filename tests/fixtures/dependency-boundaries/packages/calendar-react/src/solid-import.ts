// The React integration reaching for Solid and the Solid integration: the boundary test expects
// every import but the first three to fail.
import "@moltenship/calendar-primitives";
import "@ui-sdk/react";
import "react";
import "@moltenship/calendar-solid";
import "solid-js";
import "@ui-sdk/solid";
